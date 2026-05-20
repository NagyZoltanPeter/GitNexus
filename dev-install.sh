#!/usr/bin/env bash
# dev-install.sh
#
# Build + activate the Nim-supporting GitNexus fork DIRECTLY from this checkout.
# No clone, no git operations — operates on the working tree this script lives in.
# Companion of install-gitnexus-nim.sh, which clones from GitHub for colleagues;
# use this one when YOU are iterating on the fork's code.
#
# What it does
#   1. Locates the repo root (the directory containing this script).
#   2. (optional) npm install in gitnexus-shared and gitnexus.
#         First run regenerates tree-sitter-nim/src/parser.c (~49 s) and builds
#         the native binding (~4 s). Subsequent runs are seconds.
#   3. npm run build.
#   4. npm link so `gitnexus` resolves globally to THIS working tree.
#   5. Patches ~/.claude.json so the Claude Code MCP server "gitnexus" runs
#      the linked binary (backup made first; disable with --no-mcp).
#
# Usage
#   ./dev-install.sh                    # full install (deps + build + link + mcp)
#   ./dev-install.sh --rebuild-only     # skip npm install — fast inner dev loop
#   ./dev-install.sh --clean            # wipe node_modules + dist first
#   ./dev-install.sh --skip-nim-build   # GITNEXUS_SKIP_OPTIONAL_GRAMMARS=1
#   ./dev-install.sh --no-link          # don't run npm link
#   ./dev-install.sh --no-mcp           # don't touch ~/.claude.json
#   ./dev-install.sh --mcp-config <p>   # use a different Claude config file
#   ./dev-install.sh --help

set -euo pipefail

# ---- Locate repo root from the script's own path --------------------------

SCRIPT_PATH=$( (cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P) )/$(basename "${BASH_SOURCE[0]}")
REPO_ROOT=$(dirname "${SCRIPT_PATH}")

# ---- Defaults -------------------------------------------------------------

MCP_CONFIG="${HOME}/.claude.json"
REBUILD_ONLY=0
CLEAN=0
SKIP_NIM_BUILD=0
DO_LINK=1
DO_MCP=1

# ---- ANSI helpers ---------------------------------------------------------

if [ -t 1 ]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; GREEN=$'\033[32m'
  YELLOW=$'\033[33m'; CYAN=$'\033[36m'; RESET=$'\033[0m'
else
  BOLD=''; DIM=''; RED=''; GREEN=''; YELLOW=''; CYAN=''; RESET=''
fi

say()  { printf '%s==>%s %s\n' "${CYAN}" "${RESET}" "$*"; }
warn() { printf '%s!!%s  %s\n' "${YELLOW}" "${RESET}" "$*" >&2; }
die()  { printf '%sERROR:%s %s\n' "${RED}" "${RESET}" "$*" >&2; exit 1; }

# ---- Argument parsing -----------------------------------------------------

while [ $# -gt 0 ]; do
  case "$1" in
    --rebuild-only)    REBUILD_ONLY=1; shift ;;
    --clean)           CLEAN=1; shift ;;
    --skip-nim-build)  SKIP_NIM_BUILD=1; shift ;;
    --no-link)         DO_LINK=0; shift ;;
    --no-mcp)          DO_MCP=0; shift ;;
    --mcp-config)      MCP_CONFIG="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,30p' "$0"
      exit 0
      ;;
    *) die "unknown argument: $1 (use --help)" ;;
  esac
done

# ---- Sanity-check we're sitting in the fork -------------------------------

[ -d "${REPO_ROOT}/gitnexus"        ] || die "${REPO_ROOT}/gitnexus not found — is this script in the fork root?"
[ -d "${REPO_ROOT}/gitnexus-shared" ] || die "${REPO_ROOT}/gitnexus-shared not found — is this script in the fork root?"

# ---- Prerequisite checks --------------------------------------------------

command -v node >/dev/null 2>&1 || die "Node.js 20+ is required."
command -v npm  >/dev/null 2>&1 || die "npm is required."

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "${NODE_MAJOR}" -lt 20 ]; then
  die "Node.js ${NODE_MAJOR} found; this fork needs Node 20 or newer."
fi

if [ "${REBUILD_ONLY}" -eq 0 ] && [ "${SKIP_NIM_BUILD}" -eq 0 ]; then
  if ! command -v cc >/dev/null 2>&1 && ! command -v clang >/dev/null 2>&1; then
    warn "No C compiler found. The Nim grammar will fail to build."
    warn "Either install one (macOS: xcode-select --install; Debian: apt install build-essential python3),"
    warn "or re-run with --skip-nim-build to disable Nim support."
    exit 1
  fi
fi

say "Repo root:   ${REPO_ROOT}"

# ---- Clean (optional) -----------------------------------------------------

if [ "${CLEAN}" -eq 1 ]; then
  say "Cleaning node_modules, dist, and TypeScript build info"
  # Why tsconfig.tsbuildinfo: gitnexus-shared has `composite: true`. TS writes
  # its incremental cache to tsconfig.tsbuildinfo at the project root (NOT
  # under dist). Wiping only dist leaves a stale build-info that tells tsc
  # "everything is already emitted", so the next build is a silent no-op and
  # gitnexus's tsc then fails to resolve `gitnexus-shared`.
  rm -rf "${REPO_ROOT}/gitnexus-shared/node_modules" \
         "${REPO_ROOT}/gitnexus-shared/dist" \
         "${REPO_ROOT}/gitnexus/node_modules" \
         "${REPO_ROOT}/gitnexus/dist"
  rm -f  "${REPO_ROOT}/gitnexus-shared/tsconfig.tsbuildinfo" \
         "${REPO_ROOT}/gitnexus/tsconfig.tsbuildinfo"
fi

# ---- Install deps (skipped in --rebuild-only) -----------------------------

export_skip=""
if [ "${SKIP_NIM_BUILD}" -eq 1 ]; then
  export GITNEXUS_SKIP_OPTIONAL_GRAMMARS=1
  export_skip="GITNEXUS_SKIP_OPTIONAL_GRAMMARS=1 "
  warn "Skipping Nim grammar build (GITNEXUS_SKIP_OPTIONAL_GRAMMARS=1)."
fi

if [ "${REBUILD_ONLY}" -eq 0 ]; then
  say "Installing gitnexus-shared deps"
  (cd "${REPO_ROOT}/gitnexus-shared" && npm install --no-audit --no-fund)

  say "Installing gitnexus deps  ${DIM}(first run regenerates parser.c — ~49 s)${RESET}"
  (cd "${REPO_ROOT}/gitnexus" && ${export_skip}npm install --no-audit --no-fund)
else
  say "${DIM}--rebuild-only — skipping npm install${RESET}"
fi

# ---- Build ----------------------------------------------------------------

say "Building gitnexus"
(cd "${REPO_ROOT}/gitnexus" && npm run build)

# ---- Link globally --------------------------------------------------------

if [ "${DO_LINK}" -eq 1 ]; then
  say "Linking 'gitnexus' globally  ${DIM}(npm link)${RESET}"
  (cd "${REPO_ROOT}/gitnexus" && npm link)
  linked_path=$(command -v gitnexus || true)
  if [ -n "${linked_path}" ]; then
    say "${GREEN}gitnexus${RESET} -> ${linked_path}"
    gitnexus --version || true
  else
    warn "npm link succeeded but 'gitnexus' is not on PATH. Add \$(npm prefix -g)/bin to your PATH."
  fi
fi

# ---- Patch Claude Code MCP config -----------------------------------------

GITNEXUS_BIN="$(command -v gitnexus 2>/dev/null || true)"
if [ -z "${GITNEXUS_BIN}" ]; then
  # npm-link skipped or PATH miss — use the dist entry point directly.
  GITNEXUS_BIN="${REPO_ROOT}/gitnexus/dist/cli/index.js"
fi

if [ "${DO_MCP}" -eq 1 ]; then
  say "Patching Claude Code MCP config  ${DIM}(${MCP_CONFIG})${RESET}"
  GITNEXUS_BIN="${GITNEXUS_BIN}" MCP_CONFIG="${MCP_CONFIG}" node - <<'NODE'
const fs = require('fs');
const file = process.env.MCP_CONFIG;
const bin = process.env.GITNEXUS_BIN;

const isJs = bin.endsWith('.js');
const entry = isJs
  ? { command: 'node', args: [bin, 'mcp'] }
  : { command: bin,    args: ['mcp']     };

let cfg = {};
if (fs.existsSync(file)) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
    cfg = raw.trim() ? JSON.parse(raw) : {};
  } catch (err) {
    console.error(`refused to overwrite ${file}: not valid JSON (${err.message}).`);
    console.error('Edit the file by hand or remove it, then re-run with --no-mcp or fix.');
    process.exit(2);
  }
  const backup = `${file}.bak-${Date.now()}`;
  fs.copyFileSync(file, backup);
  console.log(`  backed up existing config -> ${backup}`);
}

cfg.mcpServers = cfg.mcpServers || {};
const prev = cfg.mcpServers.gitnexus;
cfg.mcpServers.gitnexus = entry;

const tmp = `${file}.tmp.${process.pid}`;
fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2) + '\n', { mode: 0o600 });
fs.renameSync(tmp, file);

if (prev) {
  console.log(`  replaced previous gitnexus entry: ${JSON.stringify(prev)}`);
} else {
  console.log('  added new gitnexus entry.');
}
console.log(`  command: ${entry.command} ${entry.args.join(' ')}`);
NODE
  say "${GREEN}Claude config updated.${RESET}"
else
  say "Skipped Claude MCP config update (--no-mcp). See banner below for the snippet."
fi

# ---- Done — next steps ----------------------------------------------------

if [[ "${GITNEXUS_BIN}" == *.js ]]; then
  PROJECT_MCP_SNIPPET="\"command\": \"node\", \"args\": [\"${GITNEXUS_BIN}\", \"mcp\"]"
else
  PROJECT_MCP_SNIPPET="\"command\": \"${GITNEXUS_BIN}\", \"args\": [\"mcp\"]"
fi

cat <<EOF

${BOLD}${GREEN}Done.${RESET}

${BOLD}Next${RESET}
  1. Restart Claude Code (or restart only the gitnexus MCP server).
  2. Verify:   ${DIM}claude mcp list${RESET}   →  expect '${BOLD}gitnexus${RESET}: ... - ✓ Connected'
  3. Inside a Nim repo:   ${DIM}gitnexus analyze${RESET}

${BOLD}Inner dev loop${RESET}
After editing source under gitnexus/src/, re-run:

  ${DIM}./dev-install.sh --rebuild-only${RESET}

  (skips npm install, just rebuilds and re-links; ~3 s)

${BOLD}Project-scope overrides${RESET}
If a repo you work in has its own ${BOLD}.mcp.json${RESET} that points at
'npx -y gitnexus@latest mcp', edit it to use this binary instead:

  ${PROJECT_MCP_SNIPPET}

${BOLD}Docs${RESET}        ${REPO_ROOT}/NIM.md
${BOLD}Revert${RESET}      cd ${REPO_ROOT}/gitnexus && npm unlink
            npm install -g gitnexus@latest

EOF
