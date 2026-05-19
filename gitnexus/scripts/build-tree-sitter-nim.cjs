#!/usr/bin/env node
/*
 * Builds the vendored tree-sitter-nim native binding at gitnexus postinstall.
 *
 * Unlike the other vendored grammars, tree-sitter-nim's generated `src/parser.c`
 * is ~65MB (Nim's grammar has 20,305 parser states). Committing it would bloat
 * git history permanently, so it is NOT vendored. Instead this script
 * regenerates it from `grammar.js` + `scanner.c` via `tree-sitter generate`
 * (~49s, deterministic — byte-identical to upstream), then compiles the binding.
 *
 * Generation targets ABI 14, which the bundled tree-sitter@0.21.1 runtime
 * supports. Both steps are guarded: if the `.node` binary already exists the
 * script exits immediately, so a warm `node_modules` pays the cost only once.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Opt-out: skip the build entirely. Nim parsing becomes unavailable but
// `npm install gitnexus` finishes faster on machines without a toolchain.
// Strict `=== '1'` only — any other value falls through to the build.
if (process.env.GITNEXUS_SKIP_OPTIONAL_GRAMMARS === '1') {
  console.warn(
    '[tree-sitter-nim] Skipping build (GITNEXUS_SKIP_OPTIONAL_GRAMMARS=1). Nim parsing will be unavailable until reinstalled without the env var.',
  );
  process.exit(0);
}

const nimDir = path.join(__dirname, '..', 'node_modules', 'tree-sitter-nim');
const grammarJs = path.join(nimDir, 'grammar.js');
const parserC = path.join(nimDir, 'src', 'parser.c');
const bindingNode = path.join(nimDir, 'build', 'Release', 'tree_sitter_nim_binding.node');

try {
  // Already built — nothing to do.
  if (fs.existsSync(bindingNode)) {
    process.exit(0);
  }

  // Vendored package missing (e.g. installed with --no-optional).
  if (!fs.existsSync(grammarJs)) {
    console.warn(
      '[tree-sitter-nim] Skipping build: vendored grammar not found at %s.',
      nimDir,
    );
    process.exit(0);
  }

  // Build deps must be resolvable (hoisted into gitnexus optionalDependencies).
  try {
    require.resolve('node-addon-api');
    require.resolve('node-gyp-build');
  } catch (resolveErr) {
    console.warn(
      '[tree-sitter-nim] Skipping build: hoisted build deps not resolvable (%s).',
      resolveErr.message,
    );
    console.warn(
      '[tree-sitter-nim] Nim parsing will be unavailable. Non-Nim functionality is unaffected.',
    );
    process.exit(0);
  }

  // Step 1 — regenerate parser.c (~49s) if it is not already present.
  if (!fs.existsSync(parserC)) {
    const tsBin = path.join(
      __dirname,
      '..',
      'node_modules',
      '.bin',
      process.platform === 'win32' ? 'tree-sitter.cmd' : 'tree-sitter',
    );
    if (!fs.existsSync(tsBin)) {
      console.warn(
        '[tree-sitter-nim] Skipping build: `tree-sitter-cli` not installed ' +
          '(optionalDependency). Reinstall with optional deps enabled to build Nim support.',
      );
      process.exit(0);
    }
    console.log('[tree-sitter-nim] Generating parser.c (tree-sitter generate, ~49s)...');
    execSync(`"${tsBin}" generate --abi=14`, {
      cwd: nimDir,
      stdio: 'pipe',
      timeout: 300000,
    });
  }

  // Step 2 — compile the native binding (~4s).
  console.log('[tree-sitter-nim] Building native binding...');
  execSync('npx node-gyp rebuild', {
    cwd: nimDir,
    stdio: 'pipe',
    timeout: 180000,
  });
  console.log('[tree-sitter-nim] Native binding built successfully');
} catch (err) {
  console.warn('[tree-sitter-nim] Could not build native binding:', err.message);
  console.warn(
    '[tree-sitter-nim] Nim parsing will be unavailable. Non-Nim functionality is unaffected.',
  );
  process.exit(0);
}
