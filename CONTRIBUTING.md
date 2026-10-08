# Contributing

Clone this toolkit and install once on the machine:

```bash
./install.sh
```

Do not commit `penpot.env` or `.env`. Funnel runs from an **app** window; `.mash/designs/` and `.mash/design-system/` stay in the app, not in this clone.

After you change a skill, re-run `./install.sh` so the global IDE homes match `src/skills`.

## Tests

Skill npm packages (each has `package.json` and `package-lock.json`):

```bash
npm test --prefix src/skills/penpot-import-html
npm test --prefix src/skills/penpot-implement-design
```

`penpot-create-design-system` has no test script yet.

OpenDesign daemon helpers:

```bash
python3 -m pytest tests src/skills/od-design-candidates/tests
```
