// provider-allowlist 扩展
// 只允许白名单内的模型供应商出现在 pi 中，其余供应商（无论环境变量里有没有 key）一律隐藏。
//
// 配置：~/.pi/agent/provider-allowlist.json —— 字符串数组，例如：
//   ["newai", "deepseek", "opencode-go"]
// 修改后重启 pi 或 /reload 生效。文件缺失/损坏时不过滤任何供应商（fail-open）并警告。
//
// 原理：
//   1) 启动时从 pi 的模型目录缓存（models-store.json）与自定义 models.json 枚举全部供应商，
//      对不在白名单中的调用 pi.registerProvider() 覆盖为空模型实现（models: []），
//      使其从 /model 选择器和 --list-models 中消失。
//   2) session_start 时用注册表 ctx.modelRegistry.getAvailable() 兜底扫描，隐藏任何漏网供应商
//      （未来 pi 新增的、或用户新配置 key 的供应商）。
//   3) /provider-allowlist 命令可查看当前配置与隐藏清单。
//
// 已知边界（2026-09 实测）：
//   - registerProvider 覆盖内置供应商实测有效；pi 文档未明确承诺"覆盖"语义，
//     若未来版本改变此行为扩展可能失效（工厂阶段每次启动都会重新应用，可自动恢复）。
//   - pi.unregisterProvider() 实测对内置供应商无效（只对动态注册的供应商生效），故不用。
//   - 工厂阶段 pi 的模型注册表尚不可用（getModelRegistry 为 undefined），
//     --list-models 等无会话命令只能靠文件枚举；交互式会话由 session_start 兜底。
//
// 本扩展不触碰任何环境变量：工具 api key（EXA/BRAVE 等）与供应商凭证无关，原样保留。

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { CONFIG_DIR_NAME } from "@earendil-works/pi-coding-agent";

const AGENT_DIR = join(homedir(), CONFIG_DIR_NAME, "agent");
const CONFIG_PATH = join(AGENT_DIR, "provider-allowlist.json");
const STORE_PATH = join(AGENT_DIR, "models-store.json");
const MODELS_PATH = join(AGENT_DIR, "models.json");

// 隐藏后的空实现（models: [] → 目录为空 → 不出现在选择器；baseUrl 不会被真实调用）
const HIDDEN_PROVIDER = {
  baseUrl: "http://provider-hidden.invalid/v1",
  apiKey: "",
  api: "openai-completions",
  models: [],
};

// 读取白名单。缺失/损坏 → 返回 null（fail-open：不过滤任何供应商，并警告）。
export function loadAllowlist() {
  try {
    if (existsSync(CONFIG_PATH)) {
      const parsed = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
      if (Array.isArray(parsed)) return parsed.map(String);
      console.warn(`[provider-allowlist] 配置格式错误（应为字符串数组）：${CONFIG_PATH}`);
    }
  } catch (err) {
    console.warn(`[provider-allowlist] 配置读取失败：${err.message}`);
  }
  return null;
}

// 枚举 pi 已知供应商：内置目录缓存 + 自定义 models.json。
// 只认"值为 { models: [...] }"的键，避免未来元数据字段被误判为供应商。
export function enumerateProviders() {
  const providers = new Set();
  let sawStore = false;
  for (const path of [STORE_PATH, MODELS_PATH]) {
    try {
      if (!existsSync(path)) continue;
      const data = JSON.parse(readFileSync(path, "utf8"));
      if (!data || typeof data !== "object") continue;
      // models-store.json 顶层键即供应商名；models.json 则装在顶层 providers 键下
      const root = path === STORE_PATH ? data : data.providers ?? data;
      for (const [name, value] of Object.entries(root)) {
        if (value && Array.isArray(value.models)) providers.add(name);
      }
      if (path === STORE_PATH) sawStore = true;
    } catch (err) {
      console.warn(`[provider-allowlist] 读取 ${path} 失败：${err.message}`);
    }
  }
  if (!sawStore) {
    console.warn(
      `[provider-allowlist] 未找到模型目录缓存 ${STORE_PATH}，` +
        "--list-models 等无会话命令可能无法过滤；交互式会话由注册表兜底网覆盖。"
    );
  }
  return { providers, sawStore };
}

// 覆盖隐藏所有不在白名单中的供应商；返回隐藏清单。
export function hideNonAllowed(pi, allowlist, providers) {
  const hidden = [];
  for (const provider of providers) {
    if (!allowlist.includes(provider)) {
      pi.registerProvider(provider, HIDDEN_PROVIDER);
      hidden.push(provider);
    }
  }
  if (hidden.length > 0) {
    console.log(`[provider-allowlist] 已隐藏 ${hidden.length} 个供应商: ${hidden.join(", ")}`);
  }
  return hidden;
}

export default function (pi) {
  const allowlist = loadAllowlist();
  if (allowlist === null) {
    console.warn(
      `[provider-allowlist] 未找到配置文件 ${CONFIG_PATH}，本次不隐藏任何供应商。` +
        `创建该文件（JSON 数组，如 ["anthropic", "newai"]）后重启或 /reload 生效。`
    );
    return;
  }

  const { providers, sawStore } = enumerateProviders();

  // 白名单含未知供应商 → 多半是拼写错误（仅在目录缓存可见时提示，避免全新安装误报）
  if (sawStore) {
    const unknown = allowlist.filter((p) => !providers.has(p));
    if (unknown.length > 0) {
      console.warn(`[provider-allowlist] 白名单包含未知供应商：${unknown.join(", ")}`);
    }
  }

  hideNonAllowed(pi, allowlist, providers);

  // 兜底：session 启动时用注册表动态发现并隐藏漏网供应商（/reload 后同样重新应用）
  pi.on("session_start", (_event, ctx) => {
    try {
      const seen = new Set();
      for (const model of ctx.modelRegistry.getAvailable()) {
        if (!seen.has(model.provider)) {
          seen.add(model.provider);
          if (!allowlist.includes(model.provider)) {
            pi.registerProvider(model.provider, HIDDEN_PROVIDER);
          }
        }
      }
    } catch (err) {
      console.error(`[provider-allowlist] session_start 兜底失败：${err.message}`);
    }
  });

  // 验证命令：/provider-allowlist 显示当前配置与隐藏的供应商
  pi.registerCommand("provider-allowlist", {
    description: "Show allowlist config and hidden providers",
    handler: async (_args, ctx) => {
      const all = [...new Set(ctx.modelRegistry.getAvailable().map((m) => m.provider))];
      const hidden = all.filter((p) => !allowlist.includes(p));
      const msg = `Allowed: ${allowlist.join(", ") || "(none)"}\nHidden: ${hidden.join(", ") || "(none)"}`;
      if (ctx.hasUI) ctx.ui.notify(msg, "info");
      else console.log(`[provider-allowlist] ${msg}`);
    },
  });
}
