// provider-allowlist 扩展 — 单模式黑白名单
// 配置：~/.pi/agent/provider-allowlist.json -> { mode: "allowlist"|"blocklist", providers: string[] }
// 都不选 = 不落盘，保持默认全部可见

import { join } from "node:path";
import { homedir } from "node:os";
import { CONFIG_DIR_NAME, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  loadFilterConfig,
  saveFilterConfig,
  clearFilterConfig,
  isEmptyConfig,
  enumerateProviders,
  computeHidden,
  computeVisible,
} from "./core.js";
// @ts-ignore filter-ui 为 JS 模块
import { showFilterWizard } from "./filter-ui.js";

const AGENT_DIR = join(homedir(), CONFIG_DIR_NAME, "agent");
const CONFIG_PATH = join(AGENT_DIR, "provider-allowlist.json");
const STORE_PATH = join(AGENT_DIR, "models-store.json");
const MODELS_PATH = join(AGENT_DIR, "models.json");

const HIDDEN_PROVIDER = {
  baseUrl: "http://provider-hidden.invalid/v1",
  apiKey: "",
  api: "openai-completions",
  models: [] as never[],
};

let currentConfig: { mode: "allowlist" | "blocklist"; providers: string[] } | null = null;

function allKnownProviders(): Set<string> {
  const { providers } = enumerateProviders(STORE_PATH, MODELS_PATH);
  return providers;
}

function applyFilter(
  config: { mode: string; providers: string[] } | null,
  pi: ExtensionAPI,
  registryProviders?: Set<string>
) {
  const providers = registryProviders ?? allKnownProviders();
  if (!config || isEmptyConfig(config as any)) {
    for (const p of providers) try { pi.unregisterProvider(p); } catch {}
    return { hidden: [] as string[], visible: [...providers] };
  }
  const hidden = computeHidden(config as any, providers);
  const visible = computeVisible(config as any, providers);
  for (const p of hidden) pi.registerProvider(p, HIDDEN_PROVIDER);
  for (const p of visible) try { pi.unregisterProvider(p); } catch {}
  return { hidden, visible };
}

function describeConfig(c: { mode: string; providers: string[] } | null): string {
  if (!c || isEmptyConfig(c as any)) return "未过滤（全部可见）";
  const tag = c.mode === "allowlist" ? "白名单" : "黑名单";
  return `${tag}: ${c.providers.join(", ")}`;
}

export default function (pi: ExtensionAPI) {
  currentConfig = loadFilterConfig(CONFIG_PATH) as any;

  if (currentConfig) {
    const { hidden } = applyFilter(currentConfig, pi);
    if (hidden.length > 0) console.log(`[provider-allowlist] 已隐藏 ${hidden.length} 个: ${hidden.join(", ")} (${describeConfig(currentConfig)})`);
    else console.log(`[provider-allowlist] 已加载：${describeConfig(currentConfig)}`);
  } else {
    console.warn(`[provider-allowlist] 未找到配置 ${CONFIG_PATH}，首次打开将弹出设置向导`);
  }

  pi.on("session_start", async (event, ctx) => {
    try {
      if (currentConfig) {
        const seen = new Set<string>();
        for (const m of ctx.modelRegistry.getAvailable()) seen.add(m.provider);
        applyFilter(currentConfig, pi, seen);
      }

      if (event.reason === "startup" && currentConfig === null && ctx.hasUI && ctx.mode === "tui") {
        await new Promise((r) => setTimeout(r, 300));
        const providers = new Set<string>();
        for (const p of allKnownProviders()) providers.add(p);
        for (const m of ctx.modelRegistry.getAvailable()) providers.add(m.provider);
        if (providers.size === 0) {
          ctx.ui.notify("未发现任何供应商", "warning");
          return;
        }
        ctx.ui.notify("未检测到过滤配置，打开设置向导…", "info");
        const result = await showFilterWizard(ctx, providers, null);
        if (result) {
          if (isEmptyConfig(result as any)) {
            clearFilterConfig(CONFIG_PATH);
            currentConfig = null;
            const reg = new Set<string>();
            for (const m of ctx.modelRegistry.getAvailable()) reg.add(m.provider);
            applyFilter(null, pi, reg);
            ctx.ui.notify("保持默认：未配置过滤，全部供应商可见", "info");
          } else {
            saveFilterConfig(CONFIG_PATH, result as any);
            currentConfig = result as any;
            const reg = new Set<string>();
            for (const m of ctx.modelRegistry.getAvailable()) reg.add(m.provider);
            const { hidden, visible } = applyFilter(currentConfig, pi, reg);
            ctx.ui.notify(
              `已保存：${describeConfig(currentConfig)}\n可见: ${visible.join(", ") || "(无)"}\n隐藏: ${hidden.join(", ") || "(无)"}\n提示：内置供应商的“取消隐藏”需 /reload 完全生效`,
              "info"
            );
          }
        } else {
          ctx.ui.notify("已取消，可随时用 /providers-allowlist 重设", "info");
        }
      }
    } catch (err) {
      console.error(`[provider-allowlist] session_start 失败：${err instanceof Error ? err.message : String(err)}`);
    }
  });

  async function openWizard(ctx: any) {
    const providers = new Set<string>();
    for (const p of allKnownProviders()) providers.add(p);
    try { for (const m of ctx.modelRegistry.getAvailable()) providers.add(m.provider); } catch {}
    if (providers.size === 0) {
      const msg = "未发现任何供应商";
      if (ctx.hasUI) ctx.ui.notify(msg, "warning"); else console.log(`[provider-allowlist] ${msg}`);
      return;
    }
    const result = await showFilterWizard(ctx, providers, currentConfig as any);
    if (!result) {
      if (ctx.hasUI) ctx.ui.notify("已取消", "info");
      return;
    }
    if (isEmptyConfig(result as any)) {
      clearFilterConfig(CONFIG_PATH);
      currentConfig = null;
      const reg = new Set<string>();
      try { for (const m of ctx.modelRegistry.getAvailable()) reg.add(m.provider); } catch {}
      const target = reg.size > 0 ? reg : providers;
      applyFilter(null, pi, target);
      const msg = `已清除配置，保持默认：全部供应商可见\n文件已删除: ${CONFIG_PATH}`;
      if (ctx.hasUI) ctx.ui.notify(msg, "info"); else console.log(`[provider-allowlist] ${msg}`);
      return;
    }
    saveFilterConfig(CONFIG_PATH, result as any);
    currentConfig = result as any;
    const reg = new Set<string>();
    try { for (const m of ctx.modelRegistry.getAvailable()) reg.add(m.provider); } catch {}
    const target = reg.size > 0 ? reg : providers;
    const { hidden, visible } = applyFilter(currentConfig, pi, target);
    const msg =
      `已保存：${describeConfig(currentConfig)}\n` +
      `可见: ${visible.join(", ") || "(无)"}\n` +
      `隐藏: ${hidden.join(", ") || "(无)"}\n` +
      `提示：内置供应商的“取消隐藏”需 /reload 完全生效`;
    if (ctx.hasUI) ctx.ui.notify(msg, "info"); else console.log(`[provider-allowlist] ${msg}`);
  }

  const handler = async (args: string, ctx: any) => {
    const arg = (args || "").trim().toLowerCase();
    if (arg === "show" || arg === "--show" || arg === "status") {
      const providers = new Set<string>();
      try { for (const m of ctx.modelRegistry.getAvailable()) providers.add(m.provider); } catch {}
      const hidden = currentConfig ? computeHidden(currentConfig as any, providers) : [];
      const visible = currentConfig ? computeVisible(currentConfig as any, providers) : [...providers];
      const msg =
        `配置: ${describeConfig(currentConfig)}\n` +
        `可见: ${visible.join(", ") || "(无)"}\n` +
        `隐藏: ${hidden.join(", ") || "(无)"}\n` +
        `文件: ${CONFIG_PATH}`;
      if (ctx.hasUI) ctx.ui.notify(msg, "info"); else console.log(`[provider-allowlist] ${msg}`);
      return;
    }
    if (!ctx.hasUI || ctx.mode !== "tui") {
      const msg = `当前配置: ${describeConfig(currentConfig)}\n请在交互式会话中使用 /providers-allowlist 设置，或直接编辑 ${CONFIG_PATH}`;
      console.log(`[provider-allowlist] ${msg}`);
      if (ctx.hasUI) ctx.ui.notify(msg, "info");
      return;
    }
    await openWizard(ctx);
  };

  pi.registerCommand("providers-allowlist", {
    description: "设置供应商黑白名单（单模式，Tab/←→翻页）",
    handler,
  });
}
