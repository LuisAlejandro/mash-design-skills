from __future__ import annotations

import json
import sys
from pathlib import Path

SHARED = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SHARED))

from od_daemon import (  # noqa: E402
    AGENT_UNAVAILABLE_HINT,
    find_app_root,
    find_stack_root,
    load_daemon_config,
    make_start_message,
    parse_agent_ids,
    pick_run_agent,
    _parse_env_file,
)


def test_make_start_message_mentions_mmd_start():
    msg = make_start_message("http://127.0.0.1:7456")
    assert "mmd start" in msg
    assert "mmd-setup" in msg
    assert "opendesign" in msg
    assert "/api/health" in msg
    assert "make start" not in msg


def test_parse_env_file(tmp_path: Path):
    path = tmp_path / "penpot.env"
    path.write_text("OD_API_TOKEN=abc\n# comment\nEMPTY=\nOPEN_DESIGN_PORT=7456\n", encoding="utf-8")
    env = _parse_env_file(path)
    assert env["OD_API_TOKEN"] == "abc"
    assert env["OPEN_DESIGN_PORT"] == "7456"


def test_find_app_root_uses_git(tmp_path: Path):
    (tmp_path / ".git").mkdir()
    nested = tmp_path / "src" / "app"
    nested.mkdir(parents=True)
    assert find_app_root(nested) == tmp_path.resolve()


def test_find_stack_root_prefers_env(tmp_path: Path, monkeypatch):
    stack = tmp_path / "stack"
    stack.mkdir()
    (stack / "penpot.env").write_text("OD_API_TOKEN=from-stack\n", encoding="utf-8")
    monkeypatch.setenv("MMD_STACK_ROOT", str(stack))
    app = tmp_path / "app"
    app.mkdir()
    (app / ".git").mkdir()
    (app / "penpot.env").write_text("OD_API_TOKEN=from-app\n", encoding="utf-8")
    assert find_stack_root(app_root=app) == stack.resolve()


def test_find_stack_root_reads_pin(tmp_path: Path, monkeypatch):
    monkeypatch.delenv("MMD_STACK_ROOT", raising=False)
    stack = tmp_path / "xdg-stack"
    stack.mkdir()
    (stack / "docker-compose.yaml").write_text("x: 1\n", encoding="utf-8")
    (stack / "bin").mkdir()
    (stack / "bin" / "mmd").write_text("#!/bin/sh\n", encoding="utf-8")
    app = tmp_path / "app"
    (app / "rosey").mkdir(parents=True)
    (app / ".git").mkdir()
    (app / "rosey" / "mmd-skills.json").write_text(
        json.dumps({"stack_root": str(stack)}),
        encoding="utf-8",
    )
    assert find_stack_root(app_root=app, start=app) == stack.resolve()


def test_load_daemon_config_reads_stack_not_app(tmp_path: Path, monkeypatch):
    monkeypatch.delenv("OD_API_TOKEN", raising=False)
    monkeypatch.delenv("OPEN_DESIGN_DAEMON_URL", raising=False)
    monkeypatch.delenv("OPEN_DESIGN_PORT", raising=False)
    stack = tmp_path / "stack"
    stack.mkdir()
    (stack / "penpot.env").write_text(
        "OD_API_TOKEN=stack-token\nOPEN_DESIGN_PORT=7456\n", encoding="utf-8"
    )
    monkeypatch.setenv("MMD_STACK_ROOT", str(stack))
    app = tmp_path / "app"
    app.mkdir()
    (app / ".git").mkdir()
    cfg = load_daemon_config(repo_root=app)
    assert cfg.token == "stack-token"
    assert cfg.stack_root == stack.resolve()
    assert cfg.repo_root == app.resolve()
    assert cfg.env_path == stack / "penpot.env"


def test_parse_agent_ids_from_api_payload():
    assert parse_agent_ids({"agents": [{"id": "cursor-agent"}, {"id": "opencode"}]}) == [
        "cursor-agent",
        "opencode",
    ]
    assert parse_agent_ids(["claude", "pi"]) == ["claude", "pi"]


def test_pick_run_agent_env_override(monkeypatch):
    monkeypatch.delenv("CURSOR_API_KEY", raising=False)
    assert (
        pick_run_agent(
            available=["claude", "opencode", "pi"],
            environ={"OPEN_DESIGN_RUN_AGENT": "pi"},
        )
        == "pi"
    )


def test_pick_run_agent_prefers_cursor_when_key_set():
    assert (
        pick_run_agent(
            available=["claude", "cursor-agent", "opencode"],
            environ={"CURSOR_API_KEY": "k"},
        )
        == "cursor-agent"
    )


def test_pick_run_agent_prefers_claude_then_list():
    assert (
        pick_run_agent(
            available=["cursor-agent", "claude", "opencode"],
            environ={},
        )
        == "claude"
    )


def test_pick_run_agent_fails_without_match():
    try:
        pick_run_agent(available=["unknown-bot"], environ={})
    except RuntimeError as exc:
        assert "mmd doctor" in str(exc)
        assert AGENT_UNAVAILABLE_HINT in str(exc)
    else:
        raise AssertionError("expected RuntimeError")
