# Security

This stack is loopback-only: Penpot (`:9001`), Mailcatcher (`:1080`), the Penpot MCP server (`:4401`), and OpenDesign (`:7457`) all publish to `127.0.0.1` only. Do not expose any of these to the network. Compose flags such as `disable-email-verification` and `disable-secure-session-cookies` are for local Docker, not a public host.

The stack refuses to start when `PENPOT_SECRET_KEY` is missing, empty, or the known Compose fallback value — run `mmd setup` to generate one.

`open-design` runs on a separate Compose network from `penpot-postgres` and `penpot-valkey`; it has no direct path to Penpot's database or cache.

`penpot.env` and `.env` are created owner-only (`0600`); lifecycle commands never print provider keys, signing keys, passwords, or bearer tokens. `docker compose config` (without `-q`) is the one exception: it resolves and prints every interpolated secret in plaintext by Compose design — never paste its output into shared logs or issue reports.

`mmd destroy` and `mmd uninstall` name the exact stack, project, and every named volume at risk, then require typing the exact project name to confirm; a bypass variable for one command never authorizes the other. `mmd backup` covers PostgreSQL data only — it does not restore Penpot assets, OpenDesign data, or OpenDesign home state.

Do not publish the fat OpenDesign image `penpot-opendesign:local`. It contains vendor agent CLIs (cursor-agent, Claude, Codex, OpenCode, pi). Each clone builds it with `mmd setup`.

Do not commit `penpot.env`, `.env`, API keys, or `backups/*.sql`.

Report vulnerabilities privately via GitHub security advisories on [mmd-skills](https://github.com/LuisAlejandro/mmd-skills/security/advisories).
