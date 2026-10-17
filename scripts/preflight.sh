#!/usr/bin/env bash
# Network-free release checks shared by Push CI and published-tag verification.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
expected_tag="${1:-}"

version="$(tr -d '[:space:]' < VERSION)"
if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "VERSION must be X.Y.Z (got: $version)" >&2
  exit 1
fi

config_version="$(sed -nE 's/^current_version[[:space:]]*=[[:space:]]*//p' .bumpversion.cfg | tr -d '[:space:]')"
if [[ "$config_version" != "$version" ]]; then
  echo ".bumpversion.cfg ($config_version) does not match VERSION ($version)" >&2
  exit 1
fi
if [[ -n "$expected_tag" && "$expected_tag" != "$version" ]]; then
  echo "Release tag ($expected_tag) does not match VERSION ($version)" >&2
  exit 1
fi

for file in install.sh uninstall.sh convert.sh bin/mds scripts/preflight.sh scripts/lib.sh scripts/release.sh scripts/rollback.sh docker-compose.yaml .gitchangelog.rc .gitchangelog.tpl RELEASE_DESCRIPTION.md HISTORY.md headless/package.json headless/package-lock.json headless/src/server.ts; do
  if [[ ! -f "$file" ]]; then
    echo "Missing release input: $file" >&2
    exit 1
  fi
done

for file in install.sh uninstall.sh convert.sh bin/mds scripts/*.sh docker/opendesign/*.sh; do
  bash -n "$file"
done
if [[ "$(bash install.sh --version)" != "$version" ]]; then
  echo "Installer version does not match VERSION ($version)" >&2
  exit 1
fi

# All shipped version literals must agree; the headless package is built at this tag.
python3 - "$version" <<'PY'
import json
import re
import sys
from pathlib import Path

version = sys.argv[1]
package = json.loads(Path("headless/package.json").read_text(encoding="utf-8"))
lock = json.loads(Path("headless/package-lock.json").read_text(encoding="utf-8"))
checks = {
    "headless/package.json": package.get("version"),
    "headless/package-lock.json": lock.get("version"),
    "headless/package-lock.json root package": lock.get("packages", {}).get("", {}).get("version"),
}
for path, pattern in (
    ("install.sh", r'^INSTALL_VERSION="([^"]+)"$'),
    ("headless/src/server.ts", r"^    version: '([^']+)',\s*$"),
):
    match = re.search(pattern, Path(path).read_text(encoding="utf-8"), re.MULTILINE)
    checks[path] = match.group(1) if match else None
for path, actual in checks.items():
    if actual != version:
        raise SystemExit(f"{path} version {actual!r} does not match VERSION {version!r}")
PY

printf 'Release inputs, version literals and shell syntax verified for %s\n' "$version"
