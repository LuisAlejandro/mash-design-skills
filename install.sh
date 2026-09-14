#!/usr/bin/env bash
# Install MMD Skills user-wide (Cursor skills + machine Penpot stack).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
SOURCE_ROOT="${MMD_SKILLS:-$SCRIPT_DIR}"
SOURCE_ROOT="$(cd "$SOURCE_ROOT" && pwd -P)"
VERSION_FILE="$SOURCE_ROOT/VERSION"
INSTALL_VERSION="0.1.0"
DEFAULT_STACK="${HOME}/.local/share/mmd-skills"
DEFAULT_SKILLS="${HOME}/.cursor/skills"
DEFAULT_AGENTS="${HOME}/.cursor/agents"

CHECK_ONLY=false
CREATE_AGENTS=true
SYNC_STACK=true
START_STACK=true

if [ -f "$VERSION_FILE" ]; then
  INSTALL_VERSION="$(tr -d '[:space:]' < "$VERSION_FILE")"
fi

usage() {
  cat <<EOF
Usage: install.sh [options]

Install the Cursor skill pack for this machine and sync the Compose stack.
Run from the MMD Skills toolkit clone (or set MMD_SKILLS).

  --check           Verify a previous install
  --version         Print toolkit version
  --agents          Copy review agents (default)
  --no-agents       Skip agents
  --no-stack        Do not sync or start the Compose stack
  --no-start        Sync stack files but do not docker up
  -h, --help        Show this help

Environment:
  MMD_SKILLS        Toolkit clone (default: directory of this script)
  MMD_STACK_ROOT    Stack data dir (default: ~/.local/share/mmd-skills)
  MMD_SKILLS_ROOT   Cursor skills dir (default: ~/.cursor/skills)
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --version) echo "$INSTALL_VERSION"; exit 0 ;;
    --check) CHECK_ONLY=true; shift ;;
    --agents) CREATE_AGENTS=true; shift ;;
    --no-agents) CREATE_AGENTS=false; shift ;;
    --no-stack) SYNC_STACK=false; START_STACK=false; shift ;;
    --no-start) START_STACK=false; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 1 ;;
  esac
done

STACK_ROOT="${MMD_STACK_ROOT:-$DEFAULT_STACK}"
SKILLS_ROOT="${MMD_SKILLS_ROOT:-$DEFAULT_SKILLS}"
AGENTS_ROOT="$DEFAULT_AGENTS"

MANAGED_SKILLS=(
  mmd-setup
  od-design-candidates
  od-design-system
  penpot-analyze-code-for-design
  penpot-apply-design-updates
  penpot-create-design-system
  penpot-design-pipeline
  penpot-implement-design
  penpot-import-html
  penpot-sync-code-to-design
  penpot-token-resolution
)

MANAGED_AGENTS=(
  penpot-design-iterator.md
  penpot-design-reviewer.md
  penpot-design-sync.md
  penpot-iterator-report.schema.json
  penpot-reviewer-report.schema.json
  penpot-sync-report.schema.json
)

echo "Installing MMD Skills..."
echo "-> From $SOURCE_ROOT"
echo "   Skills: $SKILLS_ROOT"
echo "   Stack:  $STACK_ROOT"

if [ ! -d "$SOURCE_ROOT/.cursor/skills" ]; then
  echo "Error: No .cursor/skills in $SOURCE_ROOT" >&2
  exit 1
fi

if [ ! -d "$SOURCE_ROOT/.agents/shared/lib" ]; then
  echo "Error: No .agents/shared/lib in $SOURCE_ROOT" >&2
  exit 1
fi

for required in docker-compose.yaml penpot.env.example bin/mmd docker/opendesign/Dockerfile; do
  if [ ! -e "$SOURCE_ROOT/$required" ]; then
    echo "Error: missing toolkit file: $SOURCE_ROOT/$required" >&2
    exit 1
  fi
done

copy_tree() {
  local src="$1"
  local dest="$2"
  mkdir -p "$(dirname "$dest")"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete \
      --exclude node_modules \
      --exclude .venv \
      --exclude .env \
      --exclude __pycache__ \
      "$src/" "$dest/"
  else
    rm -rf "$dest"
    mkdir -p "$dest"
    tar -C "$src" --exclude node_modules --exclude .venv --exclude .env --exclude __pycache__ -cf - . \
      | tar -C "$dest" -xf -
  fi
}

stack_health_ok() {
  local port="${OPEN_DESIGN_PORT:-7457}"
  local raw=""
  if [ -f "${STACK_ROOT}/penpot.env" ]; then
    raw="$(grep '^OPEN_DESIGN_PORT=' "${STACK_ROOT}/penpot.env" | tail -n 1 | cut -d= -f2- || true)"
    raw="${raw%\"}"
    raw="${raw#\"}"
    raw="${raw%\'}"
    raw="${raw#\'}"
    port="${raw:-7457}"
  fi
  curl -fsS --max-time 3 "http://127.0.0.1:${port}/api/health" >/dev/null 2>&1
}

if [ "$CHECK_ONLY" = true ]; then
  missing=0
  for name in "${MANAGED_SKILLS[@]}"; do
    if [ ! -d "$SKILLS_ROOT/$name" ]; then
      echo "missing: $SKILLS_ROOT/$name"
      missing=$((missing + 1))
    fi
  done
  if [ "$CREATE_AGENTS" = true ]; then
    for name in "${MANAGED_AGENTS[@]}"; do
      if [ ! -e "$AGENTS_ROOT/$name" ]; then
        echo "missing: $AGENTS_ROOT/$name"
        missing=$((missing + 1))
      fi
    done
  fi
  if [ ! -f "$STACK_ROOT/lib/od_daemon.py" ]; then
    echo "missing: $STACK_ROOT/lib/od_daemon.py"
    missing=$((missing + 1))
  fi
  if [ ! -f "$STACK_ROOT/docker-compose.yaml" ]; then
    echo "missing: $STACK_ROOT/docker-compose.yaml"
    missing=$((missing + 1))
  fi
  if [ "$missing" -eq 0 ]; then
    echo "MMD Skills installed ($INSTALL_VERSION)"
    exit 0
  fi
  exit 1
fi

echo "-> Copying skills..."
mkdir -p "$SKILLS_ROOT"
rm -rf "$SKILLS_ROOT/_shared"
for name in "${MANAGED_SKILLS[@]}"; do
  src="$SOURCE_ROOT/.cursor/skills/$name"
  if [ ! -d "$src" ]; then
    echo "   skip missing source skill: $name" >&2
    continue
  fi
  copy_tree "$src" "$SKILLS_ROOT/$name"
  echo "   $name"
done

if [ "$CREATE_AGENTS" = true ]; then
  echo "-> Copying agents..."
  mkdir -p "$AGENTS_ROOT"
  for name in "${MANAGED_AGENTS[@]}"; do
    src="$SOURCE_ROOT/.cursor/agents/$name"
    if [ ! -e "$src" ]; then
      echo "   skip missing source agent: $name" >&2
      continue
    fi
    cp -R "$src" "$AGENTS_ROOT/$name"
    echo "   $name"
  done
fi

merge_mcp() {
  local dest="${HOME}/.cursor/mcp.json"
  mkdir -p "${HOME}/.cursor"
  python3 - "$dest" <<'PY'
import json, sys
from pathlib import Path

dest = Path(sys.argv[1])
managed = {
    "context7": {
        "type": "http",
        "url": "https://mcp.context7.com/mcp",
    },
    "penpot-local": {
        "url": "http://localhost:4401/mcp",
        "type": "http",
    },
}
data = {}
if dest.is_file():
    try:
        loaded = json.loads(dest.read_text(encoding="utf-8"))
        if isinstance(loaded, dict):
            data = loaded
    except json.JSONDecodeError:
        print(f"   warning: {dest} is not valid JSON; leaving it unchanged", file=sys.stderr)
        sys.exit(0)

servers = data.get("mcpServers")
if not isinstance(servers, dict):
    servers = {}
    data["mcpServers"] = servers
servers.update(managed)
dest.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
PY
}

echo "-> Merging context7 and penpot-local into ~/.cursor/mcp.json..."
if command -v python3 >/dev/null 2>&1; then
  merge_mcp
else
  echo "   warning: python3 not found; write mcp.json.example by hand" >&2
fi

install_npm_deps() {
  local dir="$1"
  local label="$2"
  if [ ! -f "$dir/package.json" ]; then
    return 0
  fi
  if ! command -v npm >/dev/null 2>&1; then
    echo "   skip $label (npm not on PATH)"
    return 0
  fi
  echo "-> npm install: $label"
  (
    cd "$dir"
    if [ -f package-lock.json ]; then
      npm ci 2>/dev/null || npm install
    else
      npm install
    fi
  ) || echo "   warning: npm install failed in $label (continuing)"
}

echo "-> Installing skill npm packages..."
for name in "${MANAGED_SKILLS[@]}"; do
  dir="$SKILLS_ROOT/$name"
  [ -d "$dir" ] || continue
  install_npm_deps "$dir" "$name"
done

install_playwright() {
  local dir="$1"
  if [ ! -x "$dir/node_modules/.bin/playwright" ]; then
    return 0
  fi
  echo "-> playwright chromium: $(basename "$dir")"
  (cd "$dir" && npx playwright install chromium) \
    || echo "   warning: playwright install failed in $dir (continuing)"
}

install_playwright "$SKILLS_ROOT/penpot-implement-design"

CAND="$SKILLS_ROOT/od-design-candidates"
if [ -f "$CAND/requirements.txt" ]; then
  echo "-> Python venv: od-design-candidates"
  if command -v python3 >/dev/null 2>&1; then
    python3 -m venv "$CAND/.venv"
    "$CAND/.venv/bin/python" -m pip install -r "$CAND/requirements.txt" \
      || echo "   warning: pip install failed (continuing)"
    if [ -x "$CAND/.venv/bin/playwright" ]; then
      "$CAND/.venv/bin/playwright" install chromium \
        || echo "   warning: playwright (python) install failed (continuing)"
    fi
  else
    echo "   skip python venv (python3 not on PATH)"
  fi
fi

sync_stack() {
  STACK_ROOT="$(mkdir -p "$STACK_ROOT" && cd "$STACK_ROOT" && pwd -P)"
  mkdir -p "$STACK_ROOT/bin" "$STACK_ROOT/lib" "$STACK_ROOT/docker/opendesign"
  echo "-> Syncing stack to $STACK_ROOT..."
  if command -v rsync >/dev/null 2>&1; then
    rsync -a "$SOURCE_ROOT/docker-compose.yaml" "$STACK_ROOT/"
    rsync -a "$SOURCE_ROOT/penpot.env.example" "$STACK_ROOT/"
    rsync -a "$SOURCE_ROOT/bin/mmd" "$STACK_ROOT/bin/mmd"
    rsync -a "$SOURCE_ROOT/.agents/shared/lib/od_daemon.py" "$STACK_ROOT/lib/od_daemon.py"
    rsync -a "$SOURCE_ROOT/.agents/shared/lib/od_daemon.sh" "$STACK_ROOT/lib/od_daemon.sh"
    rsync -a --delete "$SOURCE_ROOT/docker/opendesign/" "$STACK_ROOT/docker/opendesign/"
    [ -f "$SOURCE_ROOT/convert.sh" ] && rsync -a "$SOURCE_ROOT/convert.sh" "$STACK_ROOT/"
    [ -f "$SOURCE_ROOT/.env.example" ] && rsync -a "$SOURCE_ROOT/.env.example" "$STACK_ROOT/"
  else
    cp "$SOURCE_ROOT/docker-compose.yaml" "$STACK_ROOT/"
    cp "$SOURCE_ROOT/penpot.env.example" "$STACK_ROOT/"
    cp "$SOURCE_ROOT/bin/mmd" "$STACK_ROOT/bin/mmd"
    mkdir -p "$STACK_ROOT/lib"
    cp "$SOURCE_ROOT/.agents/shared/lib/od_daemon.py" "$STACK_ROOT/lib/od_daemon.py"
    cp "$SOURCE_ROOT/.agents/shared/lib/od_daemon.sh" "$STACK_ROOT/lib/od_daemon.sh"
    cp -R "$SOURCE_ROOT/docker/opendesign/." "$STACK_ROOT/docker/opendesign/"
    [ -f "$SOURCE_ROOT/convert.sh" ] && cp "$SOURCE_ROOT/convert.sh" "$STACK_ROOT/"
    [ -f "$SOURCE_ROOT/.env.example" ] && cp "$SOURCE_ROOT/.env.example" "$STACK_ROOT/"
  fi
  chmod +x "$STACK_ROOT/bin/mmd"
  chmod +x "$STACK_ROOT/lib/od_daemon.sh" 2>/dev/null || true
  chmod +x "$STACK_ROOT/docker/opendesign/"*.sh 2>/dev/null || true
  if [ ! -f "$STACK_ROOT/penpot.env" ] && [ -f "$SOURCE_ROOT/penpot.env" ]; then
    cp "$SOURCE_ROOT/penpot.env" "$STACK_ROOT/penpot.env"
    echo "   copied existing penpot.env from toolkit clone"
  fi
  if [ -d "${HOME}/.local/bin" ]; then
    ln -sfn "$STACK_ROOT/bin/mmd" "${HOME}/.local/bin/mmd"
    echo "   linked ~/.local/bin/mmd"
  fi
}

if [ "$SYNC_STACK" = true ]; then
  sync_stack
  export MMD_STACK_ROOT="$STACK_ROOT"
  if [ ! -f "$STACK_ROOT/penpot.env" ]; then
    echo "-> mmd setup (first time)..."
    "$STACK_ROOT/bin/mmd" setup
  fi
  if [ "$START_STACK" = true ]; then
    if stack_health_ok; then
      echo "-> OpenDesign already healthy; skipping mmd start"
    else
      echo "-> mmd start..."
      "$STACK_ROOT/bin/mmd" start
    fi
  fi
fi

echo ""
echo "MMD Skills installed ($INSTALL_VERSION)"
echo "   Skills: $SKILLS_ROOT (managed pack only)"
echo "   Agents: $AGENTS_ROOT (managed pack only)"
echo "   Stack:  $STACK_ROOT"
echo "   Next:   open http://localhost:9001  ·  mmd doctor  ·  activate penpot-local MCP"
