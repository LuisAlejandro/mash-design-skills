---
name: od-design-system
description: Creates an OpenDesign design-system package by seeding an agent-managed OpenDesign draft from root DESIGN.md. Phase 0 creates or improves root DESIGN.md from the implemented frontend, then later phases create a draft, open its workspace, run workspace generation, optionally revise, publish, copy the generated workspace package to rosey/design-system, and write an async manifest.
---

# Create OpenDesign Design System Package

## Communication while using this skill

**Caveman full** for assistant status prose while this skill runs: drop articles, use fragments when clear, prefer short synonyms, and keep technical terms exact. Technical accuracy unchanged; quoted errors, code, API payloads, and command output unchanged. Drop full for security warnings, irreversible confirmations, ambiguous multi-step instructions, user confusion, required input questions, or when the user asks for normal or long-form wording.

**Artifact boundary:** Caveman full applies to chat and status prose, not copied `DESIGN.md` content, async manifests, daemon responses, generated package metadata, or validation output.

## Overview

Use this skill to create the OpenDesign design-system package that later feeds `od-design-candidates` and `penpot-create-design-system`.

The workflow first ensures the source folder has a high-quality root `DESIGN.md`. Phase 0 always runs: when `DESIGN.md` exists, improve it for accuracy, specificity, and missing sections; when it does not exist, generate it from the implemented frontend using [`phase-0-extract-design-system.md`](phase-0-extract-design-system.md). Phase 1 and later always receive that `DESIGN.md`, create an OpenDesign draft with the root `DESIGN.md` as `body`, open the agent-managed design-system workspace, run workspace generation through OpenDesign `/api/runs` on the Compose daemon, audit the package through the daemon endpoint, optionally apply one revision, publish the draft, copy the generated workspace package to `rosey/design-system` via HTTP, and write an async manifest.

Talk to the daemon at `http://127.0.0.1:7457` only. Never spawn a host `opendesign` process. Never merge host `~/.config/opencode/opencode.json`. The workspace agent is picked by `od_daemon.py pick-agent`. Set `OPEN_DESIGN_RUN_AGENT` to force `opencode` or `pi` when that harness is on PATH and authenticated.

## Interaction Mode

Parse `$ARGUMENTS` for at most one interaction mode token:

- `mode:interactive` — default. May ask blocking questions for optional inputs.
- `mode:non-interactive` — scripted or consumer execution (for example DesignCandidates bootstrap). No blocking questions; use conservative defaults for optional inputs.

Strip the mode token before resolving inputs. If no mode token is present, set `INTERACTION_MODE=interactive`.

When `INTERACTION_MODE=non-interactive`:

- Do not use blocking question tools or wait for user confirmation.
- Skip optional revision offers unless `revisionFeedback` is already provided.
- Proceed through publish, copy to `rosey/design-system`, and manifest write without prompts.

## Inputs

Ask for or infer:

- `sourceDir`: optional absolute path to a local folder. When omitted, use the current workspace root folder. Phase 0 always creates or improves root `DESIGN.md` here before OpenDesign draft creation.
- `appRoot`: optional frontend app directory for Phase 0 when the UI is nested.
- `focus`: optional Phase 0 area to improve, such as tokens, components, accessibility, or responsive behavior.
- `name`: optional display name for the OpenDesign design system.
- `summary`: optional short product summary for OpenDesign metadata. Default: infer from `DESIGN.md` or README.
- `sourceNotes`: optional instructions or evidence notes for the OpenDesign workspace agent. Default: tell OpenDesign to preserve and expand the prepared root `DESIGN.md`.
- `provenanceNotes`: optional additional provenance notes for OpenDesign metadata.
- `revisionFeedback`: optional feedback to apply after draft creation.
- `sectionTitle`: optional target section for revision feedback.
- `daemonUrl`: optional override. Default is `OPEN_DESIGN_DAEMON_URL` or `http://127.0.0.1:7457`.

Workspace generation agent: run `python3 .agents/shared/lib/od_daemon.py pick-agent`. Default is `cursor-agent` if `CURSOR_API_KEY` is set, then `claude` if Anthropic, then `codex` if OpenAI. `OPEN_DESIGN_RUN_AGENT` can force `opencode` or `pi` when that harness is on PATH **and** has matching Anthropic or OpenAI credentials. Unauthenticated OpenCode is not a default. If nothing is runnable, stop and tell the user to run `mmd auth` then `mmd start`.

## Workflow

### Phase 0: Create Or Improve `DESIGN.md`

Resolve `SOURCE_DIR` first:

```bash
SOURCE_DIR="${SOURCE_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd -P)}"
test "${SOURCE_DIR#/}" != "$SOURCE_DIR"
test -d "$SOURCE_DIR"
```

Run the full extraction workflow in [`phase-0-extract-design-system.md`](phase-0-extract-design-system.md) with `outputPath` fixed to `$SOURCE_DIR/DESIGN.md`.

- If `$SOURCE_DIR/DESIGN.md` already exists, Phase 0 improves it: make it more accurate, specific, complete, and grounded in current code. Preserve good existing content, but remove stale or generic claims.
- If `$SOURCE_DIR/DESIGN.md` does not exist, Phase 0 creates it from the implemented frontend.
- Phase 0 must finish with `test -f "$SOURCE_DIR/DESIGN.md"`.
- Track whether Phase 0 `created` or `improved` the file for the handoff.

Do not rely on OpenDesign daemon generation as a substitute for Phase 0. Phase 1 always starts with a root `DESIGN.md` present.

### Phase 1: Validate Source And Daemon

When `sourceDir` is omitted, use the current workspace root folder. The resolved source must be an absolute directory with root `DESIGN.md` created or improved by Phase 0.

The Compose OpenDesign daemon must already be running (`mmd start`, or invoke **mmd-setup**). `GET /api/health` is unauthenticated. Every other `/api/*` call must send `Authorization: Bearer $OD_API_TOKEN` from the **stack** `penpot.env` (process env `OD_API_TOKEN` / `OPEN_DESIGN_DAEMON_URL` win). If health fails, stop and tell the user to run `mmd start` (or **mmd-setup**). Never start a host sidecar. Never merge host OpenCode config.

```bash
command -v curl >/dev/null
command -v jq >/dev/null

REPO="$(git rev-parse --show-toplevel 2>/dev/null || pwd -P)"
# shellcheck source=../../../.agents/shared/lib/od_daemon.sh
. "${REPO}/.agents/shared/lib/od_daemon.sh"
od_load "$REPO"
od_require_health

SOURCE_DIR="${SOURCE_DIR:-$REPO}"
test "${SOURCE_DIR#/}" != "$SOURCE_DIR"
test -d "$SOURCE_DIR"
test -f "$SOURCE_DIR/DESIGN.md"
echo "Source DESIGN.md: present; draft will use it"

AGENT_ID="$(python3 "${REPO}/.agents/shared/lib/od_daemon.py" pick-agent)"
DAEMON="$OD_DAEMON_URL"
```

Do not create drafts from folders under OpenDesign desktop runtime data.

| Gate | What runs | Verified by |
| --- | --- | --- |
| 1 Draft creation | POST `/api/design-systems` | Created draft ID |
| 2 Project creation | POST `/api/design-systems/:id/workspace` | Workspace Project ID |
| 3 Setup context | POST `/api/projects/:id/files` | File created |
| 4 Generation run | POST `/api/runs` | Run status `succeeded` |
| 5 Quality audit | GET `/api/projects/:id/design-system-package-audit` | Audit OK |
| 6 Publish | PATCH `/api/design-systems/:id` | Published status |

### Phase 2: Create Seeded Draft

Use the daemon HTTP API to create an agent-managed OpenDesign draft. Seed `body` with the prepared root `DESIGN.md`; this preserves the repository-grounded design-system documentation instead of relying on daemon local import heuristics. Keep `summary` short and put instructions/evidence in `sourceNotes` or `provenance.notes`.

```bash
DAEMON="${DAEMON:-$OD_DAEMON_URL}"
DAEMON="${DAEMON:-http://127.0.0.1:7457}"
DESIGN_SYSTEM_NAME="${DESIGN_SYSTEM_NAME:-$(basename "$SOURCE_DIR") Design System}"

if [ -z "${DESIGN_SYSTEM_SUMMARY:-}" ]; then
  DESIGN_SYSTEM_SUMMARY=$(
    awk '
      /^## / { in_section = ($0 ~ /^## (Overview|Product Context|Product|Brand|0\. Scope)/); next }
      in_section && NF {
        sub(/^[[:space:]-]+/, "")
        print
        exit
      }
    ' "$SOURCE_DIR/DESIGN.md"
  )
fi
DESIGN_SYSTEM_SUMMARY="${DESIGN_SYSTEM_SUMMARY:-Design system seeded from $SOURCE_DIR/DESIGN.md.}"

DESIGN_SYSTEM_SOURCE_NOTES="${DESIGN_SYSTEM_SOURCE_NOTES:-Existing root DESIGN.md is the canonical seed. Preserve its accurate codebase-grounded tokens, components, UX patterns, and implementation rules, then expand into a full OpenDesign package with README, SKILL.md, tokens, previews, source evidence, and ui_kits/app.}"
DESIGN_SYSTEM_PROVENANCE_NOTES="${DESIGN_SYSTEM_PROVENANCE_NOTES:-Goal: combine the accuracy of the existing repository-grounded DESIGN.md with the richer OpenDesign package generation.}"

DS=$(od_curl --max-time 30 -X POST "$DAEMON/api/design-systems" \
  -H 'Content-Type: application/json' \
  -d "$(jq -n \
    --rawfile body "$SOURCE_DIR/DESIGN.md" \
    --arg title "$DESIGN_SYSTEM_NAME" \
    --arg summary "$DESIGN_SYSTEM_SUMMARY" \
    --arg sourceDir "$SOURCE_DIR" \
    --arg sourceNotes "$DESIGN_SYSTEM_SOURCE_NOTES" \
    --arg provenanceNotes "$DESIGN_SYSTEM_PROVENANCE_NOTES" \
    '{
      title: $title,
      summary: $summary,
      category: "Custom",
      surface: "web",
      status: "draft",
      artifactMode: "agent-managed",
      body: $body,
      sourceNotes: $sourceNotes,
      provenance: {
        localCodeFiles: [$sourceDir],
        notes: $provenanceNotes
      }
    }')" \
  | jq -r '.designSystem.id')

test -n "$DS"
test "$DS" != "null"
echo "Created seeded design-system draft: $DS"
```

### Phase 3: Open Workspace And Generate Package

Open the agent-managed design-system workspace. The workspace copies the seeded `DESIGN.md` into an OpenDesign project where the OpenDesign agent can build the richer package files. Workspace generation writes into the workspace project directory, not automatically into the user design-system package directory.

```bash
WORKSPACE=$(od_curl --max-time 30 -X POST "$DAEMON/api/design-systems/$DS/workspace" \
  -H 'Content-Type: application/json')

PROJECT_ID=$(echo "$WORKSPACE" | jq -r '.project.id // .projectId // empty')

test "$PROJECT_ID" != ""
echo "Opened design-system workspace project: $PROJECT_ID"
```

Create the setup source-context manifest before starting `/api/runs`. This mirrors the OpenDesign UI setup flow: write `context/source-context.md` into the project through the daemon project file endpoint, then make the agent read it first.

```bash
SOURCE_CONTEXT=$(cat <<EOF
# Design System Source Context

This file is generated during setup and should be treated as source evidence for the design-system project. Use it before writing or revising DESIGN.md, previews, tokens, UI kit examples, or assets.

## Company / Product

Canonical design-system title: $DESIGN_SYSTEM_NAME

$DESIGN_SYSTEM_SUMMARY

## GitHub Repositories

- None linked.

Connector status: GitHub connector is not configured; repository intake will use local git credentials or authenticated GitHub CLI when possible.

## Local Code

OpenDesign cannot read the host filesystem. Phase 0 already seeded this project's DESIGN.md over HTTP. Expand the package from that seeded DESIGN.md only. Do not run `local-design-context` against a host path. There is no Compose bind-mount of the app.

Copied browser-selected code snapshot files under \`context/local-code/\`: none.

## Design And Brand Resources

Figma files selected: none.

Locally parsed Figma summaries under \`context/figma/\`: none.

Fonts, logos, and assets selected: none.

Uploaded brand asset files under \`assets/\`: none.

## Notes

$DESIGN_SYSTEM_PROVENANCE_NOTES

## Review Contract

- \`/design-systems/create\` only collected setup inputs. All GitHub extraction, local evidence intake, source reading, design-system construction, package audit, and artifact writes should happen inside this project workspace.
- DESIGN.md is the canonical source of truth.
- Use the canonical design-system title above for headings, README/SKILL names, preview labels, and UI-kit copy unless inspected evidence proves a more accurate product name. Never title the system from URL protocol text such as \`https\`.
- colors_and_type.css should hold concrete reusable tokens when the source evidence supports them; if fonts/ contains preserved font files, colors_and_type.css must bind those files with @font-face, @import, or url(...) references so typography does not fall back to substitute fonts.
- README.md and SKILL.md should make the extracted system reusable as a real Open Design design-system package.
- README.md should include a source-backed Product Overview/Product Context section, source repository or source folder references, package contents, a concrete \`## Preview Manifest\` listing every generated \`preview/*.html\` card, and reuse workflow, similar to Claude Design exports.
- SKILL.md should include YAML frontmatter with \`name\`, \`description\`, and \`user-invocable\`, plus Claude-style reusable skill sections: What is inside, Source context, When to use this skill, How to use, and Design system highlights. The usage guidance should point agents at README.md, DESIGN.md, colors_and_type.css, preview/, assets/, build/, fonts/, source_examples/, and ui_kits/app/.
- README.md, SKILL.md, DESIGN.md, and ui_kits/app/README.md must describe the final focused preview cards and \`ui_kits/app/\` paths, not old scaffold names such as \`preview/typography-scale.html\` or \`ui_kits/generated_interface/\`.
- preview/ should contain small reviewable HTML cards for typography, color themes, spacing, radius, shadows, brand assets, and component evidence.
- source_examples/ or equivalent root/nested source files should preserve selected high-signal original components when snapshots include substantial app/component source, similar to Claude Design exports that keep files like SelectModelButton.tsx or ChatNavBar/index.tsx alongside the package. These examples should contain substantive original implementation code, not tiny stubs that only share the component name.
- ui_kits/app/ should contain an applied interface example, plus substantive role-based files under \`ui_kits/app/components/\` when the source snapshots include representative app shells, navigation, chat/input surfaces, or reusable components. \`ui_kits/app/README.md\` should explain structure, component files, usage, design notes, and source basis. \`ui_kits/app/index.html\` must load \`../../colors_and_type.css\`, must load/import/compose the modular component files, and must mount/render the composed interface instead of staying as a standalone generic static mock or disconnected script list. If the entry directly loads \`.jsx\`/\$.tsx\` files, include React, ReactDOM, and Babel standalone scripts and expose each loaded component as \`window.ComponentName\` / \`globalThis.ComponentName\`, or write compiled browser-ready JavaScript instead. For chat/workspace evidence, cover app shell, sidebar/navigation, assistant/list rail, chat area, input bar/composer, and message bubble/comment roles; the app shell component must compose those roles into one product-like surface. Placeholder component shells are not sufficient.
- Claude-style UI-kit entry contract:
  - When \`ui_kits/app/components/*.jsx\` or \`*.tsx\` files exist, \`ui_kits/app/index.html\` must behave like a runnable browser entry, not a static mock.
  - Use the same structure as Claude Design exports: load React, ReactDOM, and Babel standalone scripts, load \`../../colors_and_type.css\`, create a \`#root\`, load each component script from \`components/\`, then render the composed \`App\` component.
  - \`App.jsx\` must assign \`window.App = App\` (or \`globalThis.App = App\`), and every directly loaded component file must expose the same browser global for its component name.
  - Use this skeleton for direct JSX component kits, replacing the component list only when evidence supports different names:
    \`\`\`html
    <script src="https://unpkg.com/react@18.3.1/umd/react.development.js"></script>
    <script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js"></script>
    <script src="https://unpkg.com/@babel/standalone@7.29.0/babel.min.js"></script>
    <link rel="stylesheet" href="../../colors_and_type.css">
    <div id="root"></div>
    <script type="text/babel" src="components/Sidebar.jsx"></script>
    <script type="text/babel" src="components/AssistantsList.jsx"></script>
    <script type="text/babel" src="components/ChatArea.jsx"></script>
    <script type="text/babel" src="components/MessageBubble.jsx"></script>
    <script type="text/babel" src="components/InputBar.jsx"></script>
    <script type="text/babel" src="components/App.jsx"></script>
    <script type="text/babel">
    const { App } = window;
    const root = ReactDOM.createRoot(document.getElementById('root'));
    root.render(<App />);
    </script>
    \`\`\`
- Preview cards and UI-kit visuals should explicitly label or model source-backed modules from the captured evidence instead of generic placeholder modules.
- assets/, build/, fonts/, and context/ should preserve logos, app icons, tray icons, installer/runtime icons, wordmarks, font files, provenance, and source notes for future projects.
- Claude-style build asset contract:
  - When evidence includes \`context/.../files/build/...\`, create a root \`build/\` directory and copy representative runtime assets there with their original filenames and path intent, such as \`build/icon.png\`, \`build/logo.png\`, \`build/tray_icon.png\`, and \`build/icon.ico\`.
  - Copy those runtime assets byte-for-byte from the captured \`context/.../files/...\` snapshots. Do not redraw, re-encode, optimize, or substitute generated placeholders for files that the evidence already captured.
  - Do not satisfy build/runtime icon evidence by only renaming those files into \`assets/\`. \`assets/\` may include convenience aliases, but root \`build/\` must preserve the source runtime files for future agents and package consumers.
  - \`preview/brand-assets.html\` should reference at least some real preserved files from \`build/\` or \`assets/\` with <img>, <picture>, <object>, or CSS \`url(...)\`, and README.md / SKILL.md should mention \`build/\` in the package manifest when it exists.
- preview/brand-assets.html should visibly reference preserved files from assets/ or build/ instead of recreating logos/icons as inline placeholder drawings.
- GitHub evidence must come from the bounded \`github-design-context\` command, not direct connector tree/content/raw tool calls. The command tries this-device git first, authenticated GitHub CLI second, and connector-platform fallback only when local access cannot read the repository.
- Linked local folder evidence is the HTTP-seeded DESIGN.md. Do not run \`local-design-context\` on a host path.
- Before marking the design system ready, run \`"\$OD_NODE_BIN" "\$OD_BIN" tools connectors design-system-package-audit --path . --fail-on-warnings\` and fix every reported error or warning.
- Draft design systems cannot be used by other projects until published.

## Source Notes

$DESIGN_SYSTEM_SOURCE_NOTES
EOF
)

od_curl --max-time 30 -X POST "$DAEMON/api/projects/$PROJECT_ID/files" \
  -H 'Content-Type: application/json' \
  -d "$(jq -n \
    --arg name "context/source-context.md" \
    --arg content "$SOURCE_CONTEXT" \
    '{name: $name, content: $content}')" \
  | jq -e '.file' >/dev/null
```

Run package generation before copying through the same `/api/runs` path used by the OpenDesign UI. Pick the agent with `od_daemon.py pick-agent` (`OPEN_DESIGN_RUN_AGENT` can force `opencode` or `pi` when runnable). OpenDesign agents run in the Compose container; do not edit host OpenCode config.

````bash
test -n "$PROJECT_ID"

AGENT_ID="$(python3 "${REPO}/.agents/shared/lib/od_daemon.py" pick-agent)"
MODEL="${MODEL:-}"

GENERATION_PROMPT=$(cat <<'EOF'
Create this project as a complete Open Design design system workspace.

Autonomy requirement:
- Do not ask setup or clarification questions during design-system generation.
- Do not emit `<question-form>`, "Quick brief — 30 seconds", direction cards, choice cards, or any UI that waits for user input.
- The setup page already collected the brief. If target surfaces, review priority, or workspace depth are missing, choose sensible defaults and begin generating the design-system artifacts immediately.

Project boundary:
- All GitHub extraction, local evidence intake, source reading, design-system construction, package audit, and final artifact writes must happen inside this project workspace and this project chat run.
- Treat `/design-systems/create` as setup only. Do not depend on that page for progress, review, or generated output; the project is the source of truth.

Use the files in this project as the design system source for future projects. Update `DESIGN.md` as the canonical rules document, and update supporting files when they make the system easier to review or reuse.

Expected output:
- A clear `DESIGN.md` with product context, visual foundations, color, type, spacing, layout, components, motion, voice, and anti-patterns.
- A Claude Design-quality package: `README.md`, `SKILL.md`, `colors_and_type.css`, provenance notes, `assets/`, `build/` when runtime icons exist, optional `fonts/`, category-specific `preview/` cards, and a reusable `ui_kits/app/` example.
- Write `README.md` as a reusable package guide, not only a generated file list. Include a source-backed Product Overview/Product Context section that explains what the product is, the primary UI surfaces, and the core capabilities evidenced by README/package/source files; include source repository or source folder references, package contents, preview manifest, and reuse workflow.
- README.md must include a concrete `## Preview Manifest` section that lists each generated `preview/*.html` card by exact path, what reviewers should inspect there, and which source-backed components, tokens, assets, or fonts it demonstrates. Keep this manifest synchronized with the actual `preview/` files.
- Preserve real source assets when evidence provides them: logos, app icons, tray icons, avatars, wordmarks, and font files belong in `assets/`, `build/`, or `fonts/`, not in prose-only notes. When source files include build/runtime icon assets such as installer icons, tray icons, app icons, or wordmarks under build/resources paths, preserve representative files under `build/` as Claude Design does. When multiple source logos/icons/fonts are captured, preserve a representative set instead of collapsing everything into one generic logo or font. If font files are preserved, bind them in `colors_and_type.css` with `@font-face`, `@import`, or `url(...)` references so previews and UI kits actually render the brand typeface.
Claude-style build asset contract:
- When evidence includes `context/.../files/build/...`, create a root `build/` directory and copy representative runtime assets there with their original filenames and path intent, such as `build/icon.png`, `build/logo.png`, `build/tray_icon.png`, and `build/icon.ico`.
- Copy those runtime assets byte-for-byte from the captured `context/.../files/...` snapshots. Do not redraw, re-encode, optimize, or substitute generated placeholders for files that the evidence already captured.
- Do not satisfy build/runtime icon evidence by only renaming those files into `assets/`. `assets/` may include convenience aliases, but root `build/` must preserve the source runtime files for future agents and package consumers.
- `preview/brand-assets.html` should reference at least some real preserved files from `build/` or `assets/` with `<img>`, `<picture>`, `<object>`, or CSS `url(...)`, and README.md / SKILL.md should mention `build/` in the package manifest when it exists.
- Preserve high-signal source component examples when evidence provides substantial app/component code. Copy at least a few real, substantive source-backed examples outside `context/` (for example `source_examples/SelectModelButton.tsx`, `source_examples/ChatNavBar/index.tsx`, or root/nested TSX files) so future agents can inspect the original implementation patterns without digging through intake snapshots. Do not replace captured source examples with tiny filename-only stubs.
- Split review previews into focused cards instead of one generic page. Prefer cards such as `preview/colors-primary.html`, `preview/colors-theme-light.html`, `preview/colors-theme-dark.html`, `preview/typography-specimens.html`, `preview/spacing-tokens.html`, `preview/spacing-radius.html`, `preview/spacing-shadows.html`, `preview/components-buttons.html`, `preview/components-inputs.html`, and `preview/brand-assets.html` when evidence supports them. `preview/brand-assets.html` must visibly load the preserved files from `assets/` or `build/` with real `img`, `picture`, `object`, or CSS `url(...)` references; do not redraw brand marks as inline placeholders when source assets were captured.
- Write `SKILL.md` as an agent-usable Claude Design-style skill entry, not only a loose Markdown note. Include YAML frontmatter with `name`, `description`, and `user-invocable`, then include reusable sections for `What is inside`, `Source context`, `When to use this skill`, `How to use`, and `Design system highlights`. Those sections should tell future agents to read README.md, DESIGN.md, colors_and_type.css, preview/, assets/, build/, fonts/, source_examples/, and ui_kits/app/ before generating artifacts.
- Build `ui_kits/app/` as an applied interface kit with `index.html`, a reusable README, and modular component files when the evidence includes representative product surfaces. `ui_kits/app/README.md` should document the kit structure, component files, usage workflow, design notes, and source basis, not only say the kit exists. `ui_kits/app/index.html` must load `../../colors_and_type.css`, must load/import/compose the modular component files under `ui_kits/app/components/`, and must mount/render the composed interface into the page; if it directly loads `.jsx`/`.tsx` files, include React, ReactDOM, and Babel standalone scripts and expose each loaded component as `window.ComponentName` / `globalThis.ComponentName`, or write compiled browser-ready JavaScript instead. Do not leave the entry page as a standalone generic static mock or disconnected script list when component files exist. For chat/workspace evidence, include substantive role-based components under `ui_kits/app/components/`: `App.jsx`, `Sidebar.jsx`, a list/rail component such as `AssistantsList.jsx`, a main workspace component such as `ChatArea.jsx`, an input/composer such as `InputBar.jsx`, and a message/comment component such as `MessageBubble.jsx`; the app shell component must compose the role components into one product-like surface; do not write one-line placeholder components.
Claude-style UI-kit entry contract:
- When `ui_kits/app/components/*.jsx` or `*.tsx` files exist, `ui_kits/app/index.html` must behave like a runnable browser entry, not a static mock.
- Use the same structure as Claude Design exports: load React, ReactDOM, and Babel standalone scripts, load `../../colors_and_type.css\`, create a `#root`, load each component script from `components/`, then render the composed `App` component.
- `App.jsx` must assign `window.App = App` (or `globalThis.App = App`), and every directly loaded component file must expose the same browser global for its component name.
- Use this skeleton for direct JSX component kits, replacing the component list only when evidence supports different names:
```html
<script src="https://unpkg.com/react@18.3.1/umd/react.development.js"></script>
<script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js"></script>
<script src="https://unpkg.com/@babel/standalone@7.29.0/babel.min.js"></script>
<link rel="stylesheet" href="../../colors_and_type.css">
<div id="root"></div>
<script type="text/babel" src="components/Sidebar.jsx"></script>
<script type="text/babel" src="components/AssistantsList.jsx"></script>
<script type="text/babel" src="components/ChatArea.jsx"></script>
<script type="text/babel" src="components/MessageBubble.jsx"></script>
<script type="text/babel" src="components/InputBar.jsx"></script>
<script type="text/babel" src="components/App.jsx"></script>
<script type="text/babel">
const { App } = window;
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
</script>
```
- Preview cards and UI-kit visuals should name or model high-signal source components from the evidence, such as the captured sidebar, chat, composer, message, artifact, modal, avatar, or selector files. Avoid anonymous generic examples when concrete source component names are available.
- If older scaffold names exist (`preview/colors-node-types.html`, `preview/colors-ui-palette.html`, `preview/typography-scale.html`, `preview/spacing-system.html`, `preview/logo-variants.html`, or `ui_kits/generated_interface/`), replace them with the focused Claude-style structure above instead of extending the old generic files.
- Keep `README.md`, `SKILL.md`, `DESIGN.md`, and `ui_kits/app/README.md` in sync with the final file structure; do not leave manifest text pointing to older preview names or `ui_kits/generated_interface/`.
- Reviewable previews must appear in the right-side `Design System` tab and show real modules with preview cards, not a standalone marketing page or a single placeholder panel.

Core execution order:
1. Read `DESIGN.md` and `context/source-context.md` first. DESIGN.md was seeded over HTTP in Phase 0. Expand from that file. Do not run `local-design-context` or any host-path intake.
2. Do not invent tokens from URL text or the host folder name. Preserve concrete evidence already in this project workspace.
3. Before writing the remaining design-system files, inventory the seeded DESIGN.md for product identity, color/theme tokens, font families, brand assets, and components.
4. After that inventory, update the project files directly and keep the `Design System` tab reviewable.

Completion gate:
- For each linked GitHub repository, there must be a `context/github/*.md` evidence note plus command-written snapshots under `context/github/*/files/` before writing final design-system rules or previews. The snapshots should include theme/token/source files and any available binary assets or fonts selected by the intake command.
- Do not call GitHub connector tree/content/raw tools directly from the agent. Use only the bounded `github-design-context` command listed in `context/source-context.md`; it tries this-device git first, authenticated GitHub CLI second, then connector-platform fallback when local access cannot read the repository.
- If the bounded command records `Read method: git-clone`, treat those this-device snapshots as the primary evidence. If it records `Read method: connector`, treat the connector-platform snapshots as valid fallback evidence and continue.
- For private repositories, local git credentials or GitHub CLI authentication (`gh auth login --web`) are preferred intake paths because the command still writes local evidence snapshots.
- If the bounded command cannot write snapshots at all, stop with the permission, GitHub CLI login, connection, rate-limit, or clone issue. Do not substitute ad-hoc public GitHub browsing, memory, or URL-only inference.
- Finish only after the project contains reviewable design-system artifacts: `DESIGN.md`, `README.md`, `SKILL.md`, reusable token/style files, focused preview HTML cards, UI-kit examples, preserved assets/fonts when supported, and provenance/context notes.
- Before your final response, run `"$OD_NODE_BIN" "$OD_BIN" tools connectors design-system-package-audit --path . --fail-on-warnings`. Fix every audit error and design-quality warning, including generic visual artifacts, thin source-backed modules, stale manifest paths, and missing representative assets/fonts. If an issue cannot be fixed because source evidence is missing, explain that blocker instead of claiming the design system is ready.
EOF
)

GENERATION_PROMPT=$(printf '%s\n\nDesign system workspace title:\n%s\n\nUse this title for README.md, SKILL.md, DESIGN.md, preview labels, and ui_kits/app copy unless the inspected source evidence proves a better product name. Do not derive the title from URL protocol text such as `https`.\n\nCompany / design system context:\n%s\n\nSource context manifest:\n- Read `context/source-context.md` and the seeded DESIGN.md before drafting. OpenDesign cannot see host paths. Expand from the HTTP-seeded DESIGN.md only. Do not run local-design-context.\n\nProvided resources:\n%s\n\nKeep this scoped to the design-system project. When finished, summarize which files should be reviewed first.' \
  "$GENERATION_PROMPT" \
  "$DESIGN_SYSTEM_NAME" \
  "$DESIGN_SYSTEM_SUMMARY" \
  "$DESIGN_SYSTEM_SOURCE_NOTES")

RUN_BODY=$(jq -n \
  --arg projectId "$PROJECT_ID" \
  --arg agentId "$AGENT_ID" \
  --arg message "$GENERATION_PROMPT" \
  --arg model "$MODEL" \
  '{
    projectId: $projectId,
    agentId: $agentId,
    message: $message,
    currentPrompt: $message,
    clientRequestId: ("od-design-system-" + (now | tostring))
  } + (if $model == "" then {} else {model: $model} end)')

RUN_ID=$(od_curl --max-time 30 -X POST "$DAEMON/api/runs" \
  -H 'Content-Type: application/json' \
  -H 'X-OD-Client: web' \
  -d "$RUN_BODY" \
  | jq -r '.runId')

test -n "$RUN_ID"
test "$RUN_ID" != "null"
echo "Started workspace generation run: $RUN_ID"

STATUS=queued
ATTEMPTS=0
until [ "$STATUS" = "succeeded" ] || [ "$STATUS" = "failed" ] || [ "$STATUS" = "canceled" ]; do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [ "$ATTEMPTS" -gt 1800 ]; then
    echo "Timeout waiting for OpenDesign generation run $RUN_ID." >&2
    exit 1
  fi
  sleep 2
  STATUS=$(od_curl --max-time 10 "$DAEMON/api/runs/$RUN_ID" | jq -r '.status')
  echo "run $RUN_ID status=$STATUS"
done

test "$STATUS" = "succeeded"
````

Audit the generated workspace through the daemon endpoint. Fix every error and warning before copying. For missing or thin files, start another focused `/api/runs` generation on the same `PROJECT_ID`. Repeat the audit until `.audit.ok` is `true`.

```bash
AUDIT=$(od_curl --max-time 30 "$DAEMON/api/projects/$PROJECT_ID/design-system-package-audit")
echo "$AUDIT" | jq '.audit'
test "$(echo "$AUDIT" | jq -r '.audit.ok')" = "true"
```

Do not treat the draft as ready until the daemon audit passes and the workspace file list includes reviewable package artifacts. After Phase 6 export, verify the copied files:

```bash
FILES=$(od_curl --max-time 30 "$DAEMON/api/projects/$PROJECT_ID/files")
echo "$FILES" | jq -e '
  (.files // []) | map(.name // .path) |
  any(. == "DESIGN.md") and any(. == "README.md") and any(. == "SKILL.md")
' >/dev/null
```

When `revisionFeedback` is used after workspace generation, rerun `/api/runs` against the accepted draft and repeat these checks before publish/copy.

### Phase 4: Apply Revision When Requested

Skip this step when `revisionFeedback` is empty. Revision jobs create pending changes for the draft; accept the `revisionId` returned by the completed job. Do not query “latest pending”, because concurrent jobs can create unrelated pending revisions. If a revision is accepted after the workspace exists, run or continue workspace generation again before publish/copy so package artifacts reflect the accepted draft.

```bash
JOB=$(od_curl --max-time 30 -X POST "$DAEMON/api/design-systems/$DS/revision-jobs" \
  -H 'Content-Type: application/json' \
  -d "$(jq -n \
    --arg feedback "$REVISION_FEEDBACK" \
    --arg sectionTitle "$SECTION_TITLE" \
    '{
      feedback: $feedback
    } + (if $sectionTitle == "" then {} else {sectionTitle: $sectionTitle} end)')" \
  | jq -r '.job.id')

STATUS=queued
ATTEMPTS=0
until [ "$STATUS" = "succeeded" ] || [ "$STATUS" = "failed" ]; do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [ "$ATTEMPTS" -gt 120 ]; then
    echo "Timeout waiting for revision job $JOB." >&2
    exit 1
  fi
  sleep 1
  STATUS=$(od_curl --max-time 10 "$DAEMON/api/design-systems/generation-jobs/$JOB" | jq -r .job.status)
done

JOB_JSON=$(od_curl --max-time 10 "$DAEMON/api/design-systems/generation-jobs/$JOB")
echo "$JOB_JSON" | jq '{status: .job.status, revisionId: .job.revisionId, error: .job.error}'

test "$STATUS" = "succeeded"

REV=$(echo "$JOB_JSON" | jq -r '.job.revisionId')

test -n "$REV"
test "$REV" != "null"

od_curl --max-time 30 -X PATCH "$DAEMON/api/design-systems/$DS/revisions/$REV" \
  -H 'Content-Type: application/json' \
  -d '{"status":"accepted"}' | jq .
```

### Phase 5: Publish

```bash
od_curl --max-time 30 -X PATCH "$DAEMON/api/design-systems/$DS" \
  -H 'Content-Type: application/json' \
  -d '{"status":"published"}' | jq -r '.designSystem.status'
```

Optional readback:

```bash
od_curl --max-time 30 "$DAEMON/api/design-systems/$DS" | jq -r '.designSystem.body // .body // empty'
```

### Phase 6: Copy Generated Workspace Package

Copy from the generated workspace project over HTTP. Do not rsync from a host OpenDesign data directory — Compose stores project files in the container volume.

```bash
REPO="$(git rev-parse --show-toplevel 2>/dev/null || pwd -P)"
rm -rf "${REPO}/rosey/design-system"
mkdir -p "${REPO}/rosey/design-system"

python3 "${REPO}/.agents/shared/lib/od_daemon.py" export-project \
  --repo-root "$REPO" \
  --project-id "$PROJECT_ID" \
  --dest "${REPO}/rosey/design-system" \
  --exclude context --exclude logs --exclude .git

test -f "${REPO}/rosey/design-system/DESIGN.md"
test -f "${REPO}/rosey/design-system/README.md"
test -f "${REPO}/rosey/design-system/SKILL.md"
test -d "${REPO}/rosey/design-system/ui_kits/app"

mkdir -p "${REPO}/rosey/designs"
jq -n \
  --arg designSystemId "$DS" \
  --arg workspaceProjectId "$PROJECT_ID" \
  --arg sourceDir "$SOURCE_DIR" \
  --arg packageDir "opendesign://projects/$PROJECT_ID" \
  --arg copiedPath "rosey/design-system" \
  --arg designPath "rosey/design-system/DESIGN.md" \
  --arg checksum "$(shasum -a 256 "${REPO}/rosey/design-system/DESIGN.md" | awk '{print $1}')" \
  --arg copiedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '{
    designSystemId: $designSystemId,
    workspaceProjectId: $workspaceProjectId,
    sourceDir: $sourceDir,
    packageDir: $packageDir,
    copiedPath: $copiedPath,
    designPath: $designPath,
    designChecksum: $checksum,
    copiedAt: $copiedAt
  }' > "${REPO}/rosey/designs/design-system.json"
```

## Handoff

After copying succeeds, report the seeded draft/workspace design system:

- Phase 0 `DESIGN.md` path and whether it was created or improved.
- OpenDesign design-system id.
- OpenDesign workspace project id.
- Whether revision feedback was applied.
- Copied package path: `rosey/design-system`.
- Async manifest path: `rosey/designs/design-system.json`.

`penpot-create-design-system` and `od-design-candidates` consume `rosey/design-system/DESIGN.md`.

Emit this machine-readable block before finishing:

```text
OD_DESIGN_SYSTEM_HANDOFF
SUCCESS: true|false
DESIGN_PATH: rosey/design-system/DESIGN.md
MANIFEST_PATH: rosey/designs/design-system.json
DESIGN_SYSTEM_ID: <id>
BLOCKERS: <none | reason>
END_OD_DESIGN_SYSTEM_HANDOFF
```
