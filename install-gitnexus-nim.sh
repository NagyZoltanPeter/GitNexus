#!/usr/bin/env bash
# install-gitnexus-nim.sh
#
# One-shot installer for the Nim-supporting fork of GitNexus.
#   https://github.com/NagyZoltanPeter/GitNexus  (branch: feat/nim-language-support)
#
# What it does
#   1. Clones (or updates) the fork at INSTALL_DIR.
#   2. Installs JS deps for gitnexus-shared and gitnexus.
#   3. Runs gitnexus's postinstall — `tree-sitter generate --abi=14` followed by
#      `node-gyp rebuild` on the Nim binding (~49 s + ~4 s, once per node_modules).
#   4. Builds the gitnexus CLI.
#   5. `npm link`s it so `gitnexus` resolves globally.
#   6. Patches ~/.claude.json so the Claude Code MCP server entry named
#      "gitnexus" runs the freshly-installed binary (backup made first).
#      Disable with --no-mcp.
#
# Prerequisites
#   - Node.js 20+ and npm.
#   - A C/C++ toolchain (cc/clang/MSVC + python3 + make) — same as upstream
#     GitNexus needs for tree-sitter-c, tree-sitter-cpp, etc. On macOS this is
#     `xcode-select --install`; on Debian/Ubuntu it is `build-essential python3`.
#
# Usage
#   ./install-gitnexus-nim.sh                       # defaults
#   ./install-gitnexus-nim.sh --dir ~/code/gnx-nim  # custom clone location
#   ./install-gitnexus-nim.sh --skip-nim-build      # install without Nim support
#   ./install-gitnexus-nim.sh --no-link             # don't run `npm link`
#   ./install-gitnexus-nim.sh --no-mcp               # don't touch ~/.claude.json
#   ./install-gitnexus-nim.sh --mcp-config <path>    # use a different Claude config file
#   ./install-gitnexus-nim.sh --update               # pull and rebuild an existing clone
#   ./install-gitnexus-nim.sh --help

set -euo pipefail

# ---- Defaults -------------------------------------------------------------

REPO_URL="https://github.com/NagyZoltanPeter/GitNexus.git"
BRANCH="feat/nim-language-support"
INSTALL_DIR="${HOME}/dev/gitnexus-nim"
MCP_CONFIG="${HOME}/.claude.json"
DO_LINK=1
DO_MCP=1
SKIP_NIM_BUILD=0
UPDATE_ONLY=0

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
    --dir)             INSTALL_DIR="$2"; shift 2 ;;
    --branch)          BRANCH="$2"; shift 2 ;;
    --skip-nim-build)  SKIP_NIM_BUILD=1; shift ;;
    --no-link)         DO_LINK=0; shift ;;
    --no-mcp)          DO_MCP=0; shift ;;
    --mcp-config)      MCP_CONFIG="$2"; shift 2 ;;
    --update)          UPDATE_ONLY=1; shift ;;
    -h|--help)
      sed -n '2,32p' "$0"
      exit 0
      ;;
    *) die "unknown argument: $1 (use --help)" ;;
  esac
done

# ---- Prerequisite checks --------------------------------------------------

command -v git  >/dev/null 2>&1 || die "git is required."
command -v node >/dev/null 2>&1 || die "Node.js 20+ is required (https://nodejs.org)."
command -v npm  >/dev/null 2>&1 || die "npm is required."

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "${NODE_MAJOR}" -lt 20 ]; then
  die "Node.js ${NODE_MAJOR} found; this fork needs Node 20 or newer."
fi

if [ "${SKIP_NIM_BUILD}" -eq 0 ]; then
  if ! command -v cc >/dev/null 2>&1 && ! command -v clang >/dev/null 2>&1; then
    warn "No C compiler found. The Nim grammar will fail to build."
    warn "Either install one (macOS: xcode-select --install; Debian: apt install build-essential python3),"
    warn "or re-run with --skip-nim-build to disable Nim support."
    exit 1
  fi
  command -v python3 >/dev/null 2>&1 \
    || warn "python3 not found on PATH; node-gyp may fail. Install it before continuing if you hit a build error."
fi

# ---- Clone or update ------------------------------------------------------

if [ -d "${INSTALL_DIR}/.git" ]; then
  say "Updating existing clone at ${INSTALL_DIR}"
  git -C "${INSTALL_DIR}" fetch origin "${BRANCH}"
  git -C "${INSTALL_DIR}" checkout "${BRANCH}"
  git -C "${INSTALL_DIR}" pull --ff-only origin "${BRANCH}"
elif [ "${UPDATE_ONLY}" -eq 1 ]; then
  die "--update specified but ${INSTALL_DIR} is not a git clone."
else
  if [ -e "${INSTALL_DIR}" ]; then
    die "${INSTALL_DIR} already exists and is not a git clone. Remove it or pass --dir <other>."
  fi
  say "Cloning ${REPO_URL} (branch ${BRANCH}) into ${INSTALL_DIR}"
  git clone --branch "${BRANCH}" "${REPO_URL}" "${INSTALL_DIR}"
fi

# ---- Install dependencies -------------------------------------------------

export_skip=""
if [ "${SKIP_NIM_BUILD}" -eq 1 ]; then
  export GITNEXUS_SKIP_OPTIONAL_GRAMMARS=1
  export_skip="GITNEXUS_SKIP_OPTIONAL_GRAMMARS=1 "
  warn "Skipping Nim grammar build (GITNEXUS_SKIP_OPTIONAL_GRAMMARS=1)."
fi

say "Installing gitnexus-shared deps"
(cd "${INSTALL_DIR}/gitnexus-shared" && npm install --no-audit --no-fund)

say "Installing gitnexus deps  ${DIM}(first run regenerates tree-sitter-nim/src/parser.c — ~49 s)${RESET}"
(cd "${INSTALL_DIR}/gitnexus" && ${export_skip}npm install --no-audit --no-fund)

# ---- Build ----------------------------------------------------------------

say "Building gitnexus"
(cd "${INSTALL_DIR}/gitnexus" && npm run build)

# ---- Link globally --------------------------------------------------------

if [ "${DO_LINK}" -eq 1 ]; then
  say "Linking 'gitnexus' globally  ${DIM}(npm link)${RESET}"
  (cd "${INSTALL_DIR}/gitnexus" && npm link)
  linked_path=$(command -v gitnexus || true)
  if [ -n "${linked_path}" ]; then
    say "${GREEN}gitnexus${RESET} -> ${linked_path}"
    gitnexus --version || true
  else
    warn "npm link succeeded but 'gitnexus' is not on PATH. Add \$(npm prefix -g)/bin to your PATH."
  fi
else
  say "Skipped 'npm link' as requested. Run gitnexus via: node ${INSTALL_DIR}/gitnexus/dist/cli/index.js"
fi

# ---- Patch Claude Code MCP config -----------------------------------------
#
# Edits ${MCP_CONFIG} (default ~/.claude.json) so the user-scope MCP entry
# named "gitnexus" runs the binary we just installed. Touches only the
# mcpServers.gitnexus key, preserves the rest of the file, and writes a
# timestamped backup before saving.

GITNEXUS_BIN="$(command -v gitnexus 2>/dev/null || true)"
if [ -z "${GITNEXUS_BIN}" ]; then
  # npm-link skipped or PATH miss — use the dist entry point directly.
  GITNEXUS_BIN="${INSTALL_DIR}/gitnexus/dist/cli/index.js"
fi

if [ "${DO_MCP}" -eq 1 ]; then
  say "Patching Claude Code MCP config  ${DIM}(${MCP_CONFIG})${RESET}"
  GITNEXUS_BIN="${GITNEXUS_BIN}" MCP_CONFIG="${MCP_CONFIG}" node - <<'NODE'
const fs = require('fs');
const file = process.env.MCP_CONFIG;
const bin = process.env.GITNEXUS_BIN;

// If gitnexus is a .js entry point, invoke through `node`. Otherwise treat it
// as a launchable binary.
const isJs = bin.endsWith('.js');
const entry = isJs
  ? { command: 'node',  args: [bin, 'mcp'] }
  : { command: bin,     args: ['mcp']     };

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
  // Timestamped backup before any write.
  const backup = `${file}.bak-${Date.now()}`;
  fs.copyFileSync(file, backup);
  console.log(`  backed up existing config -> ${backup}`);
}

cfg.mcpServers = cfg.mcpServers || {};
const prev = cfg.mcpServers.gitnexus;
cfg.mcpServers.gitnexus = entry;

// Atomic write: temp file in the same dir, then rename.
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

${BOLD}${GREEN}Install complete.${RESET}

${BOLD}Next${RESET}
  1. Restart Claude Code so it reloads the MCP servers.
  2. Verify:   ${DIM}claude mcp list${RESET}   →  expect '${BOLD}gitnexus${RESET}: ... - ✓ Connected'
  3. Inside a Nim repo:   ${DIM}gitnexus analyze${RESET}

${BOLD}Project-scope overrides${RESET}
If a repo you work in has its own ${BOLD}.mcp.json${RESET} that points at
'npx -y gitnexus@latest mcp', edit it to use this binary instead — npx
bypasses ${BOLD}npm link${RESET} and would otherwise pull a stale published copy:

  ${PROJECT_MCP_SNIPPET}

${BOLD}Docs${RESET}        ${INSTALL_DIR}/NIM.md
${BOLD}Update${RESET}      re-run this script with ${DIM}--update${RESET}
${BOLD}Revert${RESET}      cd ${INSTALL_DIR}/gitnexus && npm unlink
            npm install -g gitnexus@latest

EOF
