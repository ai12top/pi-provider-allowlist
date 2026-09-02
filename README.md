# pi-provider-allowlist

Restrict [pi](https://pi.dev) to a single allowlist or blocklist of model providers. Providers outside the policy are hidden from `/model` and `--list-models` — regardless of which API keys are set in your environment. Tool API keys (search, MCP, misc scripts) are never touched.

## Install

```bash
pi install npm:pi-provider-allowlist
```

Uninstall: `pi remove npm:pi-provider-allowlist`. Trial without install: `pi -e npm:pi-provider-allowlist`.

## Configure

**Interactive (recommended):** run `/providers-allowlist` in pi.

3-page wizard: `1/3 Mode` (allowlist = only keep selected, blocklist = only hide selected) → `2/3 Members` (Space toggle, `a` select all, Tab/←→ switch pages) → `3/3 Submit` (preview visible/hidden, confirm). Empty selection = keep default (all visible, no file created).

**Manual:** create `~/.pi/agent/provider-allowlist.json`:

```json
{ "mode": "allowlist", "providers": ["anthropic", "newai"] }
```
or
```json
{ "mode": "blocklist", "providers": ["openai"] }
```

Restart pi or run `/reload` to apply. New pi providers that appear later are filtered automatically on next session.

> **Fail-open by default:** if the config file is missing or broken, **no provider is filtered** and a warning is printed. This prevents a broken config from locking you out of pi.

## Verify

```bash
pi --list-models | awk '{print $1}' | sort -u   # only visible providers
```

In an interactive session, `/providers-allowlist show` prints current config.

## How it works

At pi's **provider registry level**, not env vars:

1. At startup enumerates known providers from `~/.pi/agent/models-store.json` + `models.json`, and overrides hidden providers with empty model list (`pi.registerProvider(name, { models: [] })`).
2. On `session_start` re-scans via `ctx.modelRegistry.getAvailable()` and re-applies (also after `/reload`).
3. First startup with no config pops the 3-page wizard (TUI only, `Esc` to cancel).
4. Env vars (`EXA_API_KEY`, `BRAVE_API_KEY`, etc.) are never modified.

## Limitations

- `--list-models` without a session relies on `models-store.json` cache; on fresh installs filtering may be incomplete until the store exists.
- Hiding uses `pi.registerProvider()` override (verified but not documented as "hide"); re-applied each startup.
- `pi.unregisterProvider()` only affects dynamically-registered providers; restoring built-in providers requires `/reload` (noted in UI).

## Development

```bash
mise run check   # tsc + tests + npm pack dry-run
```

```
├── src/
│   ├── index.ts     # Extension entry (pi.extensions)
│   ├── filter-ui.js # 3-page wizard (pi-tui custom)
│   ├── core.js      # Pure logic (zero deps, unit-tested)
│   └── core.d.ts
└── test/            # node --test
```

MIT licensed.
