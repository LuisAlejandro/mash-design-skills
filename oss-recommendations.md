# Open-source recommendations

This repo is a **local toolchain**: Compose Penpot + MCP + OpenDesign, plus Cursor skills that drive that stack. It is not an application a developer runs as their product. Open-sourcing it means packaging the toolkit so someone else can clone it, start the stack, and use the skills **in their own app repo**.

Runtime holes that will fail a first funnel pass live in [`funnel-gaps.md`](funnel-gaps.md). This file is what to change before a public clone is usable. The skill chain is already **one funnel**; do not wait on a second implement family.

```text
od-design-system? → od-design-candidates → [pick winner]
  → penpot-import-html → penpot-create-design-system → penpot-implement-design
  → reviewer → sync → iterator
  → (later) penpot-sync-code-to-design
```

Skip candidates and import when a Penpot frame already exists. That is a second on-ramp, not a second product.

## 1. Name it as a toolkit, not Penpot

The GitHub name `penpot` will confuse people and can collide with Penpot’s trademark. Publish under a **distinct name** (repo, image, skills). The README first paragraph should say:

- this is a local design-to-code toolchain
- it wraps Penpot and OpenDesign; it does not replace them
- the code you implement lives in **your app**, not this clone

Keep Penpot copyright on the compose file you forked. Add a NOTICE that lists Penpot, OpenDesign, figpot, and the agent CLIs.

## 2. License and what you may ship

Add a root **LICENSE** (MIT or Apache-2.0) that covers **your** scripts, skills, Dockerfile, and docs.

That license does not cover everything in the stack:

| Piece | If you publish blindly |
| --- | --- |
| Official Penpot compose (modified) | Keep attribution. Do not imply you are Penpot. |
| `ghcr.io/nexu-io/od` | Follow OpenDesign’s license. |
| **cursor-agent / Claude Code / Codex in the image** | Each user building via official installers is one thing. **Pushing** `penpot-opendesign:local` to GHCR or Docker Hub redistributes those CLIs. Do not publish that fat image. Document `mmd setup` so each clone builds it. |
| Cursor skills | Fine as source. They run in Cursor unless you port them. |

State that this is **local Docker only**, not a hosted SaaS. Current Penpot flags (`disable-email-verification`, `disable-secure-session-cookies`) and `OD_CODEX_SANDBOX=danger-full-access` belong on loopback.

## 3. Split stack from skills

`install.sh` copies skills/agents into the **app**. The Compose stack lives under `~/.local/share/mmd-skills` (or `$MMD_STACK_ROOT`). `mmd setup` / `mmd start` operate on the stack, not the app git root.

MCP: project `.cursor/mcp.json` uses `penpot-local`; user `~/.cursor/mcp.json` shows `user-penpot-local`. Skills accept either. Artifact dirs stay `rosey/designs/` and `rosey/design-system/`. The installer runs per-skill `npm install` and the candidates venv.

## 4. Docs a stranger can follow

See [`README.md`](README.md): clone toolkit → from the app run `install.sh` → open Penpot at `:9001` → **File → MCP Server → Connect**. Fill API keys in the stack `penpot.env` only if you run OpenDesign agent jobs. Compose OpenDesign uses port `7457` so it does not collide with a host Open Design app on `7456`.

[`scope.md`](scope.md) is architecture, not the onboarding path. Do not expose `:9001` with the current Penpot flags.

## 5. Hygiene before the first public commit

- Root LICENSE + NOTICE.
- Do not commit `penpot.env`, `.env`, skill `.env` files, API keys, or `backups/*.sql` (mostly gitignored already).
- Do not commit personal [`.cursor/mcp.json`](.cursor/mcp.json) (Context7 today). Default project MCP should be the example file, copied by the user.
- Gitignore generated design artifacts (`rosey/`, implement state) unless you want sample fixtures.
- Align skill `package.json` `"license"` fields with the root license.

## 6. Cursor vs developers in general

This toolchain is Cursor-shaped: skills, subagents, `mcp.json`. That is a valid OSS project. It is not Claude Code, Copilot, or a CLI app.

If “developers in general” means non-Cursor users, add a second surface later (Make targets, a small CLI, or other agent formats). Do not promise that on day one.

Users still need Docker, a browser tab on the Penpot UI with the MCP plugin connected, and vendor API keys for explore jobs.

## Suggested order

1. Pick a name and a root LICENSE; add NOTICE.
2. Secret / MCP hygiene (example configs only; no personal servers).
3. README that separates stack vs skills and prints the funnel diagram.
4. An install-into-app path for skills.
5. Do not publish the fat OpenDesign image.
6. CONTRIBUTING + SECURITY.
7. Then open the repo.

Do this in parallel with [`funnel-gaps.md`](funnel-gaps.md) if you want a first clone to complete a run, not only to boot Compose.
