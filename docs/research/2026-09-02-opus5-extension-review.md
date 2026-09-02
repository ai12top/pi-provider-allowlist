# pi-provider-allowlist 扩展审查报告

## 严重问题（Must Fix）

### 1. **缺少 LICENSE 文件但声明了 MIT 许可**
**证据：** `package.json:8` 声明 `"license": "MIT"`，`package.json:11` 在 `files` 中包含 `"LICENSE"`，但仓库中不存在该文件
**影响：** npm publish 会失败或警告；法律合规问题
**修复：** 创建标准 MIT LICENSE 文件

### 2. **使用未文档化的 API 行为覆盖供应商**
**证据：** `provider-allowlist.js:48-50` 用空模型列表覆盖供应商；`extensions.md` 只展示了注册新供应商的用法，未说明覆盖现有供应商的行为是否被支持
**风险：** pi 内部实现变更后可能失效；`registerProvider` 可能不保证"最后注册者胜出"的语义
**修复：**
- 联系 pi 维护者确认此用法是否官方支持
- 或在 README 明确标注为"实验性/依赖内部行为"
- 考虑使用事件拦截（如 `model_select` 或 `context`）作为备选方案

### 3. **fail-open 默认与安全预期不符**
**证据：** `provider-allowlist.js:33-42` 配置缺失时返回 `null`，工厂直接 return 不隐藏任何供应商
**问题：** 如果用户依赖此扩展进行隐私控制或成本管理，配置文件被意外删除/损坏会导致保护失效而无强提示
**修复：**
- 提供 fail-closed 模式（配置缺失时只允许显式白名单，或阻止所有）
- 或在 TUI 模式下强制用户确认而不仅仅警告
- 在 README 中明确说明 fail-open 行为及风险

### 4. **硬编码 `.pi` 路径，不适配重品牌分发**
**证据：** `provider-allowlist.js:16-18` 硬编码 `".pi/agent"`；`extensions.md` 示例代码使用 `CONFIG_DIR_NAME` 常量
**影响：** pi 的重品牌版本（如企业定制）可能使用不同配置目录名，扩展会失效
**修复：**
```javascript
import { CONFIG_DIR_NAME } from "@earendil-works/pi-coding-agent";
const CONFIG_PATH = join(homedir(), CONFIG_DIR_NAME, "agent/provider-allowlist.json");
```

---

## 中等问题（Should Fix）

### 5. **错误处理过于静默**
**证据：** `provider-allowlist.js:35-39` 配置解析失败静默返回 `null`；`provider-allowlist.js:53-59` 文件读取失败被 catch 但不记录
**问题：** 用户配置格式错误或路径权限问题时无法排查
**修复：** 至少在 catch 块中 `console.warn` 或 `console.error` 记录具体错误

### 6. **白名单内容未验证**
**证据：** `provider-allowlist.js:36` 只检查 `Array.isArray` 和 `map(String)`，不验证供应商名是否存在
**问题：** 拼写错误（如 `"antrhopic"`）会被忽略，用户以为配置了但实际无效
**修复：**
```javascript
const validProviders = enumerateProviders();
const invalid = parsed.filter(p => !validProviders.has(p));
if (invalid.length > 0) {
  console.warn(`[provider-allowlist] 白名单中包含未知供应商：${invalid.join(", ")}`);
}
```

### 7. **reload 行为未明确**
**证据：** README 和代码未说明 `/reload` 后的行为；`registerProvider` 的幂等性未知
**问题：** reload 可能导致重复注册或状态不一致
**修复：**
- 在 README 中说明"reload 后重新应用白名单"
- 测试 reload 场景
- 考虑在 `session_start` 中检查 `event.reason === "reload"` 并清理状态

### 8. **session_start 中未检查 hasUI**
**证据：** `provider-allowlist.js:76-90` 在 `session_start` 中调用 `ctx.modelRegistry.getAvailable()` 但未检查 `ctx.hasUI`
**问题：** 在 `--list-models` 等无会话命令中，`session_start` 不会触发，只有工厂阶段生效；在 JSON/print 模式下可能有副作用
**修复：** 工厂阶段已覆盖主要场景，session_start 兜底已足够；但可添加注释说明

### 9. **enumerateProviders 对 JSON 结构假设脆弱**
**证据：** `provider-allowlist.js:56-61` 先尝试 `data.providers` 再尝试 `Object.keys(data)`
**问题：** 如果 models-store.json 结构变化，可能提取出非供应商的 key（如 `"version"`, `"updated_at"` 等元数据字段）
**修复：** 参考 pi 源码确认 models-store.json 和 models.json 的确切结构；添加 key 类型验证

---

## 轻微问题（Nice to Fix）

### 10. **keywords 重复**
**证据：** `package.json:4` 中 `"allowlist"` 出现两次
**修复：** 删除一个

### 11. **缺少包元数据**
**证据：** `package.json` 没有 `repository`、`author`、`bugs`、`homepage` 字段
**影响：** npm 页面信息不完整，用户难以找到源码或报告问题
**修复：** 添加这些字段

### 12. **HIDDEN_PROVIDER.baseUrl 使用 127.0.0.1:1**
**证据：** `provider-allowlist.js:21`
**问题：** 端口 1 受保护，某些系统可能拒绝绑定；虽然不会实际连接，但语义不清
**修复：** 使用更明确的值如 `"http://provider-hidden.invalid"` 或空字符串（如果 API 允许）

### 13. **check.sh 依赖 python3**
**证据：** `check.sh:17` 使用 python3 解析 settings.json
**问题：** python3 可能不存在；解析逻辑脆弱（假设了 packages 数组格式）
**修复：** 使用 node 脚本或简化检查

### 14. **警告消息过长**
**证据：** `provider-allowlist.js:66-69` 和 `provider-allowlist.js:43-46` 的警告信息超过 100 字符
**影响：** 终端输出可读性差
**修复：** 缩短为一行核心信息，详细说明放 README

---

## 建议改进（Enhancement）

### 15. **添加配置验证命令**
用户无法确认扩展是否生效，建议添加：
```javascript
pi.registerCommand("provider-allowlist", {
  description: "Show allowlist configuration and hidden providers",
  handler: async (_args, ctx) => {
    const whitelist = loadWhitelist();
    const all = ctx.modelRegistry.getAvailable().map(m => m.provider);
    const hidden = [...new Set(all)].filter(p => !whitelist.includes(p));
    ctx.ui.notify(`Allowed: ${whitelist.join(", ")}\nHidden: ${hidden.join(", ")}`, "info");
  },
});
```

### 16. **添加交互式配置生成器**
首次使用时生成配置困难，建议：
```javascript
pi.registerCommand("provider-allowlist-setup", {
  handler: async (_args, ctx) => {
    const providers = [...new Set(ctx.modelRegistry.getAvailable().map(m => m.provider))];
    const selected = await ctx.ui.select("允许哪些供应商？", providers, { multiple: true });
    writeFileSync(CONFIG_PATH, JSON.stringify(selected, null, 2));
    ctx.ui.notify("配置已保存，请 /reload 生效", "info");
  },
});
```

### 17. **改进 README 文档**
- 添加"如何验证扩展是否生效"（运行 `pi --list-models` 查看）
- 添加"限制"章节（无会话命令依赖 models-store.json）
- 添加"故障排除"章节（常见问题：配置格式、路径权限等）
- 说明 fail-open 行为及其安全影响

### 18. **添加自动化测试**
当前没有任何测试，建议添加：
- 单元测试：loadWhitelist、enumerateProviders 函数
- 集成测试：加载扩展后检查 modelRegistry
- 边界测试：配置损坏、文件不存在、空数组等

### 19. **使用更健壮的配置格式**
当前只支持数组，可扩展为：
```json
{
  "mode": "allowlist",  // 或 "blocklist"
  "providers": ["anthropic", "newai"],
  "warnOnMissing": true
}
```

---

## 总体结论

**不建议立即发布到 npm 官方画廊**，需修复严重问题 1-4 后方可发布。

### 三条最重要的改进

1. **添加 LICENSE 文件并修复 CONFIG_DIR_NAME 硬编码** —— 这是发布的前置条件，否则会导致法律问题和重品牌版本不兼容

2. **明确 fail-open 行为并提供验证机制** —— 当前用户无法确认扩展是否生效，配置失效时也无强提示，容易造成误用；添加 `/provider-allowlist` 命令可提供即时反馈

3. **确认并文档化 API 使用的正确性** —— 空模型列表覆盖供应商不是官方文档行为，需要与 pi 维护者确认支持状态，或在 README 中明确标注为"依赖内部实现、可能在未来版本失效"并提供替代方案路线图

---

**代码质量评分：** 6/10（思路清晰，但缺少鲁棒性检查、边界处理和用户反馈机制）
