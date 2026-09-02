# pi-provider-allowlist

打包并发布 pi 扩展 `provider-allowlist`：通过白名单配置限制 pi 可用的模型供应商，其余供应商（无论环境变量里有没有 key）一律隐藏。用户通过 npm 安装（官方画廊 https://pi.dev/packages 收录），白名单在 `~/.pi/agent/provider-allowlist.json` 配置。

开发任务先读取 `RULES/CODE.md` 与 `RULES/WORKFLOW.md`；本文件只记录项目独有事实，不 fork 共享规则。

## 技术栈

- 语言：JavaScript（ESM，零第三方依赖，只用 node 内置模块）
- 关键依赖：pi >= 0.84（扩展 API：`pi.registerProvider` / `pi.on("session_start")`）

## 启动

```bash
mise run check   # 校验 package.json、扩展语法、npm pack 试打包
```

## 部署

- 源码发布到 npm（`pi-package` 关键词 → 自动进官方画廊）
- 本地安装测试：`pi install ./pi-provider-allowlist`（或用 `pi -e` 临时试用）
- 用户配置：`~/.pi/agent/provider-allowlist.json`（JSON 数组，缺失 = 全部放行并警告）
- 注意：`~/.pi/agent/extensions/provider-allowlist.js` 是此项目的产物副本，改源码后需同步；发布后应以 `pi install npm:pi-provider-allowlist` 替代直接注册

## 文档

- `docs/README.md`：Truth Map
