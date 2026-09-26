#!/bin/bash
# Install Linux agent CLIs into /opt and /usr/local/bin (readable by uid 1001).
# Do not leave payloads under /home/open-design: Compose overlays that path.
set -euo pipefail

export HOME=/root
export PATH="/usr/local/bin:/root/.local/bin:/home/open-design/.local/bin:/root/.opencode/bin:${PATH}"
RUNTIME_HOME=/home/open-design

: "${CURSOR_AGENT_VERSION:?install-clis: CURSOR_AGENT_VERSION must be pinned}"
: "${CLAUDE_CODE_VERSION:?install-clis: CLAUDE_CODE_VERSION must be pinned}"
: "${CODEX_VERSION:?install-clis: CODEX_VERSION must be pinned}"
: "${OPENCODE_VERSION:?install-clis: OPENCODE_VERSION must be pinned}"
: "${PI_VERSION:?install-clis: PI_VERSION must be pinned}"

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

# Compare a CLI's self-reported --version output against its pinned build
# ARG. Substring match (not exact equality) tolerates each CLI's own
# formatting (a "v" prefix, surrounding text) without weakening the check:
# a real version drift will not appear anywhere in the output.
check_pinned_version() {
  local name="$1"
  local expected="$2"
  hash -r
  local actual
  actual="$("$name" --version 2>&1 | tr -d '\r')"
  case "$actual" in
    *"$expected"*) ;;
    *)
      echo "install-clis: $name installed version '$actual' does not match pinned $expected" >&2
      exit 1
      ;;
  esac
  echo "install-clis: $name version OK (pinned $expected)"
}

echo "=== cursor-agent ==="
case "$(uname -m)" in
  x86_64|amd64) CURSOR_ARCH=x64 ;;
  aarch64|arm64) CURSOR_ARCH=arm64 ;;
  *) echo "install-clis: unsupported arch for cursor-agent: $(uname -m)" >&2; exit 1 ;;
esac
export CURSOR_ARCH
CURSOR_DEST="/root/.local/share/cursor-agent/versions/${CURSOR_AGENT_VERSION}"
export CURSOR_DEST
retry bash -c 'set -o pipefail; mkdir -p "$CURSOR_DEST" && curl -fsSL "https://downloads.cursor.com/lab/${CURSOR_AGENT_VERSION}/linux/${CURSOR_ARCH}/agent-cli-package.tar.gz" | tar --strip-components=1 -xzf - -C "$CURSOR_DEST"'
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
const from = "n(\"/usr/bin/ldd\",\"utf-8\").includes(\"musl\")";
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
check_pinned_version cursor-agent "$CURSOR_AGENT_VERSION"

echo "=== claude ==="
HOME="${RUNTIME_HOME}"
export HOME
retry bash -c 'set -o pipefail; curl -fsSL https://claude.ai/install.sh | bash -s -- "$CLAUDE_CODE_VERSION"'
publish_bin claude
check_pinned_version claude "$CLAUDE_CODE_VERSION"

echo "=== codex ==="
HOME="${RUNTIME_HOME}"
export HOME
export CODEX_NON_INTERACTIVE=true
export CODEX_RELEASE="$CODEX_VERSION"
retry sh -c 'set -o pipefail; curl -fsSL https://chatgpt.com/codex/install.sh | sh'
publish_bin codex
check_pinned_version codex "$CODEX_VERSION"

echo "=== opencode ==="
HOME=/root
export HOME
retry bash -c 'set -o pipefail; curl -fsSL https://opencode.ai/install | VERSION="$OPENCODE_VERSION" bash'
if [ ! -x /root/.opencode/bin/opencode ]; then
  echo "install-clis: opencode missing after install" >&2
  exit 1
fi
rm -rf /opt/opencode
mv /root/.opencode /opt/opencode
chmod -R a+rX /opt/opencode
ln -sfn /opt/opencode/bin/opencode /usr/local/bin/opencode
ln -sfn /usr/local/bin/opencode /usr/local/bin/opencode-cli
check_pinned_version opencode "$OPENCODE_VERSION"

echo "=== pi ==="
HOME=/root
export HOME
rm -rf /opt/pi
retry npm install -g --prefix /opt/pi --ignore-scripts --min-release-age=0 \
  --no-fund --no-audit "@earendil-works/pi-coding-agent@${PI_VERSION}"
chmod -R a+rX /opt/pi
ln -sfn /opt/pi/bin/pi /usr/local/bin/pi
check_pinned_version pi "$PI_VERSION"

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
