# Compose OpenDesign daemon helper. Source from skills; never spawn a host daemon.
# Root-relative (.agents/shared/lib) so every harness resolves the same path.
# Usage:
#   REPO="$(git rev-parse --show-toplevel)"
#   . "${REPO}/.agents/shared/lib/od_daemon.sh"
#   od_load
#   od_require_health
#   od_curl --max-time 30 "$OD_DAEMON_URL/api/design-systems"

od_find_stack() {
  local app="$1"
  local from_pin=""
  local xdg="${HOME}/.local/share/mmd-skills"

  if [ -n "${MMD_STACK_ROOT:-}" ] && [ -d "$MMD_STACK_ROOT" ]; then
    echo "$MMD_STACK_ROOT"
    return 0
  fi

  if [ -f "$app/rosey/mmd-skills.json" ] && command -v python3 >/dev/null 2>&1; then
    from_pin="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("stack_root") or "")' "$app/rosey/mmd-skills.json" 2>/dev/null || true)"
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

  echo "$app"
}

od_load() {
  local repo="${1:-}"
  if [ -z "$repo" ]; then
    repo="$(git rev-parse --show-toplevel 2>/dev/null || pwd -P)"
  fi
  OD_REPO_ROOT="$repo"
  OD_STACK_ROOT="$(od_find_stack "$repo")"

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
  export OD_DAEMON_URL OD_API_TOKEN OD_REPO_ROOT OD_STACK_ROOT
}

od_require_health() {
  if [ -z "${OD_DAEMON_URL:-}" ]; then
    od_load
  fi
  if ! curl -fsS --max-time 5 "$OD_DAEMON_URL/api/health" >/dev/null; then
    echo "OpenDesign daemon is not running. Run \`mmd start\` (or invoke the mmd-setup skill) and retry. Do not start a host \`opendesign\` process." >&2
    echo "Expected $OD_DAEMON_URL/api/health." >&2
    return 1
  fi
  if [ -z "${OD_API_TOKEN:-}" ]; then
    echo "OD_API_TOKEN is missing. Run \`mmd setup\` or set OD_API_TOKEN." >&2
    return 1
  fi
}

od_curl() {
  if [ -z "${OD_API_TOKEN:-}" ]; then
    echo "OD_API_TOKEN is missing. Run \`mmd setup\` or set OD_API_TOKEN." >&2
    return 1
  fi
  curl -fsS -H "Authorization: Bearer ${OD_API_TOKEN}" "$@"
}
