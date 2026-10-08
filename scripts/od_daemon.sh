# Compose OpenDesign daemon helper. Source from skills; never spawn a host daemon.
# Usage:
#   STACK="${MASH_DESIGN_STACK:-$HOME/.local/share/mash/design}"
#   APP="$(pwd -P)"
#   . "${STACK}/lib/od_daemon.sh"
#   od_load "$APP"
#   # SKILLS=$OD_SKILLS_ROOT (user dir, or this clone's src/skills while editing the toolkit)
#   od_require_health
#   od_curl --max-time 30 "$OD_DAEMON_URL/api/design-systems"

od_looks_like_toolkit() {
  local d="$1"
  [ -f "$d/install.sh" ] && [ -f "$d/docker-compose.yaml" ] && [ -d "$d/src/skills/mash-design-setup" ]
}

od_find_stack() {
  local app="$1"
  local from_pin=""
  local pin="${MASH_CONFIG_DIR:-$HOME/.config/mash}/design-stack.json"
  local xdg="${HOME}/.local/share/mash/design"

  if [ -n "${MASH_DESIGN_STACK:-}" ] && [ -d "$MASH_DESIGN_STACK" ]; then
    echo "$MASH_DESIGN_STACK"
    return 0
  fi

  if [ -f "$pin" ] && command -v python3 >/dev/null 2>&1; then
    from_pin="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("stack_root") or "")' "$pin" 2>/dev/null || true)"
    if [ -n "$from_pin" ] && [ -d "$from_pin" ]; then
      echo "$from_pin"
      return 0
    fi
  fi

  if [ -f "$xdg/penpot.env" ] || [ -f "$xdg/docker-compose.yaml" ]; then
    echo "$xdg"
    return 0
  fi

  if [ -f "$app/penpot.env" ] || [ -f "$app/penpot.env.example" ]; then
    echo "$app"
    return 0
  fi

  echo "$xdg"
}

od_find_skills() {
  local start="${1:-}"
  local dir
  local xdg="${HOME}/.cursor/skills"

  dir="${start:-$(pwd -P)}"
  while [ "$dir" != "/" ]; do
    if od_looks_like_toolkit "$dir"; then
      echo "$dir/src/skills"
      return 0
    fi
    dir="$(dirname "$dir")"
  done

  echo "$xdg"
}

od_load() {
  local repo="${1:-}"
  if [ -z "$repo" ]; then
    repo="$(pwd -P)"
  fi
  OD_REPO_ROOT="$repo"
  OD_STACK_ROOT="$(od_find_stack "$repo")"
  OD_SKILLS_ROOT="$(od_find_skills "$repo")"
  OD_AGENTS_ROOT="${HOME}/.cursor/agents"

  if [ -f "$OD_STACK_ROOT/penpot.env" ]; then
    set -a
    # shellcheck disable=SC1091
    . "$OD_STACK_ROOT/penpot.env"
    set +a
  fi

  if [ -n "${OPEN_DESIGN_DAEMON_URL:-}" ]; then
    OD_DAEMON_URL="${OPEN_DESIGN_DAEMON_URL%/}"
  else
    OD_DAEMON_URL="http://127.0.0.1:${OPEN_DESIGN_PORT:-7457}"
  fi
  export OD_DAEMON_URL OD_API_TOKEN OD_REPO_ROOT OD_STACK_ROOT OD_SKILLS_ROOT OD_AGENTS_ROOT
  export STACK="$OD_STACK_ROOT"
  export SKILLS="$OD_SKILLS_ROOT"
  export APP="$OD_REPO_ROOT"
}

od_require_health() {
  if [ -z "${OD_DAEMON_URL:-}" ]; then
    od_load
  fi
  if ! curl -fsS --max-time 5 "$OD_DAEMON_URL/api/health" >/dev/null; then
    echo "OpenDesign daemon is not running. Run \`mds start\` (or invoke the mash-design-setup skill) and retry. Do not start a host \`opendesign\` process." >&2
    echo "Expected $OD_DAEMON_URL/api/health." >&2
    return 1
  fi
  if [ -z "${OD_API_TOKEN:-}" ]; then
    echo "OD_API_TOKEN is missing. Run \`mds setup\` or set OD_API_TOKEN." >&2
    return 1
  fi
}

od_curl() {
  if [ -z "${OD_API_TOKEN:-}" ]; then
    echo "OD_API_TOKEN is missing. Run \`mds setup\` or set OD_API_TOKEN." >&2
    return 1
  fi
  curl -fsS -H "Authorization: Bearer ${OD_API_TOKEN}" "$@"
}
