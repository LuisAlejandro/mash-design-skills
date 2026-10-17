# Contributing

Clone this toolkit and install once on the machine:

```bash
./install.sh
```

Do not commit `penpot.env` or `.env`. Funnel runs from an **app** window; `.mash/designs/` and `.mash/design-system/` stay in the app, not in this clone.

After you change a skill, re-run `./install.sh` so the global IDE homes match `src/skills`.

## Tests

Run all offline unit suites in disposable test containers, not in the `mds`
Penpot/OpenDesign runtime:

```bash
make test
```

Use `make test-python`, `make test-skills`, or `make test-headless` to run one
suite. `make test-image` builds the image without running tests.
`penpot-create-design-system` has no test script yet. Live Penpot integration
tests require a separately configured stack and are not part of `make test`.
