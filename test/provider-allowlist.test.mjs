// 单模式 {mode, providers} 测试
import { test, after } from "node:test";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadFilterConfig,
  saveFilterConfig,
  clearFilterConfig,
  isEmptyConfig,
  enumerateProviders,
  computeHidden,
  computeVisible,
} from "../src/core.js";

const DIR = mkdtempSync(join(tmpdir(), "ppal-test-"));
const cfg = join(DIR, "provider-allowlist.json");
const store = join(DIR, "models-store.json");
const models = join(DIR, "models.json");
mkdirSync(DIR, { recursive: true });
after(() => rmSync(DIR, { recursive: true, force: true }));

test("缺失 → null", () => {
  assert.strictEqual(loadFilterConfig(join(DIR, "missing.json")), null);
});

test("损坏 → null", () => {
  writeFileSync(cfg, "{not-json");
  assert.strictEqual(loadFilterConfig(cfg), null);
});

test("旧双字段格式 → null", () => {
  writeFileSync(cfg, JSON.stringify({ allowlist: ["a"], blocklist: ["b"] }));
  assert.strictEqual(loadFilterConfig(cfg), null);
});

test("旧数组格式 → null", () => {
  writeFileSync(cfg, '["a"]');
  assert.strictEqual(loadFilterConfig(cfg), null);
});

test("合法白名单", () => {
  writeFileSync(cfg, JSON.stringify({ mode: "allowlist", providers: ["anthropic", 42] }));
  assert.deepStrictEqual(loadFilterConfig(cfg), { mode: "allowlist", providers: ["anthropic", "42"] });
});

test("合法黑名单", () => {
  writeFileSync(cfg, JSON.stringify({ mode: "blocklist", providers: ["openai"] }));
  assert.deepStrictEqual(loadFilterConfig(cfg), { mode: "blocklist", providers: ["openai"] });
});

test("空 providers → 空数组", () => {
  writeFileSync(cfg, JSON.stringify({ mode: "allowlist", providers: [] }));
  assert.deepStrictEqual(loadFilterConfig(cfg), { mode: "allowlist", providers: [] });
});

test("save/clear 往返", () => {
  const p = join(DIR, "sub", "filter.json");
  saveFilterConfig(p, { mode: "allowlist", providers: ["a", "b"] });
  assert.deepStrictEqual(loadFilterConfig(p), { mode: "allowlist", providers: ["a", "b"] });
  clearFilterConfig(p);
  assert.strictEqual(existsSync(p), false);
  assert.strictEqual(loadFilterConfig(p), null);
});

test("isEmptyConfig", () => {
  assert.strictEqual(isEmptyConfig({ mode: "allowlist", providers: [] }), true);
  assert.strictEqual(isEmptyConfig({ mode: "blocklist", providers: ["a"] }), false);
});

test("枚举供应商", () => {
  writeFileSync(store, JSON.stringify({ anthropic: { models: [{ id: "a" }] }, openai: { models: [{ id: "b" }] }, version: 2 }));
  const { providers, sawStore } = enumerateProviders(store, models);
  assert.strictEqual(sawStore, true);
  assert.deepStrictEqual([...providers].sort(), ["anthropic", "openai"]);
});

test("computeHidden 白名单", () => {
  const c = { mode: "allowlist", providers: ["newai"] };
  const all = new Set(["anthropic", "newai", "openai"]);
  assert.deepStrictEqual(computeHidden(c, all).sort(), ["anthropic", "openai"]);
  assert.deepStrictEqual(computeVisible(c, all), ["newai"]);
});

test("computeHidden 黑名单", () => {
  const c = { mode: "blocklist", providers: ["openai"] };
  const all = new Set(["anthropic", "newai", "openai"]);
  assert.deepStrictEqual(computeHidden(c, all), ["openai"]);
  assert.deepStrictEqual(computeVisible(c, all).sort(), ["anthropic", "newai"]);
});

test("空名单 → 不隐藏", () => {
  const c = { mode: "allowlist", providers: [] };
  const all = new Set(["a", "b"]);
  assert.deepStrictEqual(computeHidden(c, all), []);
  assert.deepStrictEqual(computeVisible(c, all).sort(), ["a", "b"]);
  assert.deepStrictEqual(computeHidden(null, all), []);
});

test("null 配置 → 不隐藏", () => {
  const all = new Set(["a", "b"]);
  assert.deepStrictEqual(computeHidden(null, all), []);
});
