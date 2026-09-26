from __future__ import annotations

import json
import sys
from pathlib import Path

SHARED = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SHARED))

import od_daemon  # noqa: E402
from od_daemon import (  # noqa: E402
    AGENT_UNAVAILABLE_HINT,
    DaemonConfig,
    export_project,
    find_app_root,
    find_skills_root,
    find_stack_root,
    load_daemon_config,
    make_start_message,
    merge_stack_credentials,
    parse_agent_ids,
    pick_run_agent,
    runnable_agent_ids,
    seed_studio_prefs,
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


def test_find_app_root_uses_start(tmp_path: Path):
    nested = tmp_path / "src" / "app"
    nested.mkdir(parents=True)
    assert find_app_root(nested) == nested.resolve()


def test_find_skills_root_prefers_env(tmp_path: Path, monkeypatch):
    skills = tmp_path / "skills"
    skills.mkdir()
    monkeypatch.setenv("MMD_SKILLS_ROOT", str(skills))
    assert find_skills_root(start=tmp_path) == skills.resolve()


def test_find_skills_root_uses_toolkit_tree(tmp_path: Path, monkeypatch):
    monkeypatch.delenv("MMD_SKILLS_ROOT", raising=False)
    monkeypatch.setenv("HOME", str(tmp_path / "home"))
    (tmp_path / "install.sh").write_text("#!/bin/sh\n", encoding="utf-8")
    (tmp_path / "docker-compose.yaml").write_text("x: 1\n", encoding="utf-8")
    (tmp_path / ".cursor" / "skills" / "mmd-setup").mkdir(parents=True)
    nested = tmp_path / "src"
    nested.mkdir()
    assert find_skills_root(start=nested) == (tmp_path / ".cursor" / "skills").resolve()


def test_find_skills_root_falls_back_to_user_dir(tmp_path: Path, monkeypatch):
    monkeypatch.delenv("MMD_SKILLS_ROOT", raising=False)
    home = tmp_path / "home"
    home.mkdir()
    monkeypatch.setenv("HOME", str(home))
    app = tmp_path / "app"
    app.mkdir()
    assert find_skills_root(start=app) == (home / ".cursor" / "skills").resolve()


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
    home = tmp_path / "home"
    home.mkdir()
    monkeypatch.setenv("HOME", str(home))
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


def test_runnable_agent_ids_requires_matching_keys():
    path = ["cursor-agent", "claude", "codex", "opencode", "byok-opencode", "pi"]
    assert runnable_agent_ids(path, {}) == []
    assert runnable_agent_ids(path, {"CURSOR_API_KEY": "k"}) == ["cursor-agent"]
    assert runnable_agent_ids(path, {"ANTHROPIC_API_KEY": "k"}) == [
        "claude",
        "opencode",
        "byok-opencode",
        "pi",
    ]
    assert runnable_agent_ids(path, {"OPENAI_API_KEY": "k"}) == [
        "codex",
        "opencode",
        "byok-opencode",
        "pi",
    ]
    assert runnable_agent_ids(["opencode"], {}, opencode_auth=True) == ["opencode"]


def test_merge_stack_credentials_file_fills_empty_process_env(tmp_path: Path):
    env_path = tmp_path / "penpot.env"
    env_path.write_text("ANTHROPIC_API_KEY=from-file\nCURSOR_API_KEY=\n", encoding="utf-8")
    cfg = DaemonConfig(
        url="http://127.0.0.1:7457",
        token="t",
        repo_root=None,
        env_path=env_path,
        stack_root=tmp_path,
    )
    merged = merge_stack_credentials({"CURSOR_API_KEY": "from-proc"}, cfg)
    assert merged["CURSOR_API_KEY"] == "from-proc"
    assert merged["ANTHROPIC_API_KEY"] == "from-file"


def test_parse_agent_ids_from_api_payload():
    assert parse_agent_ids({"agents": [{"id": "cursor-agent"}, {"id": "opencode"}]}) == [
        "cursor-agent",
        "opencode",
    ]
    assert parse_agent_ids(["claude", "pi"]) == ["claude", "pi"]


def test_parse_agent_ids_skips_unavailable():
    assert parse_agent_ids(
        {
            "agents": [
                {"id": "claude", "available": False},
                {"id": "opencode", "available": True},
                {"id": "pi"},
            ]
        }
    ) == ["opencode", "pi"]
    assert parse_agent_ids(
        {"agents": [{"id": "claude", "available": False}]},
        available_only=False,
    ) == ["claude"]


def test_pick_run_agent_env_override(monkeypatch):
    monkeypatch.delenv("CURSOR_API_KEY", raising=False)
    assert (
        pick_run_agent(
            available=["claude", "opencode", "pi"],
            environ={"OPEN_DESIGN_RUN_AGENT": "pi", "ANTHROPIC_API_KEY": "k"},
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


def test_pick_run_agent_empty_env_errors():
    try:
        pick_run_agent(
            available=["cursor-agent", "claude", "opencode"],
            environ={},
        )
    except RuntimeError as exc:
        assert AGENT_UNAVAILABLE_HINT in str(exc)
        assert "mmd auth" in str(exc)
    else:
        raise AssertionError("expected RuntimeError")


def test_pick_run_agent_prefers_claude_when_anthropic_key():
    assert (
        pick_run_agent(
            available=["cursor-agent", "claude", "opencode"],
            environ={"ANTHROPIC_API_KEY": "k"},
        )
        == "claude"
    )


def test_pick_run_agent_prefers_codex_when_openai_key():
    assert (
        pick_run_agent(
            available=["cursor-agent", "claude", "codex", "opencode", "pi"],
            environ={"OPENAI_API_KEY": "k"},
        )
        == "codex"
    )


def test_pick_run_agent_openai_falls_back_to_opencode_without_codex():
    assert (
        pick_run_agent(
            available=["cursor-agent", "claude", "opencode"],
            environ={"OPENAI_API_KEY": "k"},
        )
        == "opencode"
    )


def test_pick_run_agent_cursor_key_does_not_unlock_opencode():
    assert (
        pick_run_agent(
            available=["opencode", "cursor-agent"],
            environ={"CURSOR_API_KEY": "k"},
        )
        == "cursor-agent"
    )


def test_pick_run_agent_override_must_be_runnable():
    try:
        pick_run_agent(
            available=["claude", "opencode"],
            environ={"OPEN_DESIGN_RUN_AGENT": "claude"},
        )
    except RuntimeError as exc:
        assert "claude" in str(exc)
        assert AGENT_UNAVAILABLE_HINT in str(exc)
    else:
        raise AssertionError("expected RuntimeError")


def test_pick_run_agent_override_must_be_listed():
    try:
        pick_run_agent(
            available=["opencode"],
            environ={"OPEN_DESIGN_RUN_AGENT": "claude", "ANTHROPIC_API_KEY": "k"},
        )
    except RuntimeError as exc:
        assert "claude" in str(exc)
        assert AGENT_UNAVAILABLE_HINT in str(exc)
    else:
        raise AssertionError("expected RuntimeError")


def test_pick_run_agent_fails_without_match():
    try:
        pick_run_agent(available=["unknown-bot"], environ={})
    except RuntimeError as exc:
        assert "mmd auth" in str(exc)
        assert AGENT_UNAVAILABLE_HINT in str(exc)
    else:
        raise AssertionError("expected RuntimeError")


def test_seed_studio_prefs_marks_onboarding_complete():
    body = seed_studio_prefs("cursor-agent", now_ms=1700000000000)
    assert body == {
        "onboardingCompleted": True,
        "agentId": "cursor-agent",
        "privacyDecisionAt": 1700000000000,
    }


def _stub_export(monkeypatch, files: list[dict], contents: dict[str, bytes]):
    monkeypatch.setattr(od_daemon, "list_project_files", lambda project_id, *, config=None: files)

    def _fake_read(project_id, file_path, *, config=None, binary=False):
        return contents[file_path]

    monkeypatch.setattr(od_daemon, "read_project_file", _fake_read)


def test_export_project_writes_nested_files(tmp_path: Path, monkeypatch):
    dest = tmp_path / "out"
    files = [{"name": "assets/icon.svg", "type": "file"}]
    _stub_export(monkeypatch, files, {"assets/icon.svg": b"<svg/>"})
    written = export_project("proj", dest, config=DaemonConfig(
        url="http://x", token="t", repo_root=None, env_path=None,
    ))
    assert written == ["assets/icon.svg"]
    assert (dest / "assets" / "icon.svg").read_bytes() == b"<svg/>"


def test_export_project_rejects_traversal_and_cleans_up(tmp_path: Path, monkeypatch):
    dest = tmp_path / "out"
    files = [
        {"name": "assets/icon.svg", "type": "file"},
        {"name": "../outside.txt", "type": "file"},
    ]
    _stub_export(monkeypatch, files, {
        "assets/icon.svg": b"<svg/>",
        "../outside.txt": b"nope",
    })
    cfg = DaemonConfig(url="http://x", token="t", repo_root=None, env_path=None)
    try:
        export_project("proj", dest, config=cfg)
    except RuntimeError as exc:
        assert "../outside.txt" in str(exc)
    else:
        raise AssertionError("expected RuntimeError")
    assert not (tmp_path / "outside.txt").exists()
    assert list(dest.rglob("*")) == []


def test_export_project_rejects_absolute_path(tmp_path: Path, monkeypatch):
    dest = tmp_path / "out"
    files = [{"name": "/etc/passwd", "type": "file"}]
    _stub_export(monkeypatch, files, {"/etc/passwd": b"nope"})
    cfg = DaemonConfig(url="http://x", token="t", repo_root=None, env_path=None)
    try:
        export_project("proj", dest, config=cfg)
    except RuntimeError as exc:
        assert "/etc/passwd" in str(exc)
    else:
        raise AssertionError("expected RuntimeError")
    assert list(dest.rglob("*")) == []


def test_export_project_rejects_symlink_escape(tmp_path: Path, monkeypatch):
    dest = tmp_path / "out"
    dest.mkdir()
    outside = tmp_path / "outside"
    outside.mkdir()
    (dest / "escape").symlink_to(outside, target_is_directory=True)
    files = [{"name": "escape/payload.txt", "type": "file"}]
    _stub_export(monkeypatch, files, {"escape/payload.txt": b"nope"})
    cfg = DaemonConfig(url="http://x", token="t", repo_root=None, env_path=None)
    try:
        export_project("proj", dest, config=cfg)
    except RuntimeError as exc:
        assert "escape/payload.txt" in str(exc)
    else:
        raise AssertionError("expected RuntimeError")
    assert not (outside / "payload.txt").exists()


def test_export_project_rejects_name_resolving_to_dest_itself(tmp_path: Path, monkeypatch):
    dest = tmp_path / "out"
    files = [{"name": ".", "type": "file"}]
    _stub_export(monkeypatch, files, {".": b"nope"})
    cfg = DaemonConfig(url="http://x", token="t", repo_root=None, env_path=None)
    try:
        export_project("proj", dest, config=cfg)
    except RuntimeError:
        pass
    else:
        raise AssertionError("expected RuntimeError")


def test_export_project_multi_file_partial_rejection_cleans_up_all(tmp_path: Path, monkeypatch):
    dest = tmp_path / "out"
    files = [
        {"name": "a.txt", "type": "file"},
        {"name": "b.txt", "type": "file"},
        {"name": "../c.txt", "type": "file"},
        {"name": "d.txt", "type": "file"},
        {"name": "e.txt", "type": "file"},
    ]
    contents = {
        "a.txt": b"a",
        "b.txt": b"b",
        "../c.txt": b"c",
        "d.txt": b"d",
        "e.txt": b"e",
    }
    _stub_export(monkeypatch, files, contents)
    cfg = DaemonConfig(url="http://x", token="t", repo_root=None, env_path=None)
    try:
        export_project("proj", dest, config=cfg)
    except RuntimeError as exc:
        assert "../c.txt" in str(exc)
    else:
        raise AssertionError("expected RuntimeError")
    assert list(dest.rglob("*")) == []
