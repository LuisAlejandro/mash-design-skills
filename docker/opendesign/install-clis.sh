#!/bin/bash
# Install Linux agent CLIs into /opt and /usr/local/bin (readable by uid 1001).
# Do not leave payloads under /home/open-design: Compose overlays that path.
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

# Publish a CLI onto /usr/local/bin. Payloads that land under HOME are copied
# to /opt/<name> first: Compose mounts open_design_home over /home/open-design
# at runtime, which hides HOME-installed binaries (claude, codex).
publish_bin() {
  local name="$1"
  local link=""
  hash -r
  if [ -e "/usr/local/bin/${name}" ] || [ -L "/usr/local/bin/${name}" ]; then
    link="/usr/local/bin/${name}"
  elif command -v "$name" >/dev/null 2>&1; then
    link="$(command -v "$name")"
  elif [ -e "${HOME}/.local/bin/${name}" ] || [ -L "${HOME}/.local/bin/${name}" ]; then
    link="${HOME}/.local/bin/${name}"
  elif [ -e "${RUNTIME_HOME}/.local/bin/${name}" ] || [ -L "${RUNTIME_HOME}/.local/bin/${name}" ]; then
    link="${RUNTIME_HOME}/.local/bin/${name}"
  fi
  if [ -z "$link" ]; then
    echo "install-clis: $name not on PATH after install" >&2
    return 1
  fi
  local src
  src="$(readlink -f "$link" || true)"
  if [ -z "$src" ] || [ ! -e "$src" ]; then
    echo "install-clis: $name resolved path missing ($link)" >&2
    return 1
  fi

  case "$src" in
    /opt/*|/usr/local/*)
      chmod a+rX "$src" || true
      ln -sfn "$src" "/usr/local/bin/${name}"
      return 0
      ;;
  esac

  local payload
  payload="$(dirname "$src")"
  if [ "$(basename "$payload")" = "bin" ]; then
    payload="$(dirname "$payload")"
  fi
  local dest="/opt/${name}"
  rm -rf "$dest"
  mkdir -p "$dest"
  cp -a "${payload}/." "$dest/"
  chmod -R a+rX "$dest"
  local rel="${src#"${payload}"/}"
  if [ ! -e "${dest}/${rel}" ]; then
    echo "install-clis: $name missing at ${dest}/${rel} after relocate" >&2
    return 1
  fi
  ln -sfn "${dest}/${rel}" "/usr/local/bin/${name}"
  echo "install-clis: relocated $name -> ${dest}/${rel}"
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
# Never `cat > /usr/local/bin/cursor-agent` while it is a symlink into /opt:
# that overwrites the real launcher and `cursor-agent status` exec-loops.
ln -sfn /opt/cursor-agent/cursor-agent /usr/local/bin/cursor-agent
ln -sfn /opt/cursor-agent/cursor-agent /usr/local/bin/agent
echo "install-clis: bundled node"
/opt/cursor-agent/node --version
# Alpine /usr/bin/ldd contains "musl". Cursor's webpack then throws MODULE_NOT_FOUND
# for merkle-tree-napi.linux-*-musl.node, which this linux-gnu build does not embed.
# Force that check off so process.report (glibc 2.36 via copied ld-linux) loads *-gnu.node.
/opt/cursor-agent/node -e '
const fs = require("fs");
const p = "/opt/cursor-agent/index.js";
const from = "r(\"/usr/bin/ldd\",\"utf-8\").includes(\"musl\")";
const s = fs.readFileSync(p, "utf8");
if (!s.includes(from)) {
  console.error("install-clis: cursor-agent musl/ldd pattern not found");
  process.exit(1);
}
fs.writeFileSync(p, s.split(from).join("false"));
console.log("install-clis: disabled Alpine ldd musl check in cursor-agent");
'
if ! timeout 20 cursor-agent status >/tmp/cursor-agent-status.out 2>/tmp/cursor-agent-status.err; then
  echo "install-clis: cursor-agent status failed" >&2
  tail -n 30 /tmp/cursor-agent-status.err >&2 || true
  exit 1
fi
echo "install-clis: cursor-agent status: $(tr -d "\n" < /tmp/cursor-agent-status.out)"

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
cursor-agent --version
claude --version
codex --version
opencode --version
pi --version
