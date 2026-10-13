"""HTTP client for the Compose OpenDesign daemon (no host CLI)."""

from __future__ import annotations

import json
import logging
import os
import sys
import time
import uuid
from pathlib import Path
from typing import Any, Callable

logger = logging.getLogger(__name__)

def _shared_lib_dir() -> Path:
    env = os.environ.get("MASH_DESIGN_STACK", "").strip()
    if env:
        lib = Path(env).expanduser() / "lib"
        if (lib / "od_daemon.py").is_file():
            return lib.resolve()
    pin = Path(os.environ.get("MASH_CONFIG_DIR", "")).expanduser() if os.environ.get("MASH_CONFIG_DIR", "").strip() else Path.home() / ".config" / "mash"
    pin_file = pin / "design-stack.json"
    if pin_file.is_file():
        try:
            raw = json.loads(pin_file.read_text(encoding="utf-8")).get("stack_root") or ""
        except (OSError, json.JSONDecodeError):
            raw = ""
        if raw:
            lib = Path(raw).expanduser() / "lib"
            if (lib / "od_daemon.py").is_file():
                return lib.resolve()
    xdg = Path.home() / ".local" / "share" / "mash" / "design" / "lib"
    if (xdg / "od_daemon.py").is_file():
        return xdg.resolve()
    for candidate in Path(__file__).resolve().parents:
        lib = candidate / "scripts"
        if (lib / "od_daemon.py").is_file():
            return lib
    raise FileNotFoundError(
        "Cannot find od_daemon.py. Run install.sh from the Mash Design Skills toolkit."
    )


SHARED_DIR = _shared_lib_dir()
if str(SHARED_DIR) not in sys.path:
    sys.path.insert(0, str(SHARED_DIR))

from od_daemon import (  # noqa: E402
    AGENT_UNAVAILABLE_HINT,
    DaemonConfig,
    MISSING_TOKEN_HINT,
    api_request,
    check_health,
    load_daemon_config,
    make_start_message,
    parse_agent_ids,
    pick_run_agent,
    pick_run_model,
    read_project_file,
)

PLUGIN_ID = "example-web-prototype"
SKIP_DISCOVERY_PREFIX = "skip questions, just build. no questions, go.\n\n"
OPENDESIGN_RUN_POLL_INTERVAL_S = 5
OPENDESIGN_RUN_POLL_MAX_ATTEMPTS = 120
DEFAULT_DAEMON_URL = "http://127.0.0.1:7457"

OUTPUT_CONTRACT = """Output contract (hard requirements):
- Produce exactly one file named index.html in the project root.
- One polished screen only — not a multi-page site or screen gallery.
- Use the OpenDesign design system attached to this project; the DESIGN.md excerpt below is an additional guardrail.
- Use real, brief-specific copy. No lorem ipsum, filler sections, or placeholder stats.
- Self-contained HTML with inline CSS and minimal JS only.
"""

RequestFn = Callable[..., Any]


class OpenDesignClient:
    def __init__(
        self,
        daemon_url: str | None = None,
        token: str | None = None,
        request_fn: RequestFn | None = None,
        repo_root: Path | None = None,
    ) -> None:
        cfg = load_daemon_config(repo_root=repo_root)
        self.daemon_url = (daemon_url or cfg.url).rstrip("/")
        self.token = token if token is not None else cfg.token
        self._request_fn = request_fn
        self._config = DaemonConfig(
            url=self.daemon_url,
            token=self.token,
            repo_root=cfg.repo_root,
            env_path=cfg.env_path,
        )

    def _request(
        self,
        method: str,
        path: str,
        *,
        json_body: Any = None,
        auth: bool = True,
        raw: bool = False,
        timeout: float = 30,
    ) -> Any:
        if self._request_fn is not None:
            return self._request_fn(
                method,
                path,
                json_body=json_body,
                auth=auth,
                raw=raw,
            )
        return api_request(
            method,
            path,
            config=self._config,
            json_body=json_body,
            auth=auth,
            timeout=timeout,
            raw=raw,
        )

    def preflight(self) -> tuple[bool, str]:
        if self._request_fn is None:
            ok, reason = check_health(self._config)
            if not ok:
                return False, reason or make_start_message(self.daemon_url)
        else:
            try:
                data = self._request("GET", "/api/health", auth=False)
            except Exception as exc:  # noqa: BLE001
                return False, make_start_message(self.daemon_url, str(exc))
            if isinstance(data, dict) and data.get("ok") is False:
                return False, make_start_message(self.daemon_url, "health returned ok=false")
        if not self.token:
            return False, MISSING_TOKEN_HINT
        return True, ""

    def resolve_run_agent(self) -> str:
        available: list[str] | None = None
        try:
            payload = self._request("GET", "/api/agents")
            available = parse_agent_ids(payload)
        except Exception as exc:  # noqa: BLE001
            override = (os.environ.get("OPEN_DESIGN_RUN_AGENT") or "").strip()
            if not override:
                raise RuntimeError(AGENT_UNAVAILABLE_HINT) from exc
            available = []
        return pick_run_agent(available=available)

    def resolve_run_model(self) -> str:
        """Explicit --model wins; otherwise OPEN_DESIGN_RUN_MODEL ("" = Auto)."""
        return pick_run_model(config=self._config)

    def create_project(
        self,
        name: str,
        *,
        design_system_id: str,
        metadata_json_path: Path | None = None,
    ) -> dict[str, Any]:
        metadata: dict[str, Any] | None = None
        if metadata_json_path is not None and metadata_json_path.is_file():
            loaded = json.loads(metadata_json_path.read_text(encoding="utf-8"))
            if isinstance(loaded, dict):
                metadata = loaded
        body: dict[str, Any] = {
            "id": f"od-{uuid.uuid4().hex[:16]}",
            "name": name,
            "pluginId": PLUGIN_ID,
            "designSystemId": design_system_id,
            "skipDiscoveryBrief": True,
        }
        if metadata:
            body["metadata"] = metadata
        data = self._request("POST", "/api/projects", json_body=body)
        parsed = parse_create_response(json.dumps(data) if not isinstance(data, str) else data)
        if isinstance(data, dict):
            parsed["raw"] = data
        if not parsed.get("project_id"):
            raise RuntimeError(f"project create missing project id: {data}")
        return {"project_id": parsed["project_id"], "conversation_id": parsed.get("conversation_id")}

    def run_until_complete(
        self,
        project_id: str,
        message: str,
        *,
        conversation_id: str | None = None,
        model: str | None = None,
        poll_interval_s: float = OPENDESIGN_RUN_POLL_INTERVAL_S,
        max_attempts: int = OPENDESIGN_RUN_POLL_MAX_ATTEMPTS,
        sleep_fn: Callable[[float], None] | None = None,
    ) -> str:
        sleep = sleep_fn or time.sleep
        run_message = SKIP_DISCOVERY_PREFIX + message.strip()
        agent_id = self.resolve_run_agent()
        if model is None:
            model = self.resolve_run_model()
        body: dict[str, Any] = {
            "projectId": project_id,
            "agentId": agent_id,
            "message": run_message,
            "currentPrompt": run_message,
            "pluginId": PLUGIN_ID,
        }
        if conversation_id:
            body["conversationId"] = conversation_id
        if model:
            body["model"] = model

        data = self._request("POST", "/api/runs", json_body=body)
        run_id = parse_run_start_response(json.dumps(data) if not isinstance(data, str) else data)
        if not run_id:
            raise RuntimeError(f"run start missing runId: {data}")

        state = ""
        for attempt in range(max_attempts):
            sleep(poll_interval_s)
            try:
                status = self._request("GET", f"/api/runs/{run_id}")
                if not isinstance(status, dict):
                    status = json.loads(status)
                state = str(status.get("status") or "")
                if state in ("complete", "completed", "succeeded"):
                    return run_id
                if state in ("failed", "cancelled", "canceled"):
                    error_msg = status.get("error", "")
                    error_code = status.get("errorCode", "")
                    raise RuntimeError(
                        f"Run {run_id} failed with state: {state}"
                        f" (errorCode={error_code}, error={error_msg})"
                    )
            except RuntimeError:
                raise
            except Exception as exc:  # noqa: BLE001
                if attempt % 6 == 0:
                    logger.warning("Poll error: %s", exc)

        raise RuntimeError(
            f"Run {run_id} timed out after {max_attempts * poll_interval_s}s "
            f"(last status: {state or 'unknown'})"
        )

    def export_html(self, project_id: str, dest: Path) -> None:
        data = self._request("GET", f"/api/projects/{project_id}/files")
        if isinstance(data, str):
            data = json.loads(data)
        files = data.get("files", []) if isinstance(data, dict) else data
        entry = None
        for item in files or []:
            name = str(item.get("name") or item.get("path") or "")
            kind = str(item.get("kind") or "")
            if name == "index.html" or kind == "html":
                entry = name
                break
        if not entry:
            for item in files or []:
                name = str(item.get("name") or item.get("path") or "")
                if name.endswith(".html"):
                    entry = name
                    break
        if not entry:
            raise RuntimeError(f"No HTML artifact found in project {project_id}")

        if self._request_fn is not None:
            html_out = self._request("GET", f"/api/projects/{project_id}/raw/{entry}", raw=True)
            if isinstance(html_out, bytes):
                html_out = html_out.decode("utf-8")
        else:
            html_out = read_project_file(project_id, entry, config=self._config)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(str(html_out), encoding="utf-8")

    def delete_project(self, project_id: str) -> None:
        try:
            self._request("DELETE", f"/api/projects/{project_id}")
        except Exception as exc:  # noqa: BLE001
            logger.warning("Failed to delete project %s: %s", project_id, exc)


def parse_create_response(stdout: str) -> dict[str, Any]:
    """Parse project create JSON (HTTP body or CLI leftover)."""
    data = json.loads(stdout) if isinstance(stdout, str) else stdout
    project = data.get("project") or {}
    project_id = project.get("id") or data.get("projectId") or data.get("id")
    conversation_id = data.get("conversationId")
    if not conversation_id and isinstance(data.get("conversation"), dict):
        conversation_id = data["conversation"].get("id")
    return {"project_id": project_id, "conversation_id": conversation_id, "raw": data}


def parse_run_start_response(stdout: str) -> str:
    data = json.loads(stdout) if isinstance(stdout, str) else stdout
    run_id = data.get("runId") or data.get("id") or ""
    if not run_id:
        raise RuntimeError(f"run start missing runId: {data}")
    return str(run_id)
