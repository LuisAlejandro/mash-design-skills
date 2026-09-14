# Security

This stack is loopback-only. Do not expose Penpot on `:9001` to the network. Compose flags such as `disable-email-verification` and `disable-secure-session-cookies` are for local Docker, not a public host.

Do not publish the fat OpenDesign image `penpot-opendesign:local`. It contains vendor agent CLIs (cursor-agent, Claude, Codex, OpenCode, pi). Each clone builds it with `mmd setup`.

Do not commit `penpot.env`, `.env`, API keys, or `backups/*.sql`.

Report vulnerabilities privately via GitHub security advisories on [mmd-skills](https://github.com/LuisAlejandro/mmd-skills/security/advisories).
