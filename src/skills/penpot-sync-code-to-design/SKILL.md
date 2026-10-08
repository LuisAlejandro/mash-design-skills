---
name: penpot-sync-code-to-design
description: Orchestrates syncing implemented UI code back into the open Penpot file. Use when the user says "sync design from code", "update Penpot from the app", "code to design", or wants Penpot to match recent code changes. Discovers per-shape state files, resolves scope, then invokes penpot-analyze-code-for-design and penpot-apply-design-updates. Reverse of penpot-implement-design.
---

# Sync Code to Penpot Design

Orchestrator for **code → design**. Reverse of `penpot-implement-design`.

Main input: completed per-shape state files at `.cursor/penpot-implement-state-<shapeId>.json`.

## Inputs

- State glob (default `.cursor/penpot-implement-state-*.json`)
- Scope: `shapeId` | file path | `"all"` (ask if omitted; default `"all"`)

## Prerequisites

At least one state file with `completedAt`. Penpot file connected for the apply step.

## Workflow

1. Glob `.cursor/penpot-implement-state-*.json`. Keep files that have `completedAt`. Parse `{ targetShapeId, targetShapeName, pageName, implementedFiles, shapeToFile }`.
2. Resolve scope:
   - `shapeId` → matching filename
   - `file` → state files whose `implementedFiles` or `shapeToFile` reference that path
   - `"all"` → every completed state file
3. For each entry, read `penpot-analyze-code-for-design` and run it with `filePath`, `shapeId`, and `shapeToFile`.
4. Collect deltas. Read `penpot-apply-design-updates` and apply (per shape or batched).
5. Set `lastSyncedFromCodeAt` (ISO) on each processed state file.

If no completed state files exist, stop: run `penpot-implement-design` first so mappings exist.

## Handoff

```text
CODE_TO_DESIGN_HANDOFF
SCOPE: shapeId|file|all
ENTRIES: <count>
APPLIED: <count>
FAILED: <count>
BLOCKERS: <none | reason>
END_CODE_TO_DESIGN_HANDOFF
```
