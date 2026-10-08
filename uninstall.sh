#!/usr/bin/env bash
# Mash Design Skills — machine-global uninstaller.
#
# Removes the global Mash Design Skills payload recorded in
# ~/.config/mash/design-install-manifest.json. Does not need the source checkout.
# Mash Programming Skills artifacts, other MCP servers, and app .mash/ trees stay.
#
# Usage (repo copy or ~/.config/mash/uninstall-design.sh):
#   uninstall.sh                 # dry run
#   uninstall.sh --check         # exit 0 if the design payload is installed
#   uninstall.sh --apply         # remove the design payload
#
# Install copies this file to ~/.config/mash/uninstall-design.sh.
# --apply tears down the Compose project when the stack directory is present.
# On a terminal, type the project name to confirm. Otherwise set
# MASH_DESIGN_CONFIRM_UNINSTALL=1.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

CHECK_ONLY=false
APPLY=false

MASH_CONFIG_DIR="${MASH_CONFIG_DIR:-${HOME}/.config/mash}"
MANIFEST="$MASH_CONFIG_DIR/design-install-manifest.json"
PIN="$MASH_CONFIG_DIR/design-stack.json"
DEFAULT_STACK="${HOME}/.local/share/mash/design"
CURSOR_SKILLS="${HOME}/.cursor/skills"
CURSOR_AGENTS="${HOME}/.cursor/agents"
OPENCODE_SKILLS="${HOME}/.config/opencode/skills"
OPENCODE_AGENTS="${HOME}/.config/opencode/agents"
PI_SKILLS="${HOME}/.pi/agent/skills"
PI_AGENTS="${HOME}/.agents"
BIN_LINK="${HOME}/.local/bin/mds"

read_manifest_version() {
  python3 - "$MANIFEST" <<'PY'
import json, sys
from pathlib import Path
try:
    data = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
except (OSError, json.JSONDecodeError):
    raise SystemExit(0)
version = data.get("version") if isinstance(data, dict) else None
if isinstance(version, str) and version.strip():
    print(version.strip())
PY
}

UNINSTALL_VERSION="$(read_manifest_version || true)"
if [ -z "$UNINSTALL_VERSION" ] && [ -f "$SCRIPT_DIR/VERSION" ]; then
  UNINSTALL_VERSION="$(tr -d '[:space:]' < "$SCRIPT_DIR/VERSION")"
fi
if [ -z "$UNINSTALL_VERSION" ]; then
  UNINSTALL_VERSION="unknown"
fi

while [ "$#" -gt 0 ]; do
  case "$1" in
    --version) echo "$UNINSTALL_VERSION"; exit 0 ;;
    --check) CHECK_ONLY=true; shift ;;
    --apply) APPLY=true; shift ;;
    -h|--help)
      sed -n '2,16p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

note() { printf '%s\n' "$*"; }

path_exists() { [ -e "$1" ] || [ -L "$1" ]; }

remove_path() {
  local path="$1"
  path_exists "$path" || return 0
  if [ "$APPLY" = true ]; then
    rm -rf -- "$path"
    note "   removed       $path"
  else
    note "   would remove  $path"
  fi
}

safe_name() {
  local name="$1"
  case "$name" in
    ""|.|..|*/*|*\\*) return 1 ;;
  esac
  return 0
}

manifest_list() {
  local key="$1"
  [ -f "$MANIFEST" ] || return 0
  python3 - "$MANIFEST" "$key" <<'PY'
import json, sys
from pathlib import Path
data = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
managed = data.get("managed") if isinstance(data, dict) else {}
values = managed.get(sys.argv[2]) if isinstance(managed, dict) else []
if not isinstance(values, list):
    raise SystemExit(0)
for name in values:
    if isinstance(name, str):
        print(name)
PY
}

manifest_stack() {
  [ -f "$MANIFEST" ] || return 0
  python3 - "$MANIFEST" <<'PY'
import json, sys
from pathlib import Path
data = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
raw = data.get("stack_root") if isinstance(data, dict) else ""
if isinstance(raw, str) and raw.strip():
    print(raw.strip())
PY
}

derive_project_name() {
  local root="$1"
  if [ "$root" = "${HOME}/.local/share/mash/design" ]; then
    echo "penpot"
    return 0
  fi
  echo "mds-$(printf '%s' "$root" | shasum -a 256 | cut -c1-32)"
}

confirm_compose() {
  local project="$1"
  local bypass="${MASH_DESIGN_CONFIRM_UNINSTALL:-}"
  note ""
  note "Compose project '$project' will be removed (containers, images, volumes)."
  if [ "$APPLY" != true ]; then
    return 0
  fi
  if [ -t 0 ]; then
    local reply=""
    read -r -p "Type the project name (${project}) to confirm uninstall, or anything else to abort: " reply || reply=""
    if [ "$reply" != "$project" ]; then
      echo "Confirmation did not match; aborting uninstall." >&2
      exit 1
    fi
    return 0
  fi
  if [ "$bypass" = "1" ]; then
    return 0
  fi
  echo "Refusing uninstall without a TTY. Set MASH_DESIGN_CONFIRM_UNINSTALL=1 to proceed." >&2
  exit 1
}

destroy_compose() {
  local root="$1"
  [ -f "$root/docker-compose.yaml" ] || return 0
  local project
  project="$(derive_project_name "$root")"
  confirm_compose "$project"
  if [ "$APPLY" != true ]; then
    note "   would destroy Compose project '$project' in $root"
    return 0
  fi
  if ! command -v docker >/dev/null 2>&1; then
    echo "Docker not found; cannot destroy compose project in $root" >&2
    exit 1
  fi
  note "-> Destroying Compose project '$project' in $root..."
  if [ -f "$root/penpot.env" ]; then
    docker compose -p "$project" -f "$root/docker-compose.yaml" \
      --env-file "$root/penpot.env" --project-directory "$root" \
      down --rmi all --remove-orphans --volumes
  else
    docker compose -p "$project" -f "$root/docker-compose.yaml" \
      --project-directory "$root" down --rmi all --remove-orphans --volumes
  fi
}

remove_penpot_mcp() {
  local dest="${HOME}/.cursor/mcp.json"
  [ -f "$dest" ] || return 0
  if [ "$APPLY" != true ]; then
    if python3 - "$dest" <<'PY'
import json, sys
from pathlib import Path
data = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
servers = data.get("mcpServers") if isinstance(data, dict) else None
raise SystemExit(0 if isinstance(servers, dict) and "penpot-local" in servers else 1)
PY
    then
      note "   would remove  penpot-local from $dest"
    fi
    return 0
  fi
  python3 - "$dest" <<'PY'
import json, sys
from pathlib import Path
dest = Path(sys.argv[1])
data = json.loads(dest.read_text(encoding="utf-8"))
servers = data.get("mcpServers") if isinstance(data, dict) else None
if not isinstance(servers, dict) or "penpot-local" not in servers:
    raise SystemExit(0)
entry = servers.get("penpot-local")
url = entry.get("url") if isinstance(entry, dict) else None
if url != "http://localhost:4401/mcp":
    raise SystemExit(0)
del servers["penpot-local"]
dest.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
print("removed")
PY
  note "   removed       penpot-local from $dest"
}

if [ "$CHECK_ONLY" = true ]; then
  if [ ! -f "$MANIFEST" ]; then
    note "Mash Design Skills is not installed (no $MANIFEST)"
    exit 1
  fi
  missing=0
  while IFS= read -r name; do
    safe_name "$name" || continue
    if [ ! -d "$CURSOR_SKILLS/$name" ]; then
      note "missing: $CURSOR_SKILLS/$name"
      missing=$((missing + 1))
    fi
  done < <(manifest_list skills)
  if [ "$missing" -eq 0 ]; then
    note "Mash Design Skills installed ($UNINSTALL_VERSION)"
    exit 0
  fi
  exit 1
fi

note "Mash Design Skills uninstall ($UNINSTALL_VERSION)"
if [ "$APPLY" = true ]; then
  note "Applying removal."
else
  note "Dry run. Pass --apply to remove the design payload."
fi

STACK_ROOT="$(manifest_stack || true)"
if [ -z "$STACK_ROOT" ] && path_exists "$DEFAULT_STACK"; then
  STACK_ROOT="$DEFAULT_STACK"
fi
if [ -n "$STACK_ROOT" ]; then
  destroy_compose "$STACK_ROOT"
  if [ -d "$STACK_ROOT/src/skills/mash-design-setup" ] && [ -d "$STACK_ROOT/.git" ]; then
    note "   keeping toolkit checkout $STACK_ROOT"
  else
    remove_path "$STACK_ROOT"
  fi
fi

while IFS= read -r name; do
  safe_name "$name" || continue
  for home in "$CURSOR_SKILLS" "$OPENCODE_SKILLS" "$PI_SKILLS"; do
    remove_path "$home/$name"
  done
done < <(manifest_list skills)

while IFS= read -r name; do
  safe_name "$name" || continue
  for home in "$CURSOR_AGENTS" "$OPENCODE_AGENTS" "$PI_AGENTS"; do
    remove_path "$home/$name"
  done
done < <(manifest_list agents)

while IFS= read -r name; do
  safe_name "$name" || continue
  remove_path "$MASH_CONFIG_DIR/node_modules/$name"
  remove_path "$MASH_CONFIG_DIR/venvs/$name"
done < <(manifest_list npm_skills)

while IFS= read -r name; do
  safe_name "$name" || continue
  remove_path "$MASH_CONFIG_DIR/venvs/$name"
done < <(manifest_list venv_skills)

remove_penpot_mcp
remove_path "$PIN"
remove_path "$BIN_LINK"
remove_path "$MANIFEST"
remove_path "$MASH_CONFIG_DIR/uninstall-design.sh"

if [ "$APPLY" = true ]; then
  note "Mash Design Skills uninstalled"
else
  note "Dry run complete. No files were removed."
fi
