#!/bin/bash
# Install Linux agent CLIs into /usr/local/bin (readable by uid 1001).
set -euo pipefail

export HOME=/root
export PATH="/usr/local/bin:/root/.local/bin:/home/open-design/.local/bin:/root/.opencode/bin:${PATH}"
RUNTIME_HOME=/home/open-design

mkdir -p /root/.local/bin /opt /usr/local/bin \
  "${RUNTIME_HOME}/.local/bin"

retry() {
  local n=0
  local max=4
  until "$@"; do
    n=$((n + 1))
    if [ "$n" -ge "$max" ]; then
      return 1
    fi
    echo "install-clis: retry $n/$max: $*"
    sleep $((n * 2))
  done
}

# Put a HOME-installed binary on /usr/local/bin so uid 1001 can exec it.
publish_bin() {
  local name="$1"
  local src=""
  hash -r
  if [ -x "/usr/local/bin/${name}" ]; then
    src="/usr/local/bin/${name}"
  elif command -v "$name" >/dev/null 2>&1; then
    src="$(command -v "$name")"
  elif [ -x "${HOME}/.local/bin/${name}" ]; then
    src="${HOME}/.local/bin/${name}"
  elif [ -x "${RUNTIME_HOME}/.local/bin/${name}" ]; then
    src="${RUNTIME_HOME}/.local/bin/${name}"
  fi
  if [ -z "$src" ] || [ ! -e "$src" ]; then
    echo "install-clis: $name not on PATH after install" >&2
    return 1
  fi
  chmod a+rX "$src" || true
  if [ "$src" != "/usr/local/bin/${name}" ]; then
    ln -sfn "$src" "/usr/local/bin/${name}"
  fi
}

echo "=== cursor-agent ==="
retry bash -c 'set -o pipefail; curl https://cursor.com/install -fsS | bash'
CURSOR_SRC="$(find /root/.local/share/cursor-agent -type f -name cursor-agent | head -n 1)"
if [ -z "$CURSOR_SRC" ]; then
  echo "install-clis: cursor-agent payload not found under ~/.local/share/cursor-agent" >&2
  find /root/.local -maxdepth 4 -type f | head -n 50 >&2
  exit 1
fi
CURSOR_DIR="$(cd "$(dirname "$CURSOR_SRC")" && pwd)"
rm -rf /opt/cursor-agent
mv "$CURSOR_DIR" /opt/cursor-agent
rm -rf /root/.local/share/cursor-agent
chmod -R a+rX /opt/cursor-agent
# Keep SCRIPT_DIR next to bundled node (see dist-package/cursor-agent).
ln -sfn /opt/cursor-agent/cursor-agent /usr/local/bin/cursor-agent
ln -sfn /opt/cursor-agent/cursor-agent /usr/local/bin/agent
echo "install-clis: bundled node"
/opt/cursor-agent/node --version

echo "=== claude ==="
HOME="${RUNTIME_HOME}"
export HOME
retry bash -c 'set -o pipefail; curl -fsSL https://claude.ai/install.sh | bash'
publish_bin claude

echo "=== codex ==="
HOME="${RUNTIME_HOME}"
export HOME
export CODEX_NON_INTERACTIVE=true
retry sh -c 'set -o pipefail; curl -fsSL https://chatgpt.com/codex/install.sh | sh'
publish_bin codex

echo "=== opencode ==="
HOME=/root
export HOME
retry bash -c 'set -o pipefail; curl -fsSL https://opencode.ai/install | bash'
if [ ! -x /root/.opencode/bin/opencode ]; then
  echo "install-clis: opencode missing after install" >&2
  exit 1
fi
rm -rf /opt/opencode
mv /root/.opencode /opt/opencode
chmod -R a+rX /opt/opencode
ln -sfn /opt/opencode/bin/opencode /usr/local/bin/opencode
ln -sfn /usr/local/bin/opencode /usr/local/bin/opencode-cli

echo "=== pi ==="
HOME="${RUNTIME_HOME}"
export HOME
retry bash -c 'set -o pipefail; curl -fsSL https://pi.dev/install.sh | bash'
publish_bin pi

npm cache clean --force >/dev/null 2>&1 || true
rm -rf /root/.npm /tmp/*

hash -r
NPM_BIN="$(npm prefix -g)/bin"
export PATH="/usr/local/bin:${NPM_BIN}:/root/.local/bin:${RUNTIME_HOME}/.local/bin:/root/.opencode/bin:${PATH}"

echo "=== versions (root) ==="
/opt/cursor-agent/node --version
# Cursor's index.js --version dumps a multi-MB bundle and exits 1.
# OpenDesign probes `cursor-agent --version`; shim that to bundled node --version.
cat > /usr/local/bin/cursor-agent <<'EOF'
#!/bin/bash
set -euo pipefail
REAL=/opt/cursor-agent/cursor-agent
if [ "${1:-}" = "--version" ] || [ "${1:-}" = "-v" ]; then
  /opt/cursor-agent/node --version
  exit 0
fi
exec "$REAL" "$@"
EOF
chmod a+rx /usr/local/bin/cursor-agent
ln -sfn /usr/local/bin/cursor-agent /usr/local/bin/agent
cursor-agent --version
claude --version
codex --version
opencode --version
pi --version
