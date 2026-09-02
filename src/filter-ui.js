// 三页单模式向导：1/3 模式单选 → 2/3 成员多选 → 3/3 提交确认
// 返回 {mode, providers} | null

import { Key, matchesKey, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";

/**
 * @param {any} ctx
 * @param {Set<string>|string[]} providers
 * @param {{mode:string, providers:string[]}|null} initial
 */
export async function showFilterWizard(ctx, providers, initial) {
  const sorted = [...providers].sort((a, b) => a.localeCompare(b));
  if (sorted.length === 0) {
    ctx.ui.notify("未发现任何供应商，请先配置 models.json 或等待目录缓存", "warning");
    return null;
  }

  const selected = new Set((initial?.providers || []).filter((p) => sorted.includes(p)));

  const PAGE_COUNT = 3;

  return ctx.ui.custom((tui, theme, _kb, done) => {
    let page = 0; // 0:模式 1:成员 2:提交
    let cursors = [initial?.mode === "blocklist" ? 1 : 0, 0, 0];
    let cached;

    function refresh() { cached = undefined; tui.requestRender(); }

    function currentMode() { return cursors[0] === 1 ? "blocklist" : "allowlist"; }

    function handleInput(data) {
      if (matchesKey(data, Key.escape)) { done(null); return; }

      if (matchesKey(data, Key.tab) || matchesKey(data, "shift+tab") || matchesKey(data, Key.left) || matchesKey(data, Key.right)) {
        const isBack = matchesKey(data, "shift+tab") || matchesKey(data, Key.left);
        page = (page + (isBack ? -1 : 1) + PAGE_COUNT) % PAGE_COUNT;
        refresh(); return;
      }

      if (page === 0) {
        if (matchesKey(data, Key.up) || matchesKey(data, Key.down)) {
          cursors[0] = cursors[0] === 0 ? 1 : 0;
          refresh(); return;
        }
        if (matchesKey(data, Key.space) || matchesKey(data, Key.enter)) {
          // 空格/回车选模式并进下一页
          if (matchesKey(data, Key.space)) cursors[0] = cursors[0] === 0 ? 1 : 0;
          else page = 1;
          refresh(); return;
        }
        return;
      }

      if (page === 1) {
        const cursor = cursors[1];
        if (matchesKey(data, Key.up)) { cursors[1] = Math.max(0, cursor - 1); refresh(); return; }
        if (matchesKey(data, Key.down)) { cursors[1] = Math.min(sorted.length - 1, cursor + 1); refresh(); return; }
        if (matchesKey(data, Key.space)) {
          const p = sorted[cursor];
          if (selected.has(p)) selected.delete(p); else selected.add(p);
          refresh(); return;
        }
        if (matchesKey(data, Key.enter)) { page = 2; refresh(); return; }
        if (data === "a" || data === "A") {
          const all = sorted.every((p) => selected.has(p));
          if (all) selected.clear(); else sorted.forEach((p) => selected.add(p));
          refresh(); return;
        }
        return;
      }

      // page 2 提交页
      if (page === 2) {
        if (matchesKey(data, Key.up) || matchesKey(data, Key.down)) {
          cursors[2] = cursors[2] === 0 ? 1 : 0;
          refresh(); return;
        }
        if (matchesKey(data, Key.space) || matchesKey(data, Key.enter)) {
          if (cursors[2] === 0) {
            const m = currentMode();
            // 都不选视为空配置，由调用方决定不落盘
            done({ mode: m, providers: [...selected] });
          } else {
            page = 1; refresh();
          }
          return;
        }
        return;
      }
    }

    function render(width) {
      if (cached) return cached;
      const lines = [];
      const W = Math.max(1, width);
      const wrap = (t) => wrapTextWithAnsi(t, W);
      const add = (t) => lines.push(...wrap(t));
      const addWithPrefix = (prefix, text) => {
        const pw = visibleWidth(prefix);
        if (pw >= W) { add(prefix + text); return; }
        const wrapped = wrapTextWithAnsi(text, W - pw);
        const cont = " ".repeat(pw);
        for (let i = 0; i < wrapped.length; i++) lines.push(`${i === 0 ? prefix : cont}${wrapped[i]}`);
      };

      lines.push(theme.fg("accent", "─".repeat(W)));

      if (page === 0) {
        addWithPrefix(" ", theme.fg("accent", theme.bold("选择模式 (1/3)")));
        addWithPrefix(" ", theme.fg("dim", "↑↓ 选择  ·  回车下一页  ·  Tab/←→ 翻页  ·  Esc 取消"));
        lines.push("");
        const tabs = [
          page === 0 ? theme.fg("accent", "[● 模式]") : theme.fg("dim", "[ 模式 ]"),
          theme.fg("dim", "[ 成员 ]"),
          theme.fg("dim", "[ 提交 ]"),
        ].join("  ");
        addWithPrefix(" ", tabs);
        lines.push("");
        const opts = [
          { label: "白名单", desc: "仅保留勾选的供应商（推荐，新增供应商默认隐藏）" },
          { label: "黑名单", desc: "仅隐藏勾选的供应商（新增供应商默认可见）" },
        ];
        for (let i = 0; i < opts.length; i++) {
          const isCur = i === cursors[0];
          const prefix = isCur ? theme.fg("accent", "> ") : "  ";
          const box = isCur ? theme.fg("accent", "●") : theme.fg("dim", "○");
          const label = isCur ? theme.fg("accent", theme.bold(opts[i].label)) : theme.fg("text", opts[i].label);
          addWithPrefix(prefix, `${box} ${label}  ${theme.fg("dim", opts[i].desc)}`);
        }
        lines.push("");
        addWithPrefix(" ", theme.fg("dim", `当前预览: ${currentMode() === "allowlist" ? "白名单" : "黑名单"} · 已选 ${selected.size} 个`));
      } else if (page === 1) {
        const m = currentMode();
        const title = m === "allowlist" ? "白名单成员 (2/3) — 勾选要保留的" : "黑名单成员 (2/3) — 勾选要隐藏的";
        addWithPrefix(" ", theme.fg("accent", theme.bold(title)));
        addWithPrefix(" ", theme.fg("dim", "Tab/←→ 翻页  ·  空格勾选  ·  回车下一页  ·  a 全选/全不选  ·  Esc 取消"));
        lines.push("");
        const tabs = [
          theme.fg("dim", "[ 模式 ]"),
          theme.fg("accent", "[● 成员]"),
          theme.fg("dim", "[ 提交 ]"),
        ].join("  ");
        addWithPrefix(" ", `${tabs}   ${theme.fg("dim", `${m === "allowlist" ? "白" : "黑"}:${selected.size}`)}`);
        lines.push("");
        const cursor = cursors[1];
        for (let i = 0; i < sorted.length; i++) {
          const p = sorted[i];
          const sel = selected.has(p);
          const isCur = i === cursor;
          const prefix = isCur ? theme.fg("accent", "> ") : "  ";
          const box = sel ? theme.fg("accent", "[x]") : theme.fg("dim", "[ ]");
          const label = isCur ? theme.fg("accent", theme.bold(p)) : theme.fg("text", p);
          addWithPrefix(prefix, `${box} ${label}`);
        }
        lines.push("");
        const listStr = [...selected].join(", ") || "(空)";
        addWithPrefix(" ", theme.fg("dim", `${m === "allowlist" ? "白名单" : "黑名单"}: ${listStr}`));
        if (selected.size === 0) addWithPrefix(" ", theme.fg("dim", "都不选直接提交 = 保持默认（全部可见，不落盘）"));
      } else {
        const m = currentMode();
        addWithPrefix(" ", theme.fg("accent", theme.bold("确认提交 (3/3)")));
        addWithPrefix(" ", theme.fg("dim", "Tab/←→ 翻页  ·  ↑↓ 选择  ·  回车/空格确认  ·  Esc 取消"));
        lines.push("");
        const tabs = [theme.fg("dim", "[ 模式 ]"), theme.fg("dim", "[ 成员 ]"), theme.fg("accent", "[● 提交]")].join("  ");
        addWithPrefix(" ", tabs);
        lines.push("");
        const listStr = [...selected].join(", ") || "(空)";
        addWithPrefix(" ", theme.fg("text", `模式: ${m === "allowlist" ? "白名单" : "黑名单"}`));
        addWithPrefix(" ", theme.fg("text", `名单: ${listStr}`));
        lines.push("");
        const visible = sorted.filter((p) => {
          if (m === "allowlist") return selected.size === 0 ? true : selected.has(p);
          return !selected.has(p);
        });
        const hidden = sorted.filter((p) => !visible.includes(p));
        addWithPrefix(" ", theme.fg("dim", `可见 (${visible.length}): ${visible.join(", ") || "(无)"}`));
        addWithPrefix(" ", theme.fg("dim", `隐藏 (${hidden.length}): ${hidden.join(", ") || "(无)"}`));
        if (selected.size === 0) addWithPrefix(" ", theme.fg("warning", "都不选 = 保持默认，全部可见，不会创建配置文件"));
        if (visible.length === 0) addWithPrefix(" ", theme.fg("warning", "警告：将隐藏全部供应商"));
        lines.push("");
        const opts = ["确认提交", "返回修改"];
        for (let i = 0; i < opts.length; i++) {
          const isCur = i === cursors[2];
          const prefix = isCur ? theme.fg("accent", "> ") : "  ";
          const dot = isCur ? theme.fg("accent", "●") : theme.fg("dim", "○");
          const label = isCur ? theme.fg("accent", theme.bold(opts[i])) : theme.fg("text", opts[i]);
          addWithPrefix(prefix, `${dot} ${label}`);
        }
      }

      lines.push(theme.fg("accent", "─".repeat(W)));
      cached = lines;
      return lines;
    }

    return { render, handleInput, invalidate: () => { cached = undefined; } };
  });
}
