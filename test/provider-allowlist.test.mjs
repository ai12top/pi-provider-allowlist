// provider-allowlist 纯逻辑测试（src/core.js）
// 核心函数接收显式路径参数，用临时目录构造 fixture 验证边界行为。
// 运行：node --test（或 mise run check）

import { test, after } from "node:test";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadAllowlist,
  enumerateProviders,
  computeHidden,
} from "../src/core.js";

const DIR = mkdtempSync(join(tmpdir(), "ppal-test-"));
const cfg = join(DIR, "provider-allowlist.json");
const store = join(DIR, "models-store.json");
const models = join(DIR, "models.json");
mkdirSync(DIR, { recursive: true });
after(() => rmSync(DIR, { recursive: true, force: true }));

test("配置缺失 → fail-open (null)", () => {
  assert.strictEqual(loadAllowlist(join(DIR, "missing.json")), null);
});

test("配置损坏 → fail-open (null)", () => {
  writeFileSync(cfg, "{not-json");
  assert.strictEqual(loadAllowlist(cfg), null);
});

test("配置格式错误 → fail-open (null)", () => {
  writeFileSync(cfg, '{"a": 1}');
  assert.strictEqual(loadAllowlist(cfg), null);
});

test("合法配置 → 归一化为字符串数组", () => {
  writeFileSync(cfg, '["anthropic", 42, "newai"]');
  assert.deepStrictEqual(loadAllowlist(cfg), ["anthropic", "42", "newai"]);
});

test("models-store 缺失 → 空集合 + sawStore=false", () => {
  const { providers, sawStore } = enumerateProviders(join(DIR, "no-store.json"), models);
  assert.strictEqual(sawStore, false);
  assert.strictEqual(providers.size, 0);
});

test("枚举供应商：只认带 models 数组的键，忽略元数据字段", () => {
  writeFileSync(
    store,
    JSON.stringify({
      anthropic: { models: [{ id: "a" }] },
      openai: { models: [{ id: "b" }] },
      version: 2,
      updated_at: "2026-01-01",
      providers: { nested: { models: [] } },
    })
  );
  const { providers, sawStore } = enumerateProviders(store, models);
  assert.strictEqual(sawStore, true);
  assert.deepStrictEqual([...providers].sort(), ["anthropic", "openai"]);
});

test("models.json 的 providers 键同样被识别", () => {
  writeFileSync(
    models,
    JSON.stringify({ providers: { newai: { baseUrl: "http://x", models: [{ id: "m" }] } } })
  );
  const { providers } = enumerateProviders(store, models);
  assert.ok(providers.has("newai"));
});

test("computeHidden：白名单之外的供应商为隐藏清单", () => {
  const allowlist = ["newai", "deepseek"];
  const providers = new Set(["anthropic", "newai", "openai", "deepseek"]);
  assert.deepStrictEqual(computeHidden(allowlist, providers).sort(), ["anthropic", "openai"]);
});

test("computeHidden：全白名单 → 无隐藏", () => {
  const allowlist = ["anthropic", "newai", "openai"];
  const providers = new Set(["anthropic", "newai", "openai"]);
  assert.deepStrictEqual(computeHidden(allowlist, providers), []);
});
