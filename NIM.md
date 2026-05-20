# GitNexus — Nim language support

This fork of [`abhigyanpatwari/GitNexus`](https://github.com/abhigyanpatwari/GitNexus)
adds first-class indexing for the [Nim programming language](https://nim-lang.org/),
integrating the [`alaviss/tree-sitter-nim`](https://github.com/alaviss/tree-sitter-nim)
grammar through GitNexus's existing `LanguageProvider` interface.

| | |
|---|---|
| Branch | `feat/nim-language-support` |
| Upstream base | `abhigyanpatwari/GitNexus@55f8d442` |
| Grammar | `alaviss/tree-sitter-nim@0.6.2` (ABI 14) |
| Validated on | `status/nwaku` (`waku/` subtree — 294 `.nim` files → 6,696 nodes / 11,934 edges in 5.8 s) |

## What it indexes

Every `.nim`, `.nims`, and `.nimble` file in your repo is parsed by
tree-sitter-nim. The resulting graph captures:

| Nim construct | Graph node | Notes |
|---|---|---|
| `proc` / `func` / `iterator` / `template` / `macro` / `converter` / `method` | `Function` | `method` is unified with `Function` — in Nim it is a dispatched routine, not a class member. |
| `type Foo = object` / `ref object` / `ptr object` | `Class` | All three forms recognised; fields owned by the class via `HAS_PROPERTY`. |
| `type Foo = enum` | `Enum` | |
| `type Foo = concept` | `Interface` | |
| `type Foo = distinct ...` / tuple / proc type / alias | `Class` | (catch-all) |
| `let` / `var` / `const` sections | `Variable` / `Const` | |
| Object fields | `Property` | |
| Object inheritance (`of Base`) | `EXTENDS` edge | through ref/ptr wrappers too. |
| `import M` / `from M import x, y` / `include` | `IMPORTS` edge | `.nim` / `.nims` resolved through GitNexus's suffix resolver. |
| Free calls and UFCS dot-calls | `CALLS` edge | resolved to the enclosing routine; constructor-style calls (`Dog(...)`) link to the class. |
| Overloaded routines | distinct nodes per signature | parameter-type sequence appended to the node ID (`makeSound~Animal`, `~Dog`, `~Cat`). |

Export visibility (`*`) is honoured for every symbol — graph node names do
**not** carry the asterisk, but the export flag is set.

## Installing

### Requirements

- Node.js 20+
- A C/C++ toolchain (`cc` / `clang` / MSVC). Same prerequisite GitNexus
  already has for `tree-sitter-c`, `tree-sitter-cpp`, etc.
- ~49 s of CPU time on first install — see *Why the postinstall is slow*
  below.
- Disk: ~85 MB during install (the generated `parser.c` is 65 MB); ~9 MB
  steady-state once built.

### Install (development / local testing)

```bash
git clone -b feat/nim-language-support https://github.com/NagyZoltanPeter/GitNexus.git ~/dev/gitnexus-fork
cd ~/dev/gitnexus-fork/gitnexus-shared && npm install
cd ../gitnexus && npm install      # runs `tree-sitter generate --abi=14` + node-gyp build
npm run build
npm link                           # makes `gitnexus` resolvable globally
```

`npm link` replaces any existing `gitnexus` binary on your `PATH`. To
revert: `cd gitnexus && npm unlink && npm install -g gitnexus@latest`.

### Skip the Nim build

If the C toolchain is missing or you do not need Nim:

```bash
GITNEXUS_SKIP_OPTIONAL_GRAMMARS=1 npm install
```

GitNexus then starts without Nim support and skips `.nim` files at index
time, exactly like Swift/Dart/Kotlin when those optional dependencies are
absent.

### Wire into Claude Code

Tell Claude Code to use the linked binary by adding an MCP server entry:

```json
// ~/.claude.json — user scope, applies everywhere
{
  "mcpServers": {
    "gitnexus": {
      "command": "/opt/homebrew/bin/gitnexus",
      "args": ["mcp"]
    }
  }
}
```

If a project has its own `.mcp.json` that points at `npx gitnexus@latest`,
replace that entry with the same command — npx ignores `npm link` and would
otherwise pull a stale published copy.

Restart Claude Code. `claude mcp list` should show
`gitnexus: /opt/homebrew/bin/gitnexus mcp - ✓ Connected`.

From any Nim repo run `gitnexus analyze` (or `npx gitnexus analyze`); then
query the graph via the MCP tools or `gitnexus cypher`.

### Dev loop after `npm link`

Edit code in the fork → `cd gitnexus && npm run build` → restart Claude Code
(or restart only the `gitnexus` MCP server). The symlink means no reinstall.

## Validation

Indexed the full Nim source tree of `status/nwaku` (`waku/` subtree, 294
files, 5.8 s):

| | |
|---|---|
| Nodes | 6,696 — 1,674 `Function`, 402 `Class`, 44 `Enum`, 1,135 `Property`, 244 `Const`, 2,139 `Variable` |
| Edges | 11,934 — 5,838 `DEFINES`, 1,873 `CALLS`, 1,094 `HAS_PROPERTY`, 382 `IMPORTS`, 20 `EXTENDS` |
| Process flows | 274 |
| Symbol names leaking `*` | 0 |

Cross-language regression: 6,056 / 6,056 GitNexus unit tests still pass on
this branch. Every shared-code change (the type-declaration handler in
`findEnclosingClassInfo`, the routine-types in `FUNCTION_NODE_TYPES`, the
`.nim` entry in the import-resolver `EXTENSIONS`, the
`overloadDisambiguator` hook) is additive — non-Nim graphs come out
byte-identical to upstream.

## Architecture

The integration lives in five places — anyone familiar with GitNexus's
language-provider pattern will recognise the layout:

| File | Purpose |
|---|---|
| `gitnexus-shared/src/languages.ts` | `SupportedLanguages.Nim` enum member |
| `gitnexus-shared/src/language-detection.ts` | `.nim` / `.nims` / `.nimble` extension map |
| `gitnexus/vendor/tree-sitter-nim/` | grammar source — *generated `parser.c` is NOT committed*; it is regenerated at install (see below) |
| `gitnexus/scripts/build-tree-sitter-nim.cjs` | postinstall: `tree-sitter generate --abi=14` then `node-gyp rebuild` |
| `gitnexus/src/core/ingestion/languages/nim.ts` | the `LanguageProvider` (queries, exports, calls, heritage, fields, methods, overload disambiguator) |
| `gitnexus/src/core/ingestion/tree-sitter-queries.ts` | `NIM_QUERIES` (S-expression captures) |
| `gitnexus/src/core/ingestion/{call,class,field,method,variable,heritage,import-resolvers}-extractors/configs/nim.ts` | extractor configs |

### Why the postinstall is slow

`tree-sitter-nim`'s grammar is one of the largest published — 20,305 parser
states, producing a 65 MB `src/parser.c`. Committing it would bloat git
history forever, so this fork vendors only the 73 KB of source needed
(`grammar.js` + `scanner.c` + headers) and regenerates `parser.c` from
those at install via `tree-sitter generate --abi=14`. The output is
byte-identical to upstream and ABI 14 is compatible with the
`tree-sitter@0.21.1` runtime GitNexus already uses.

| Step | Time | Skippable? |
|---|---|---|
| `npm install` proper | a few seconds | — |
| `tree-sitter generate --abi=14` | ~49 s (CPU-bound) | once per `node_modules`; cached afterwards |
| `node-gyp rebuild` of the native binding | ~4 s | once per platform |

After the first install the binding is cached in
`node_modules/tree-sitter-nim/build/Release/`; subsequent `npm install`s
detect it and exit immediately.

### How overloads are disambiguated

GitNexus historically assumed top-level routines do not overload — that
holds for Go / Rust / Java / etc. Nim breaks it: 14 % of routine names in
Waku are overloaded, 123 in the same file. Without disambiguation they all
collapse to one graph node and overloaded calls drop.

A new optional `LanguageProvider.overloadDisambiguator(node) => string`
hook returns a stable parameter-type tag — `~Animal`, `~int,string`, etc.
It is appended at all six node-ID generation sites (definition phase in
`parsing-processor.ts` and the duplicate in `parse-worker.ts`, and the four
enclosing-function-ID recompute sites in `call-processor.ts` and
`parse-worker.ts`). The hook is undefined for every other language, so
their IDs remain byte-identical.

Nim's `typeConfig.inferLiteralType` then lets the call resolver build
`OverloadHints` and reuse the existing `matchCandidatesByArgTypes` to pick
the right overload from argument types.

## Known gaps

| Gap | Workaround | Where to start |
|---|---|---|
| Free call whose argument is a plain identifier bound to a user type (e.g. `makeSound(a)` where `a: Animal`) does not always disambiguate — literal-typed and known-type overloaded calls do resolve. | Use the receiver-typed form where possible; or treat overloaded-call edges as best-effort. | `call-processor.ts` → `tryOverloadDisambiguation`; the path through the scoped `TypeEnv` needs the Nim `parameter_declaration` binding to surface for the call site's argument identifiers. |
| `method` dispatch is dynamic; the graph currently links a call to the single arity/type match. | Acceptable for static call-graph navigation; flag as a Phase 5 item if precise dynamic-dispatch over-approximation is needed. | Same path; would need an "emit-edges-to-all-subtype-overloads" mode. |
| `typedesc[X]` parameter types render as `~typeX` in node-ID keys. | Internal IDs only; uniqueness is intact. | Cosmetic. |
| `from M import x as y` named-binding aliases are not tracked. | Use direct imports. | `named-bindings/` (new file would mirror `named-bindings/rust.ts`). |
| Generic type instantiation (`Foo[T]` at call sites) is not propagated through `TypeEnv`. | Same as the identifier-arg gap. | `type-extractors/nim.ts` would need a generic-aware extractor. |

## Contributing

Issues and PRs against this fork are welcome. The branch tracks upstream
loosely; rebasing on top of `abhigyanpatwari/GitNexus@main` is straight-
forward because every change either lives under `*nim*` paths or is
additive (`SupportedLanguages` enum, `EXTENSIONS`, `FUNCTION_NODE_TYPES`,
the `overloadDisambiguator` hook).

A clean run of the test suite is the bar:

```bash
cd gitnexus
npm test           # 6,056 unit tests
npm run test:integration   # ~10 min, runs the per-language resolver suite
```

## License

Same as upstream — PolyForm Noncommercial 1.0.0. The vendored
`tree-sitter-nim` grammar is MPL-2.0; see `gitnexus/vendor/tree-sitter-nim/LICENSE.txt`.
