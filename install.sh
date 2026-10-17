#!/usr/bin/env bash
# Install Mash Design Skills machine-wide (skills, agents, Penpot stack).
# Piped install: curl -fsSL https://raw.githubusercontent.com/LuisAlejandro/mash-design-skills/develop/install.sh | bash
set -euo pipefail

REPO_URL="${MASH_DESIGN_REPO_URL:-https://github.com/LuisAlejandro/mash-design-skills}"
DEFAULT_REF="${MASH_DESIGN_REF:-develop}"
MASH_CONFIG_DIR="${MASH_CONFIG_DIR:-${HOME}/.config/mash}"

toolkit_root_ok() {
  local d="$1"
  [ -n "$d" ] && [ -d "$d" ] && \
    [ -f "$d/install.sh" ] && [ -f "$d/docker-compose.yaml" ] && \
    [ -d "$d/src/skills/mash-design-setup" ] && \
    [ -f "$d/headless/src/server.ts" ]
}

bootstrap_from_github() {
  local tmp extracted url
  tmp="$(mktemp -d "${TMPDIR:-/tmp}/mash-design-skills.XXXXXX")"
  echo "-> Downloading ${REPO_URL} (${DEFAULT_REF})..."
  url="${REPO_URL}/archive/refs/heads/${DEFAULT_REF}.tar.gz"
  if ! curl -fsSL "$url" | tar -xz -C "$tmp"; then
    url="${REPO_URL}/archive/refs/tags/${DEFAULT_REF}.tar.gz"
    curl -fsSL "$url" | tar -xz -C "$tmp"
  fi
  extracted=""
  for d in "$tmp"/*; do
    if [ -d "$d" ]; then
      extracted="$d"
      break
    fi
  done
  if ! toolkit_root_ok "$extracted"; then
    echo "Error: downloaded tree is not a Mash Design Skills toolkit" >&2
    rm -rf "$tmp"
    exit 1
  fi
  export MASH_DESIGN_BOOTSTRAP_TMP="$tmp"
  exec bash "$extracted/install.sh" "$@"
}

if [ -n "${MASH_DESIGN_BOOTSTRAP_TMP:-}" ]; then
  trap 'rm -rf "${MASH_DESIGN_BOOTSTRAP_TMP}"' EXIT
fi

SCRIPT_PATH="${BASH_SOURCE[0]:-}"
SCRIPT_DIR=""
if [ -n "$SCRIPT_PATH" ] && [ -f "$SCRIPT_PATH" ]; then
  SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd -P)"
fi

SOURCE_ROOT="${MASH_DESIGN_SKILLS:-$SCRIPT_DIR}"
if toolkit_root_ok "$SOURCE_ROOT"; then
  SOURCE_ROOT="$(cd "$SOURCE_ROOT" && pwd -P)"
else
  bootstrap_from_github "$@"
fi

VERSION_FILE="$SOURCE_ROOT/VERSION"
INSTALL_VERSION="0.1.1"
DEFAULT_STACK="${HOME}/.local/share/mash/design"
CURSOR_SKILLS="${HOME}/.cursor/skills"
CURSOR_AGENTS="${HOME}/.cursor/agents"
OPENCODE_SKILLS="${HOME}/.config/opencode/skills"
OPENCODE_AGENTS="${HOME}/.config/opencode/agents"
PI_SKILLS="${HOME}/.pi/agent/skills"
PI_AGENTS="${HOME}/.agents"
MANIFEST="$MASH_CONFIG_DIR/design-install-manifest.json"
PIN="$MASH_CONFIG_DIR/design-stack.json"

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

Install Mash Design Skills into the Cursor, OpenCode, and Pi global homes and
sync the Compose stack. From a clone: ./install.sh. Piped: curl the raw
install.sh from GitHub | bash.

  --check           Verify a previous install
  --version         Print toolkit version
  --no-agents       Skip copying agents
  --no-stack        Do not sync or start the Compose stack
  --no-start        Sync stack files but do not docker up
  -h, --help        Show this help

Environment:
  MASH_DESIGN_SKILLS   Toolkit clone (default: directory of this script)
  MASH_DESIGN_STACK    Stack data dir (default: ~/.local/share/mash/design)
  MASH_CONFIG_DIR      Machine config dir (default: ~/.config/mash)
  MASH_DESIGN_REF      GitHub branch or tag when piped (default: develop)
  MASH_DESIGN_REPO_URL GitHub repo URL when piped
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --version) echo "$INSTALL_VERSION"; exit 0 ;;
    --check) CHECK_ONLY=true; shift ;;
    --no-agents) CREATE_AGENTS=false; shift ;;
    --no-stack) SYNC_STACK=false; START_STACK=false; shift ;;
    --no-start) START_STACK=false; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 1 ;;
  esac
done

STACK_ROOT="${MASH_DESIGN_STACK:-$DEFAULT_STACK}"

if [ ! -d "$SOURCE_ROOT/src/skills" ]; then
  echo "Error: No src/skills in $SOURCE_ROOT" >&2
  exit 1
fi
if [ ! -f "$SOURCE_ROOT/scripts/od_daemon.py" ] || [ ! -f "$SOURCE_ROOT/scripts/od_daemon.sh" ]; then
  echo "Error: No scripts/od_daemon.py in $SOURCE_ROOT" >&2
  exit 1
fi
for required in docker-compose.yaml penpot.env.example bin/mds docker/opendesign/Dockerfile uninstall.sh headless/src/server.ts headless/package.json; do
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

safe_name() {
  local name="$1"
  case "$name" in
    ""|.|..|*/*|*\\*) return 1 ;;
  esac
  return 0
}

list_skill_names() {
  local src name
  for src in "$SOURCE_ROOT"/src/skills/*/; do
    [ -d "$src" ] || continue
    name="$(basename "$src")"
    safe_name "$name" || continue
    printf '%s\n' "$name"
  done
}

list_agent_names() {
  local src name
  for src in "$SOURCE_ROOT"/src/agents/*; do
    [ -f "$src" ] || continue
    name="$(basename "$src")"
    safe_name "$name" || continue
    printf '%s\n' "$name"
  done
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
  while IFS= read -r name; do
    if [ ! -d "$CURSOR_SKILLS/$name" ]; then
      echo "missing: $CURSOR_SKILLS/$name"
      missing=$((missing + 1))
    fi
  done < <(list_skill_names)
  if [ "$CREATE_AGENTS" = true ]; then
    while IFS= read -r name; do
      if [ ! -e "$CURSOR_AGENTS/$name" ]; then
        echo "missing: $CURSOR_AGENTS/$name"
        missing=$((missing + 1))
      fi
    done < <(list_agent_names)
  fi
  if [ ! -f "$MANIFEST" ]; then
    echo "missing: $MANIFEST"
    missing=$((missing + 1))
  fi
  if [ "$SYNC_STACK" = true ]; then
    if [ ! -f "$STACK_ROOT/lib/od_daemon.py" ]; then
      echo "missing: $STACK_ROOT/lib/od_daemon.py"
      missing=$((missing + 1))
    fi
    if [ ! -f "$STACK_ROOT/docker-compose.yaml" ]; then
      echo "missing: $STACK_ROOT/docker-compose.yaml"
      missing=$((missing + 1))
    fi
  fi
  if [ "$missing" -eq 0 ]; then
    echo "Mash Design Skills installed ($INSTALL_VERSION)"
    exit 0
  fi
  exit 1
fi

echo "Installing Mash Design Skills..."
echo "-> From $SOURCE_ROOT"
echo "   Cursor skills: $CURSOR_SKILLS"
echo "   Stack:         $STACK_ROOT"

# Prune names the previous design manifest owned that this tree no longer ships.
prune_owned() {
  local new_skills="$1" new_agents="$2"
  [ -f "$MANIFEST" ] || return 0
  python3 - "$MANIFEST" "$new_skills" "$new_agents" <<'PY'
import json, sys
from pathlib import Path

def names(text):
    return {line for line in text.splitlines() if line}

def safe(name):
    return bool(name) and name not in {".", ".."} and "/" not in name and "\\" not in name

data = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
managed = data.get("managed") if isinstance(data, dict) else {}
if not isinstance(managed, dict):
    raise SystemExit(0)
keep_skills = names(Path(sys.argv[2]).read_text(encoding="utf-8"))
keep_agents = names(Path(sys.argv[3]).read_text(encoding="utf-8"))
for name in managed.get("skills") or []:
    if isinstance(name, str) and safe(name) and name not in keep_skills:
        print(f"skill\t{name}")
for name in managed.get("agents") or []:
    if isinstance(name, str) and safe(name) and name not in keep_agents:
        print(f"agent\t{name}")
for name in (managed.get("npm_skills") or []) + (managed.get("venv_skills") or []):
    if isinstance(name, str) and safe(name) and name not in keep_skills:
        print(f"dep\t{name}")
PY
}

SKILL_LIST="$(mktemp)"
AGENT_LIST="$(mktemp)"
cleanup() {
  rm -f "${SKILL_LIST:-}" "${AGENT_LIST:-}"
  if [ -n "${MASH_DESIGN_BOOTSTRAP_TMP:-}" ]; then
    rm -rf "${MASH_DESIGN_BOOTSTRAP_TMP}"
  fi
}
trap cleanup EXIT
list_skill_names > "$SKILL_LIST"
list_agent_names > "$AGENT_LIST"

echo "-> Pruning design skills this tree no longer ships..."
while IFS=$'\t' read -r kind name; do
  [ -n "${kind:-}" ] || continue
  case "$kind" in
    skill)
      for home in "$CURSOR_SKILLS" "$OPENCODE_SKILLS" "$PI_SKILLS"; do
        if [ -e "$home/$name" ] || [ -L "$home/$name" ]; then
          rm -rf "$home/$name"
          echo "   removed $home/$name"
        fi
      done
      ;;
    agent)
      for home in "$CURSOR_AGENTS" "$OPENCODE_AGENTS" "$PI_AGENTS"; do
        if [ -e "$home/$name" ] || [ -L "$home/$name" ]; then
          rm -rf "$home/$name"
          echo "   removed $home/$name"
        fi
      done
      ;;
    dep)
      rm -rf "$MASH_CONFIG_DIR/node_modules/$name" "$MASH_CONFIG_DIR/venvs/$name"
      ;;
  esac
done < <(prune_owned "$SKILL_LIST" "$AGENT_LIST")

echo "-> Copying skills..."
while IFS= read -r name; do
  [ -n "$name" ] || continue
  for home in "$CURSOR_SKILLS" "$OPENCODE_SKILLS" "$PI_SKILLS"; do
    copy_tree "$SOURCE_ROOT/src/skills/$name" "$home/$name"
  done
  echo "   $name"
done < "$SKILL_LIST"

if [ "$CREATE_AGENTS" = true ]; then
  echo "-> Copying agents..."
  while IFS= read -r name; do
    [ -n "$name" ] || continue
    for home in "$CURSOR_AGENTS" "$OPENCODE_AGENTS" "$PI_AGENTS"; do
      mkdir -p "$home"
      cp -R "$SOURCE_ROOT/src/agents/$name" "$home/$name"
    done
    echo "   $name"
  done < "$AGENT_LIST"
fi

install_headless() {
  local dest="$MASH_CONFIG_DIR/headless"
  if [ ! -f "$SOURCE_ROOT/headless/package.json" ]; then
    echo "Error: $SOURCE_ROOT/headless is missing. The toolkit checkout must include it." >&2
    exit 1
  fi
  echo "-> Installing headless Penpot server to $dest..."
  mkdir -p "$dest"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete \
      --exclude node_modules \
      --exclude dist \
      --exclude .git \
      "$SOURCE_ROOT/headless/" "$dest/"
  else
    find "$dest" -mindepth 1 -maxdepth 1 ! -name node_modules -exec rm -rf {} +
    tar -C "$SOURCE_ROOT/headless" --exclude node_modules --exclude dist --exclude .git -cf - . \
      | tar -C "$dest" -xf -
  fi
  install_npm_deps "$dest" "headless"
  if [ ! -x "$dest/node_modules/.bin/tsc" ]; then
    echo "   warning: headless dependencies are missing; penpot-local cannot start" >&2
    return 0
  fi
  echo "-> Building headless Penpot server..."
  (cd "$dest" && npm run build) || echo "   warning: headless build failed (continuing)" >&2
}

merge_mcp() {
  local dest="${HOME}/.cursor/mcp.json"
  local server="$MASH_CONFIG_DIR/headless/dist/server.js"
  local node_bin env_file
  node_bin="$(command -v node || echo node)"
  env_file="$STACK_ROOT/penpot.env"
  mkdir -p "${HOME}/.cursor"
  python3 - "$dest" "$server" "$node_bin" "$env_file" <<'PY'
import json, sys
from pathlib import Path

dest = Path(sys.argv[1])
server = sys.argv[2]
node_bin = sys.argv[3]
env_file = Path(sys.argv[4])

def load_env(path: Path) -> dict:
    values = {}
    if not path.is_file():
        return values
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key] = value
    return values

env = load_env(env_file)
managed = {
    "penpot-local": {
        "command": node_bin,
        "args": [server],
        "env": {
            "PENPOT_BASE_URL": "http://localhost:9001",
            "PENPOT_ACCESS_TOKEN": env.get("PENPOT_ACCESS_TOKEN", ""),
            "PENPOT_LOGIN_EMAIL": env.get("PENPOT_LOCAL_EMAIL", ""),
            "PENPOT_LOGIN_PASSWORD": env.get("PENPOT_LOCAL_PASSWORD", ""),
        },
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
        raise SystemExit(0)
servers = data.get("mcpServers")
if not isinstance(servers, dict):
    servers = {}
    data["mcpServers"] = servers
servers.update(managed)
dest.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
PY
}

link_shared_skill_dep() {
  local target="$1" link="$2"
  [ -e "$target" ] || return 0
  mkdir -p "$(dirname "$link")"
  if [ -e "$link" ] || [ -L "$link" ]; then
    rm -rf -- "$link"
  fi
  ln -s "$target" "$link"
}

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

install_global_skill_deps() {
  local src name store venv home
  NPM_SKILLS=()
  VENV_SKILLS=()
  while IFS= read -r name; do
    [ -n "$name" ] || continue
    src="$SOURCE_ROOT/src/skills/$name"
    if [ -f "$src/package.json" ]; then
      store="$MASH_CONFIG_DIR/node_modules/$name"
      mkdir -p "$store"
      cp "$src/package.json" "$store/package.json"
      if [ -f "$src/package-lock.json" ]; then
        cp "$src/package-lock.json" "$store/package-lock.json"
      fi
      install_npm_deps "$store" "global skill $name"
      if [ -x "$store/node_modules/.bin/playwright" ]; then
        echo "-> playwright chromium: $name"
        (cd "$store" && npx playwright install chromium) \
          || echo "   warning: playwright install failed for $name (continuing)"
      fi
      for home in "$CURSOR_SKILLS" "$OPENCODE_SKILLS" "$PI_SKILLS"; do
        [ -d "$home/$name" ] || continue
        link_shared_skill_dep "$store/node_modules" "$home/$name/node_modules"
      done
      NPM_SKILLS+=("$name")
    fi
    if [ -f "$src/requirements.txt" ]; then
      venv="$MASH_CONFIG_DIR/venvs/$name"
      if [ ! -x "$venv/bin/python" ]; then
        mkdir -p "$MASH_CONFIG_DIR/venvs"
        python3 -m venv "$venv" || {
          echo "   warning: could not create a virtualenv for $name (continuing)"
          continue
        }
      fi
      echo "-> pip install: global skill $name"
      "$venv/bin/python" -m pip install -q -r "$src/requirements.txt" \
        || echo "   warning: pip install failed for $name (continuing)"
      if [ -x "$venv/bin/playwright" ]; then
        "$venv/bin/playwright" install chromium \
          || echo "   warning: playwright chromium install failed for $name (continuing)"
      fi
      for home in "$CURSOR_SKILLS" "$OPENCODE_SKILLS" "$PI_SKILLS"; do
        [ -d "$home/$name" ] || continue
        link_shared_skill_dep "$venv" "$home/$name/.venv"
      done
      VENV_SKILLS+=("$name")
    fi
  done < "$SKILL_LIST"
}

echo "-> Installing skill dependencies under $MASH_CONFIG_DIR..."
install_global_skill_deps

sync_stack() {
  STACK_ROOT="$(mkdir -p "$STACK_ROOT" && cd "$STACK_ROOT" && pwd -P)"
  mkdir -p "$STACK_ROOT/bin" "$STACK_ROOT/lib" "$STACK_ROOT/docker/opendesign"
  echo "-> Syncing stack to $STACK_ROOT..."
  if command -v rsync >/dev/null 2>&1; then
    rsync -a "$SOURCE_ROOT/docker-compose.yaml" "$STACK_ROOT/"
    rsync -a "$SOURCE_ROOT/penpot.env.example" "$STACK_ROOT/"
    rsync -a "$SOURCE_ROOT/bin/mds" "$STACK_ROOT/bin/mds"
    rsync -a "$SOURCE_ROOT/scripts/od_daemon.py" "$STACK_ROOT/lib/od_daemon.py"
    rsync -a "$SOURCE_ROOT/scripts/od_daemon.sh" "$STACK_ROOT/lib/od_daemon.sh"
    rsync -a --delete "$SOURCE_ROOT/docker/opendesign/" "$STACK_ROOT/docker/opendesign/"
    [ -f "$SOURCE_ROOT/convert.sh" ] && rsync -a "$SOURCE_ROOT/convert.sh" "$STACK_ROOT/"
    [ -f "$SOURCE_ROOT/.env.example" ] && rsync -a "$SOURCE_ROOT/.env.example" "$STACK_ROOT/"
  else
    cp "$SOURCE_ROOT/docker-compose.yaml" "$STACK_ROOT/"
    cp "$SOURCE_ROOT/penpot.env.example" "$STACK_ROOT/"
    cp "$SOURCE_ROOT/bin/mds" "$STACK_ROOT/bin/mds"
    mkdir -p "$STACK_ROOT/lib"
    cp "$SOURCE_ROOT/scripts/od_daemon.py" "$STACK_ROOT/lib/od_daemon.py"
    cp "$SOURCE_ROOT/scripts/od_daemon.sh" "$STACK_ROOT/lib/od_daemon.sh"
    cp -R "$SOURCE_ROOT/docker/opendesign/." "$STACK_ROOT/docker/opendesign/"
    [ -f "$SOURCE_ROOT/convert.sh" ] && cp "$SOURCE_ROOT/convert.sh" "$STACK_ROOT/"
    [ -f "$SOURCE_ROOT/.env.example" ] && cp "$SOURCE_ROOT/.env.example" "$STACK_ROOT/"
  fi
  chmod +x "$STACK_ROOT/bin/mds"
  chmod +x "$STACK_ROOT/lib/od_daemon.sh" 2>/dev/null || true
  chmod +x "$STACK_ROOT/docker/opendesign/"*.sh 2>/dev/null || true
  if [ ! -f "$STACK_ROOT/penpot.env" ] && [ -f "$SOURCE_ROOT/penpot.env" ]; then
    cp "$SOURCE_ROOT/penpot.env" "$STACK_ROOT/penpot.env"
    echo "   copied existing penpot.env from toolkit clone"
  fi
  if [ -f "$STACK_ROOT/penpot.env" ]; then
    chmod 600 "$STACK_ROOT/penpot.env"
  fi
  mkdir -p "${HOME}/.local/bin" "$MASH_CONFIG_DIR"
  ln -sfn "$STACK_ROOT/bin/mds" "${HOME}/.local/bin/mds"
  echo "   linked ~/.local/bin/mds"
  python3 - "$PIN" "$STACK_ROOT" <<'PY'
import json, sys
from pathlib import Path
pin = Path(sys.argv[1])
pin.parent.mkdir(parents=True, exist_ok=True)
pin.write_text(json.dumps({"stack_root": sys.argv[2]}, indent=2) + "\n", encoding="utf-8")
PY
  echo "   pinned $PIN"
}

write_manifest() {
  local stack_value=""
  if [ "$SYNC_STACK" = true ]; then
    stack_value="$STACK_ROOT"
  fi
  mkdir -p "$MASH_CONFIG_DIR"
  cp "$SOURCE_ROOT/uninstall.sh" "$MASH_CONFIG_DIR/uninstall-design.sh"
  chmod +x "$MASH_CONFIG_DIR/uninstall-design.sh"
  SKILL_FILE="$SKILL_LIST" AGENT_FILE="$AGENT_LIST" \
  NPM_JOINED="$(printf '%s\n' "${NPM_SKILLS[@]+"${NPM_SKILLS[@]}"}")" \
  VENV_JOINED="$(printf '%s\n' "${VENV_SKILLS[@]+"${VENV_SKILLS[@]}"}")" \
  INSTALL_VERSION="$INSTALL_VERSION" SOURCE_ROOT="$SOURCE_ROOT" \
  STACK_VALUE="$stack_value" MANIFEST="$MANIFEST" \
  python3 - <<'PY'
import json, os
from pathlib import Path

def lines(text):
    return [line for line in text.splitlines() if line]

manifest = {
    "manifest_version": 1,
    "version": os.environ["INSTALL_VERSION"],
    "source": os.environ["SOURCE_ROOT"],
    "scope": "global",
    "managed": {
        "skills": lines(Path(os.environ["SKILL_FILE"]).read_text(encoding="utf-8")),
        "agents": lines(Path(os.environ["AGENT_FILE"]).read_text(encoding="utf-8")),
        "npm_skills": lines(os.environ.get("NPM_JOINED", "")),
        "venv_skills": lines(os.environ.get("VENV_JOINED", "")),
    },
    "mcp_servers": ["penpot-local"],
    "stack_root": os.environ.get("STACK_VALUE", ""),
}
path = Path(os.environ["MANIFEST"])
path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
print(path)
PY
}

if [ "$SYNC_STACK" = true ]; then
  sync_stack
  export MASH_DESIGN_STACK="$STACK_ROOT"
  if [ ! -f "$STACK_ROOT/penpot.env" ]; then
    echo "-> mds setup (first time)..."
    "$STACK_ROOT/bin/mds" setup
  fi
  if [ "$START_STACK" = true ]; then
    if stack_health_ok; then
      echo "-> OpenDesign already healthy; skipping mds start"
    else
      echo "-> mds start..."
      "$STACK_ROOT/bin/mds" start
    fi
  fi
fi

write_manifest

echo "-> Headless Penpot server..."
install_headless

echo "-> Merging penpot-local into ~/.cursor/mcp.json..."
if command -v python3 >/dev/null 2>&1; then
  merge_mcp
else
  echo "   warning: python3 not found; merge penpot-local by hand" >&2
fi

echo ""
echo "Mash Design Skills installed ($INSTALL_VERSION)"
echo "   Skills: $CURSOR_SKILLS, $OPENCODE_SKILLS, $PI_SKILLS"
echo "   Agents: $CURSOR_AGENTS, $OPENCODE_AGENTS, $PI_AGENTS"
echo "   Config: $MASH_CONFIG_DIR"
echo "   Stack:  $STACK_ROOT"
echo "   Next:   open http://localhost:9001  ·  mds doctor  ·  activate penpot-local MCP"
