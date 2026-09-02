// provider-allowlist 纯函数测试
// 用临时 HOME 构造 fixture 配置，验证 loadAllowlist / enumerateProviders 的边界行为。
// 运行：node --test test/（或 mise run check）

import { test, after } from "node:test";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const HOME = mkdtempSync(join(tmpdir(), "ppal-test-"));
const AGENT = join(HOME, ".pi/agent");
mkdirSync(AGENT, { recursive: true });

// 把纯函数模块重新加载到临时 HOME 下，使其路径常量指向 fixture
process.env.HOME = HOME;
const ext = await import("../extensions/provider-allowlist.js");

test("配置缺失 → fail-open (null)", () => {
  assert.strictEqual(ext.loadAllowlist(), null);
});

test("配置损坏 → fail-open (null)", () => {
  writeFileSync(join(AGENT, "provider-allowlist.json"), "{not-json");
  assert.strictEqual(ext.loadAllowlist(), null);
});

test("配置格式错误 → fail-open (null)", () => {
  writeFileSync(join(AGENT, "provider-allowlist.json"), '{"a": 1}');
  assert.strictEqual(ext.loadAllowlist(), null);
});

test("合法配置 → 归一化为字符串数组", () => {
  writeFileSync(join(AGENT, "provider-allowlist.json"), '["anthropic", 42, "newai"]');
  assert.deepStrictEqual(ext.loadAllowlist(), ["anthropic", "42", "newai"]);
});

test("models-store 缺失 → 空集合 + sawStore=false", () => {
  const { providers, sawStore } = ext.enumerateProviders();
  assert.strictEqual(sawStore, false);
  assert.strictEqual(providers.size, 0);
});

test("枚举供应商：只认带 models 数组的键，忽略元数据字段", () => {
  writeFileSync(
    join(AGENT, "models-store.json"),
    JSON.stringify({
      anthropic: { models: [{ id: "a" }] },
      openai: { models: [{ id: "b" }] },
      version: 2,
      updated_at: "2026-01-01",
      providers: { nested: { models: [] } },
    })
  );
  const { providers, sawStore } = ext.enumerateProviders();
  assert.strictEqual(sawStore, true);
  assert.deepStrictEqual([...providers].sort(), ["anthropic", "openai"]);
});

test("models.json 的 providers 键同样被识别", () => {
  writeFileSync(
    join(AGENT, "models.json"),
    JSON.stringify({ providers: { newai: { baseUrl: "http://x", models: [{ id: "m" }] } } })
  );
  const { providers } = ext.enumerateProviders();
  assert.ok(providers.has("newai"));
});

after(() => rmSync(HOME, { recursive: true, force: true }));
