"""Tests for OpenDesign HTTP client parsing and mocked generate flow."""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))

from generate_candidates import (  # noqa: E402
    generate_candidates,
    write_candidates_metadata,
)
from opendesign_client import (  # noqa: E402
    OpenDesignClient,
    _shared_lib_dir,
    parse_create_response,
    parse_run_start_response,
)
from variation_plan import load_and_validate_variation_plan  # noqa: E402

FIXTURE = SCRIPTS / "fixtures" / "variation-plan.json"


def test_parse_create_response_nested_project():
    stdout = json.dumps(
        {
            "project": {"id": "proj-1"},
            "conversation": {"id": "conv-1"},
        }
    )
    parsed = parse_create_response(stdout)
    assert parsed["project_id"] == "proj-1"
    assert parsed["conversation_id"] == "conv-1"


def test_parse_run_start_response():
    assert parse_run_start_response(json.dumps({"runId": "run-9"})) == "run-9"


def test_write_candidates_metadata(tmp_path: Path):
    design_ctx = {
        "design_system_id": "user:test-ds",
        "design_path": "rosey/design-system/DESIGN.md",
        "checksum": "deadbeef",
        "manifest": {"designSystemId": "user:test-ds"},
    }
    plan = load_and_validate_variation_plan(FIXTURE)
    html = tmp_path / "rosey" / "designs" / "page" / "candidates" / "v1" / "index.html"
    html.parent.mkdir(parents=True)
    html.write_text("<html></html>", encoding="utf-8")
    results = [
        {
            "variation": 1,
            "title": "Direct",
            "rationale": "r",
            "directive": "d",
            "html": html,
            "png": None,
            "project_id": "p1",
            "run_id": "r1",
            "project_metadata_path": str(html.parent / "project-meta.json"),
        }
    ]
    path = write_candidates_metadata(tmp_path, "page", "brief text", design_ctx, plan, results)
    meta = json.loads(path.read_text(encoding="utf-8"))
    assert meta["pageSlug"] == "page"
    assert meta["winnerVariation"] is None
    assert meta["variations"][0]["html"].endswith("v1/index.html")
    assert meta["designSystem"]["designSystemId"] == "user:test-ds"


def test_generate_candidates_with_mock_client(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("CURSOR_API_KEY", "test-key")
    monkeypatch.delenv("OPEN_DESIGN_RUN_AGENT", raising=False)
    ds_dir = tmp_path / "rosey" / "design-system"
    ds_dir.mkdir(parents=True)
    design_md = ds_dir / "DESIGN.md"
    design_md.write_text("# Design\n", encoding="utf-8")
    checksum = hashlib.sha256(b"# Design\n").hexdigest()
    manifest = {
        "designSystemId": "user:mock-ds",
        "designPath": "rosey/design-system/DESIGN.md",
        "designChecksum": checksum,
    }
    designs = tmp_path / "rosey" / "designs"
    designs.mkdir(parents=True)
    (designs / "design-system.json").write_text(json.dumps(manifest), encoding="utf-8")

    plan = load_and_validate_variation_plan(FIXTURE)
    calls: list[tuple] = []
    states = {"run-1": 0, "run-2": 0, "run-3": 0}

    def fake_request(method: str, path: str, **kwargs):
        json_body = kwargs.get("json_body")
        calls.append((method, path, json_body))
        if method == "GET" and path == "/api/health":
            return {"ok": True}
        if method == "GET" and path == "/api/agents":
            return {"agents": [{"id": "cursor-agent"}, {"id": "claude"}, {"id": "opencode"}]}
        if method == "POST" and path == "/api/projects":
            n = len([c for c in calls if c[0] == "POST" and c[1] == "/api/projects"])
            return {"project": {"id": f"proj-{n}"}, "conversationId": f"conv-{n}"}
        if method == "POST" and path == "/api/runs":
            n = len([c for c in calls if c[0] == "POST" and c[1] == "/api/runs"])
            return {"runId": f"run-{n}"}
        if method == "GET" and path.startswith("/api/runs/"):
            run_id = path.rsplit("/", 1)[-1]
            states[run_id] = states.get(run_id, 0) + 1
            status = "succeeded" if states[run_id] >= 1 else "running"
            return {"status": status}
        if method == "GET" and path.endswith("/files"):
            return {"files": [{"name": "index.html", "kind": "html"}]}
        if method == "GET" and "/raw/" in path:
            return f"<html><body>{path}</body></html>"
        if method == "DELETE" and path.startswith("/api/projects/"):
            return {"ok": True}
        raise AssertionError(f"unexpected request: {method} {path}")

    client = OpenDesignClient(
        request_fn=fake_request,
        daemon_url="http://127.0.0.1:9",
        token="test-token",
    )

    result = generate_candidates(
        tmp_path,
        "mock-page",
        "Build a simple hero",
        plan,
        client=client,
        pause_s=0,
        skip_screenshots=True,
        sleep_fn=lambda _s: None,
    )
    assert result["page_slug"] == "mock-page"
    assert len(result["results"]) == 3
    for i in range(1, 4):
        html = tmp_path / "rosey" / "designs" / "mock-page" / "candidates" / f"v{i}" / "index.html"
        assert html.is_file()
    meta = json.loads(result["candidates_json"].read_text(encoding="utf-8"))
    assert len(meta["variations"]) == 3
    assert any(method == "POST" and path == "/api/projects" for method, path, _ in calls)
    assert any(method == "POST" and path == "/api/runs" for method, path, _ in calls)
    run_bodies = [body for method, path, body in calls if method == "POST" and path == "/api/runs"]
    assert run_bodies
    assert all(body["agentId"] == "cursor-agent" for body in run_bodies)


def test_preflight_asks_for_mmd_start(tmp_path: Path):
    def boom(*_args, **_kwargs):
        raise RuntimeError("connection refused")

    client = OpenDesignClient(
        request_fn=boom,
        daemon_url="http://127.0.0.1:9",
        token="test-token",
    )
    ok, reason = client.preflight()
    assert ok is False
    assert "mmd start" in reason


def test_shared_lib_dir_prefers_stack_env(tmp_path: Path, monkeypatch):
    stack = tmp_path / "stack"
    lib = stack / "lib"
    lib.mkdir(parents=True)
    (lib / "od_daemon.py").write_text("TOKEN = 1\n", encoding="utf-8")
    monkeypatch.setenv("MMD_STACK_ROOT", str(stack))
    assert _shared_lib_dir() == lib.resolve()


def test_shared_lib_dir_walks_to_toolkit_checkout():
    shared = _shared_lib_dir()
    assert (shared / "od_daemon.py").is_file()
    assert shared.name == "lib"
