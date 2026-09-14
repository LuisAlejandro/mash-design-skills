# Contributing

Clone this toolkit and install once on the machine:

```bash
./install.sh
```

Do not commit `penpot.env` or `.env`. Funnel runs from an **app** window; `rosey/` stays in the app, not in this clone.

After you change a skill, re-run `./install.sh` so `~/.cursor/skills` matches the clone.

## Tests

Skill npm packages (each has `package.json` and `package-lock.json`):

```bash
npm test --prefix .cursor/skills/penpot-import-html
npm test --prefix .cursor/skills/penpot-implement-design
```

`penpot-create-design-system` has no test script yet.

OpenDesign daemon helpers:

```bash
python3 -m pytest .agents/shared/lib/tests
```
