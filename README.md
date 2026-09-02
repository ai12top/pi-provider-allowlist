# pi-provider-allowlist

Restrict [pi](https://pi.dev) to an allowlist of model providers. Providers outside the allowlist are hidden from `/model` and `--list-models` — regardless of which API keys are set in your environment. Tool API keys (search, MCP, misc scripts) are never touched.

## Install

**主安装方式（推荐，面向已有 pi 的用户）—— 单独安装扩展：**

```bash
pi install npm:pi-provider-allowlist
```

只安装扩展本身，**不会捆绑安装 pi-coding-agent**（pi 运行时内置提供该依赖，扩展直接使用）。卸载：`pi remove npm:pi-provider-allowlist`。

> 想先试用不安装：`pi -e npm:pi-provider-allowlist`

## Configure

Create `~/.pi/agent/provider-allowlist.json` — a JSON array of provider names:

```json
["anthropic", "newai", "opencode-go"]
```

Restart pi or run `/reload`. Missing or invalid entries in the whitelist produce a warning; a provider name you never use costs nothing.

> **Fail-open by default:** if the config file is missing or broken, **no provider is filtered** and a warning is printed. This prevents a broken config from locking you out of pi entirely. If you rely on this extension for strict enforcement, make sure the file exists before starting pi — or add a check in your shell startup.

## Verify it works

```bash
pi --list-models | awk '{print $1}' | sort -u   # only allowed providers
```

In an interactive session, `/provider-allowlist` prints the current config and the hidden providers.

## How it works

The extension works at pi's **provider registry level**, not the environment level:

1. At startup it enumerates known providers from pi's model catalog cache (`~/.pi/agent/models-store.json`) plus custom `models.json`, and overrides every non-allowlisted provider with an empty model list (`pi.registerProvider(name, { models: [] })`), hiding it from `/model` and `--list-models`.
2. On `session_start` it re-scans via `ctx.modelRegistry.getAvailable()` and hides anything new (future pi providers, newly-authed providers). This also re-applies after `/reload`.
3. Environment variables are never modified: `EXA_API_KEY`, `BRAVE_API_KEY`, `GITHUB_TOKEN` and everything else pass through untouched for your shell tools.

Keys can come from anywhere (env vars, `auth.json`, `/login`) — the filter only cares about provider *names*.

## Why

If your shell exports `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / etc. that point at a relay or are meant for other tools, pi will offer those providers and fail (or cost money) on real requests. This extension keeps the picker clean and prevents accidental use of providers you didn't intend.

## Limitations

- **No-session commands** (`--list-models`) rely on reading `models-store.json`; on a fresh install before the catalog is cached, filtering may be incomplete until the store exists. Interactive sessions are always covered by the session-start scan.
- Provider hiding uses `pi.registerProvider()` override, which is verified to work but is not an explicitly documented "hide provider" API; if a future pi version changes this behavior the extension re-applies on every startup.
- `pi.unregisterProvider()` only removes dynamically-registered providers and has no effect on built-in ones, so it is not used.

## Development

```bash
mise run check   # JSON validation, syntax check, unit tests, npm pack dry-run
npm pack         # produce the tarball
```

开发/测试环境用 `npm install` 安装 `devDependencies`（含 `@earendil-works/pi-coding-agent`，仅供本地测试解析导入）；生产安装（pi install）会跳过 devDependencies，保持扩展独立。

MIT licensed.
