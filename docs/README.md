# pi-provider-allowlist 文档入口

## 当前有效文档

- `../README.md`：面向安装者/画廊读者的使用说明（包内自带，随 npm 分发）
- `research/2026-09-02-opus5-extension-review.md`：claude-opus-5 独立审核报告（含采纳/驳回裁决，见会话记录）

## 项目定位

把 pi 扩展 `provider-allowlist` 打包为可分发、可上架官方画廊（pi.dev/packages）的 pi 包：

- 限制 pi 可用的模型供应商为白名单内的少数几个
- 工具 api key（EXA/BRAVE/CONTEXT7 等）不受影响
- 白名单在用户配置文件 `~/.pi/agent/provider-allowlist.json` 中维护

## 边界

- 不包含任何供应商/中转站配置（models.json、auth.json 属用户私有，另行维护）
- 不打包用户个人协作规范（AGENTS.md 全局文件）
