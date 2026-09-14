"""Compose OpenDesign daemon helper (Bearer token, no host CLI)."""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any

DEFAULT_DAEMON_URL = "http://127.0.0.1:7457"
DEFAULT_PORT = "7457"
ENV_FILENAMES = ("penpot.env",)
DEFAULT_STACK = Path.home() / ".local" / "share" / "mmd-skills"
PIN_RELATIVE = Path("rosey") / "mmd-skills.json"
START_HINT = (
    "OpenDesign daemon is not running. Run `mmd start` (or invoke the mmd-setup "
    "skill) and retry. Do not start a host `opendesign` process."
)
MISSING_TOKEN_HINT = (
    "OD_API_TOKEN is missing. Run `mmd setup` (or copy penpot.env.example to "
    "penpot.env in the stack root) and retry. You can also export OD_API_TOKEN."
)
AGENT_UNAVAILABLE_HINT = (
    "No runnable OpenDesign agent. Run `mmd auth` to save CURSOR_API_KEY / "
    "ANTHROPIC_API_KEY / OPENAI_API_KEY in the stack penpot.env, then `mmd start`. "
    "Or set OPEN_DESIGN_RUN_AGENT to a harness that is on PATH and authenticated. "
    "Do not invent HTML."
)
CREDENTIAL_ENV_KEYS = ("CURSOR_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY")
PREFERRED_RUN_AGENTS = ("claude", "codex", "opencode", "pi")
MAKE_START_HINT = START_HINT

SKIP_EXPORT_PREFIXES = ("context/", "logs/", ".git/")


@dataclass(frozen=True)
class DaemonConfig:
    url: str
    token: str
    repo_root: Path | None
    env_path: Path | None
    stack_root: Path | None = None


def _parse_env_file(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    if not path.is_file():
        return env
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        env[key.strip()] = value.strip().strip("'").strip('"')
    return env


def _walk_up(start: Path | None = None) -> list[Path]:
    current = (start or Path.cwd()).resolve()
    if current.is_file():
        current = current.parent
    return [current, *current.parents]


def _looks_like_stack(path: Path) -> bool:
    return (
        (path / "penpot.env").is_file()
        or (path / "penpot.env.example").is_file()
        or ((path / "docker-compose.yaml").is_file() and (path / "bin" / "mmd").is_file())
    )


def find_app_root(start: Path | None = None) -> Path | None:
    """Git toplevel of the app (artifacts, copied skills)."""
    for candidate in _walk_up(start):
        if (candidate / ".git").exists():
            return candidate
    return None


def find_repo_root(start: Path | None = None) -> Path | None:
    """App git root. Not the Compose stack (see find_stack_root)."""
    return find_app_root(start)


def _stack_from_pin(app_root: Path | None) -> Path | None:
    if app_root is None:
        return None
    pin = app_root / PIN_RELATIVE
    if not pin.is_file():
        return None
    try:
        data = json.loads(pin.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    raw = data.get("stack_root") if isinstance(data, dict) else None
    if not isinstance(raw, str) or not raw.strip():
        return None
    path = Path(raw.strip()).expanduser()
    if path.is_dir():
        return path.resolve()
    return None


def find_stack_root(
    *,
    app_root: Path | None = None,
    start: Path | None = None,
) -> Path | None:
    """Directory that holds penpot.env and docker-compose.yaml."""
    env = os.environ.get("MMD_STACK_ROOT", "").strip()
    if env:
        path = Path(env).expanduser()
        if path.is_dir():
            return path.resolve()

    pin_stack = _stack_from_pin(app_root)
    if pin_stack is not None:
        return pin_stack

    default = DEFAULT_STACK
    if default.is_dir() and _looks_like_stack(default):
        return default.resolve()

    for candidate in _walk_up(start):
        if _looks_like_stack(candidate):
            return candidate

    if app_root is not None and _looks_like_stack(app_root):
        return app_root.resolve()
    return None


def load_daemon_config(
    *,
    repo_root: Path | None = None,
    stack_root: Path | None = None,
    start: Path | None = None,
) -> DaemonConfig:
    """Load daemon URL + token from the stack env. Process env overrides penpot.env."""
    app = repo_root.resolve() if repo_root else find_app_root(start)
    stack = stack_root.resolve() if stack_root else find_stack_root(app_root=app, start=start)
    file_env: dict[str, str] = {}
    env_path: Path | None = None
    if stack:
        for name in ENV_FILENAMES:
            path = stack / name
            if path.is_file():
                file_env = _parse_env_file(path)
                env_path = path
                break

    url_override = os.environ.get("OPEN_DESIGN_DAEMON_URL", "").strip()
    if url_override:
        url = url_override.rstrip("/")
    else:
        port = os.environ.get("OPEN_DESIGN_PORT") or file_env.get("OPEN_DESIGN_PORT") or DEFAULT_PORT
        url = f"http://127.0.0.1:{port}"

    token = os.environ.get("OD_API_TOKEN", "").strip() or file_env.get("OD_API_TOKEN", "").strip()
    return DaemonConfig(
        url=url.rstrip("/"),
        token=token,
        repo_root=app,
        env_path=env_path,
        stack_root=stack,
    )


def health_url(url: str) -> str:
    return f"{url.rstrip('/')}/api/health"


def make_start_message(url: str, detail: str = "") -> str:
    suffix = f" ({detail})" if detail else ""
    return f"{START_HINT} Expected {health_url(url)}.{suffix}"


def api_request(
    method: str,
    path: str,
    *,
    config: DaemonConfig | None = None,
    json_body: Any = None,
    auth: bool = True,
    timeout: float = 30,
    raw: bool = False,
) -> Any:
    cfg = config or load_daemon_config()
    relative = path if path.startswith("/") else f"/{path}"
    url = f"{cfg.url}{relative}"
    data: bytes | None = None
    headers: dict[str, str] = {"Accept": "*/*"}
    if json_body is not None:
        data = json.dumps(json_body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    if auth:
        if not cfg.token:
            raise RuntimeError(MISSING_TOKEN_HINT)
        headers["Authorization"] = f"Bearer {cfg.token}"

    req = urllib.request.Request(url, data=data, headers=headers, method=method.upper())
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            payload = resp.read()
            if raw:
                return payload
            if not payload:
                return {}
            content_type = resp.headers.get("Content-Type", "")
            if "json" in content_type or payload[:1] in (b"{", b"["):
                return json.loads(payload.decode("utf-8"))
            return payload.decode("utf-8")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{method.upper()} {url} failed ({exc.code}): {body}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(make_start_message(cfg.url, str(exc.reason))) from exc


def check_health(config: DaemonConfig | None = None, timeout: float = 5) -> tuple[bool, str]:
    cfg = config or load_daemon_config()
    try:
        data = api_request("GET", "/api/health", config=cfg, auth=False, timeout=timeout)
    except RuntimeError as exc:
        return False, str(exc)
    except Exception as exc:  # noqa: BLE001
        return False, make_start_message(cfg.url, str(exc))

    if isinstance(data, dict) and data.get("ok") is False:
        return False, make_start_message(cfg.url, "health returned ok=false")
    return True, ""


def require_health(config: DaemonConfig | None = None) -> DaemonConfig:
    cfg = config or load_daemon_config()
    ok, reason = check_health(cfg)
    if not ok:
        raise RuntimeError(reason)
    return cfg


def merge_stack_credentials(
    environ: dict[str, str],
    config: DaemonConfig | None,
) -> dict[str, str]:
    """Process env wins when non-empty; otherwise stack penpot.env."""
    merged = dict(environ)
    file_env: dict[str, str] = {}
    if config is not None and config.env_path is not None:
        file_env = _parse_env_file(config.env_path)
    for key in CREDENTIAL_ENV_KEYS:
        if not str(merged.get(key, "")).strip() and file_env.get(key, "").strip():
            merged[key] = file_env[key].strip()
    return merged


def credential_flags(environ: dict[str, str]) -> dict[str, bool]:
    return {key: bool(str(environ.get(key, "")).strip()) for key in CREDENTIAL_ENV_KEYS}


def runnable_agent_ids(
    path_ids: list[str],
    environ: dict[str, str],
    *,
    opencode_auth: bool = False,
) -> list[str]:
    """Harnesses that are on PATH and have matching credentials.

    ``opencode_auth`` is an optional probe (non-empty container auth.json).
    Do not treat OpenCode as runnable from PATH alone.
    """
    path = {ident for ident in path_ids if ident}
    flags = credential_flags(environ)
    anthropic_or_openai = flags["ANTHROPIC_API_KEY"] or flags["OPENAI_API_KEY"]
    out: list[str] = []
    if "cursor-agent" in path and flags["CURSOR_API_KEY"]:
        out.append("cursor-agent")
    if "claude" in path and flags["ANTHROPIC_API_KEY"]:
        out.append("claude")
    if "codex" in path and flags["OPENAI_API_KEY"]:
        out.append("codex")
    opencode_ready = anthropic_or_openai or opencode_auth
    if "opencode" in path and opencode_ready:
        out.append("opencode")
    if "byok-opencode" in path and opencode_ready:
        out.append("byok-opencode")
    if "pi" in path and anthropic_or_openai:
        out.append("pi")
    return out


def parse_agent_ids(payload: Any, *, available_only: bool = True) -> list[str]:
    """Return agent ids from GET /api/agents.

    Dict entries with ``available: false`` are omitted by default so pickers
    do not select catalog names whose CLIs are missing in the container.
    String ids and dicts without an ``available`` field stay eligible.
    """
    if payload is None:
        return []
    if isinstance(payload, list):
        items = payload
    elif isinstance(payload, dict):
        items = payload.get("agents") or payload.get("items") or payload.get("data") or []
        if isinstance(items, dict):
            items = list(items.values())
        if not items and isinstance(payload.get("id"), str):
            ident = str(payload["id"]).strip()
            if ident and not (available_only and payload.get("available") is False):
                return [ident]
            return []
    else:
        return []
    out: list[str] = []
    seen: set[str] = set()
    for item in items if isinstance(items, list) else []:
        ident = ""
        skip = False
        if isinstance(item, str):
            ident = item.strip()
        elif isinstance(item, dict):
            ident = str(item.get("id") or item.get("agentId") or item.get("name") or "").strip()
            skip = available_only and item.get("available") is False
        if ident and ident not in seen and not skip:
            seen.add(ident)
            out.append(ident)
    return out


def list_run_agents(*, config: DaemonConfig | None = None) -> list[str]:
    return parse_agent_ids(api_request("GET", "/api/agents", config=config))


def pick_run_agent(
    *,
    available: list[str] | None = None,
    environ: dict[str, str] | None = None,
    config: DaemonConfig | None = None,
    opencode_auth: bool = False,
) -> str:
    if environ is None:
        env = merge_stack_credentials(dict(os.environ), config or load_daemon_config())
    else:
        env = merge_stack_credentials(dict(environ), config)
    override = (env.get("OPEN_DESIGN_RUN_AGENT") or "").strip()
    ids = list(available) if available is not None else list_run_agents(config=config)
    if override:
        path_for_override = ids if ids else [override]
        runnable = runnable_agent_ids(path_for_override, env, opencode_auth=opencode_auth)
        if override not in runnable:
            listed = ", ".join(runnable) if runnable else "(none)"
            raise RuntimeError(
                f"OpenDesign agent {override!r} is not runnable ({listed}). "
                f"{AGENT_UNAVAILABLE_HINT}"
            )
        return override
    runnable = runnable_agent_ids(ids, env, opencode_auth=opencode_auth)
    prefer: list[str] = []
    if credential_flags(env)["CURSOR_API_KEY"]:
        prefer.append("cursor-agent")
    prefer.extend(PREFERRED_RUN_AGENTS)
    for name in prefer:
        if name in runnable:
            return name
    raise RuntimeError(AGENT_UNAVAILABLE_HINT)


def encode_file_path(file_path: str) -> str:
    segments = [urllib.parse.quote(part, safe="") for part in file_path.split("/") if part]
    return "/".join(segments)


def list_project_files(project_id: str, *, config: DaemonConfig | None = None) -> list[dict[str, Any]]:
    data = api_request("GET", f"/api/projects/{urllib.parse.quote(project_id, safe='')}/files", config=config)
    if isinstance(data, dict):
        files = data.get("files") or []
        if isinstance(files, list):
            return [f for f in files if isinstance(f, dict)]
    if isinstance(data, list):
        return [f for f in data if isinstance(f, dict)]
    return []


def read_project_file(
    project_id: str,
    file_path: str,
    *,
    config: DaemonConfig | None = None,
    binary: bool = False,
) -> bytes | str:
    encoded_id = urllib.parse.quote(project_id, safe="")
    encoded_path = encode_file_path(file_path)
    payload = api_request(
        "GET",
        f"/api/projects/{encoded_id}/raw/{encoded_path}",
        config=config,
        raw=True,
        timeout=60,
    )
    if binary:
        return payload if isinstance(payload, bytes) else str(payload).encode("utf-8")
    if isinstance(payload, bytes):
        return payload.decode("utf-8")
    return str(payload)


def _should_skip_export(name: str, excludes: tuple[str, ...]) -> bool:
    normalized = name.lstrip("./")
    for prefix in excludes:
        if normalized == prefix.rstrip("/") or normalized.startswith(prefix):
            return True
    return False


def export_project(
    project_id: str,
    dest: Path,
    *,
    config: DaemonConfig | None = None,
    excludes: tuple[str, ...] = SKIP_EXPORT_PREFIXES,
) -> list[str]:
    cfg = config or load_daemon_config()
    files = list_project_files(project_id, config=cfg)
    written: list[str] = []
    dest.mkdir(parents=True, exist_ok=True)
    for entry in files:
        name = str(entry.get("name") or entry.get("path") or "")
        kind = str(entry.get("type") or entry.get("kind") or "file")
        if not name or kind in {"dir", "directory"}:
            continue
        if _should_skip_export(name, excludes):
            continue
        payload = read_project_file(project_id, name, config=cfg, binary=True)
        target = dest / name
        target.parent.mkdir(parents=True, exist_ok=True)
        if isinstance(payload, str):
            target.write_text(payload, encoding="utf-8")
        else:
            target.write_bytes(payload)
        written.append(name)
    if not written:
        raise RuntimeError(f"No exportable files found in OpenDesign project {project_id}")
    return written


def _cli(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="OpenDesign Compose daemon helper")
    sub = parser.add_subparsers(dest="command", required=True)

    health = sub.add_parser("health", help="GET /api/health (unauthenticated)")
    health.add_argument("--repo-root", type=Path, default=None)
    health.add_argument("--stack-root", type=Path, default=None)

    print_cfg = sub.add_parser("print-config", help="Print daemon URL (never print the token)")
    print_cfg.add_argument("--repo-root", type=Path, default=None)
    print_cfg.add_argument("--stack-root", type=Path, default=None)

    pick = sub.add_parser("pick-agent", help="Pick an OpenDesign run agentId")
    pick.add_argument("--repo-root", type=Path, default=None)
    pick.add_argument("--stack-root", type=Path, default=None)

    export = sub.add_parser("export-project", help="Download project files via HTTP")
    export.add_argument("--project-id", required=True)
    export.add_argument("--dest", required=True, type=Path)
    export.add_argument("--exclude", action="append", default=[])
    export.add_argument("--repo-root", type=Path, default=None)
    export.add_argument("--stack-root", type=Path, default=None)

    args = parser.parse_args(argv)
    cfg = load_daemon_config(
        repo_root=getattr(args, "repo_root", None),
        stack_root=getattr(args, "stack_root", None),
    )

    if args.command == "health":
        ok, reason = check_health(cfg)
        if not ok:
            print(reason, file=sys.stderr)
            return 1
        print(f"ok {cfg.url}")
        return 0

    if args.command == "print-config":
        print(f"OD_DAEMON_URL={cfg.url}")
        print(f"OD_API_TOKEN_SET={'true' if cfg.token else 'false'}")
        print(f"OD_STACK_ROOT={cfg.stack_root or ''}")
        return 0

    if args.command == "pick-agent":
        require_health(cfg)
        print(pick_run_agent(config=cfg))
        return 0

    if args.command == "export-project":
        require_health(cfg)
        excludes = tuple(args.exclude) if args.exclude else SKIP_EXPORT_PREFIXES
        written = export_project(args.project_id, args.dest.resolve(), config=cfg, excludes=excludes)
        print(f"exported {len(written)} files to {args.dest}")
        return 0

    return 1


if __name__ == "__main__":
    sys.exit(_cli())
