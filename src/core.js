// 纯逻辑模块（零依赖，可直接单测）
// 单模式：{ mode: "allowlist"|"blocklist", providers: string[] }
// providers 为空或文件缺失 → 不过滤

import { readFileSync, existsSync, writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";

/** @returns {{mode:string, providers:string[]}|null} */
export function loadFilterConfig(configPath) {
  try {
    if (!existsSync(configPath)) return null;
    const parsed = JSON.parse(readFileSync(configPath, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      console.warn(`[provider-allowlist] 配置格式错误（应为 {mode, providers} 对象）：${configPath}`);
      return null;
    }
    const mode = parsed.mode === "blocklist" ? "blocklist" : parsed.mode === "allowlist" ? "allowlist" : null;
    if (!mode) {
      // 兼容旧双字段格式仅做提示，不自动迁移
      if (Array.isArray(parsed.allowlist) || Array.isArray(parsed.blocklist)) {
        console.warn(`[provider-allowlist] 检测到旧格式 {allowlist,blocklist}，请用 /providers-allowlist 重新配置：${configPath}`);
      } else {
        console.warn(`[provider-allowlist] 配置缺少 mode（allowlist|blocklist）：${configPath}`);
      }
      return null;
    }
    const providers = Array.isArray(parsed.providers) ? parsed.providers.map(String) : [];
    return { mode, providers };
  } catch (err) {
    console.warn(`[provider-allowlist] 配置读取失败：${err.message}`);
    return null;
  }
}

export function saveFilterConfig(configPath, { mode, providers = [] }) {
  if (!mode || (mode !== "allowlist" && mode !== "blocklist")) throw new Error(`invalid mode: ${mode}`);
  mkdirSync(dirname(configPath), { recursive: true });
  const data = { mode, providers: [...providers] };
  writeFileSync(configPath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

export function clearFilterConfig(configPath) {
  try { unlinkSync(configPath); } catch {}
}

export function isEmptyConfig({ providers = [] } = {}) {
  return providers.length === 0;
}

// 枚举 pi 已知供应商：内置目录缓存（storePath，顶层键即供应商名）+ 自定义 models.json（modelsPath，装在顶层 providers 键下）。
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
        "--list-models 等无会话命令可能无法过滤；交互式会话由注册表兜底覆盖。"
    );
  }
  return { providers, sawStore };
}

// 单模式隐藏计算
export function computeHidden(config, allProviders) {
  const { mode, providers = [] } = config || {};
  const list = new Set(providers);
  if (list.size === 0) return [];
  if (mode === "allowlist") return [...allProviders].filter((p) => !list.has(p));
  if (mode === "blocklist") return [...allProviders].filter((p) => list.has(p));
  return [];
}

export function computeVisible(config, allProviders) {
  const hidden = new Set(computeHidden(config, allProviders));
  return [...allProviders].filter((p) => !hidden.has(p));
}
