// 纯逻辑模块（零依赖，可直接单测）
// 与 pi API 无关：所有路径由调用方传入，便于测试注入 fixture。

import { readFileSync, existsSync } from "node:fs";

// 读取白名单。缺失/损坏 → 返回 null（fail-open：不过滤任何供应商，并警告）。
export function loadAllowlist(configPath) {
  try {
    if (existsSync(configPath)) {
      const parsed = JSON.parse(readFileSync(configPath, "utf8"));
      if (Array.isArray(parsed)) return parsed.map(String);
      console.warn(`[provider-allowlist] 配置格式错误（应为字符串数组）：${configPath}`);
    }
  } catch (err) {
    console.warn(`[provider-allowlist] 配置读取失败：${err.message}`);
  }
  return null;
}

// 枚举 pi 已知供应商：内置目录缓存（storePath，顶层键即供应商名）+ 自定义 models.json（modelsPath，装在顶层 providers 键下）。
// 只认"值为 { models: [...] }"的键，避免未来元数据字段被误判为供应商。
export function enumerateProviders(storePath, modelsPath) {
  const providers = new Set();
  let sawStore = false;
  for (const [path, useProvidersKey] of [
    [storePath, false],
    [modelsPath, true],
  ]) {
    try {
      if (!existsSync(path)) continue;
      const data = JSON.parse(readFileSync(path, "utf8"));
      if (!data || typeof data !== "object") continue;
      const root = useProvidersKey ? data.providers ?? data : data;
      for (const [name, value] of Object.entries(root)) {
        if (value && Array.isArray(value.models)) providers.add(name);
      }
      if (path === storePath) sawStore = true;
    } catch (err) {
      console.warn(`[provider-allowlist] 读取 ${path} 失败：${err.message}`);
    }
  }
  if (!sawStore) {
    console.warn(
      `[provider-allowlist] 未找到模型目录缓存 ${storePath}，` +
        "--list-models 等无会话命令可能无法过滤；交互式会话由注册表兜底网覆盖。"
    );
  }
  return { providers, sawStore };
}

// 计算隐藏清单：白名单之外的供应商。register 由调用方执行（pi API 在 core 之外）。
export function computeHidden(allowlist, providers) {
  return [...providers].filter((p) => !allowlist.includes(p));
}
