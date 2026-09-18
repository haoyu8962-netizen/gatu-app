<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-17-mobile-chart-retention",
  "date": "2026-09-17",
  "title": "移动端 Markets 页切换后保留 TradingView 图表",
  "kind": "task",
  "status": "recorded",
  "topics": [
    "docs-governance"
  ],
  "summary": "实测确认 Markets→Trade→Markets 每次重建 TradingView iframe，根因是 ade94020 引入的 Activity hidden 卸载效果；改为首次展示后常驻 visible，单测红绿与无头探针均确认同一 iframe 贯穿切换，与官方终端做法一致。",
  "thread": null,
  "baseCommit": "0ad17aea771213eae608d5d0dff78de0e249b94b",
  "commits": [],
  "sources": [
    { "path": "docs/runtime-guardrails.md" },
    { "path": "apps/terminal/src/components/trade/mobile/mobile-terminal.tsx" },
    { "path": "apps/terminal/src/hooks/ui/use-has-been-active.ts" },
    { "path": "apps/terminal/src/lib/tests/mobile-terminal-markets-retention.test.tsx" }
  ],
  "supersedes": []
}
-->
# 移动端 Markets 页切换后保留 TradingView 图表

## 背景与范围

用户报告移动端 Markets → Trade → Markets 时 TradingView 会重建，记忆中此前是不销毁的，要求对照 `https://app.hyperliquid.xyz/trade/ETH` 的实践并调试。分支 `claude/surface-tokens-touch-feedback`，worktree `.claude/worktrees/main-dev`，开发服务器 `127.0.0.1:3016`。

## 结论与依据

结论：本地行为不符合官方实践，也违反本仓库 guardrails §4/§5；已修复。

### 证据

无头 Chromium（390×844、iPhone UA、经本地代理 6152）在页面注入 MutationObserver，给每个 iframe 打标签并记录增删，再按序点击标签：

| 站点 | 序列 | 结果 |
|---|---|---|
| 官方 `trade/ETH` | Chart → Order Book → Chart → Trades → Chart → Order Book → Chart | 始终同一 `tradingview_365d5` iframe，新增 0、移除 0；非 Chart 标签时 iframe 收缩为 0×0 但不卸载 |
| 本地修复前 | Trade → Markets → Trade → Markets → Account → Markets | 每次回到 Markets 都新建 iframe（`89a49` → `507d7` → `28cb2`），离开时移除；共新增 3、移除 2 |
| 本地修复后 | Markets → Trade → Markets → Account → Markets → Trade | 同一 `tradingview_1706d` 贯穿全程，新增 1、移除 0 |

官方移动端没有 Markets/Trade 底部标签，其可比操作是 Chart/Order Book/Trades 顶部标签切换；两者都是“图表离开视口再回来”。

### 根因

`ade94020`（2026-09-16 热访问优化）把 Markets 外层改为 `<Activity mode={activeTab === "markets" ? "visible" : "hidden"}>`。React `Activity` 的 `hidden` 会卸载子树全部 effect，`tradingview-chart.tsx` 的初始化 effect 清理里 `widget.remove()` + `datafeed.destroy()`，因此每次离开 Markets 图表即销毁；Trade 标签本身不含图表，所以图表只存在于 Markets。这违反 `docs/runtime-guardrails.md` §4「移动端标签切换不得销毁图表」与 §5「图表壳不应随标签切换抖动」。

`ade94020` 之前 Markets 用 `visible/invisible` 类常驻，图表由 `MobileChartView` 的 `hasBeenActive` 延迟首建、`active` 守卫效果，符合用户记忆。

### 修复

- 新增 `use-has-been-active.ts`（渲染期 setState 的一次性锁存）。
- `mobile-terminal.tsx`：Markets 的 `Activity` 模式改为 `marketsRetained ? "visible" : "hidden"`，即落地在 Trade 时仍延迟渲染 Markets（保留 ade94020 的启动收益），首次展示后永久 `visible`，隐藏仍走原 wrapper 的 `invisible z-0 pointer-events-none`。
- Account 的 `Activity` 不变（其 key 随身份变化，释放语义是有意的）。
- `docs/runtime-guardrails.md` §5 新增规则说明，`CHANGELOG.md` Fixed 条目。

## 验证与限制

- 新测试 `mobile-terminal-markets-retention.test.tsx`：落地 Trade 时 Markets 效果不挂载；展示一次后跨 Trade/Account 切换效果挂载 1 次、清理 0 次。对旧接线临时回退复跑：第二个用例失败（`expected 3 to be 1`），确认为真红测。
- `vitest run` 三个 mobile-terminal 测试文件 6 pass；`biome check` 三文件通过（修一次 import 排序）；`tsc --noEmit` 通过。
- 修复后 Trade 标签截图正常，无 Markets 面板泄漏。

### 限制

未做真机验收、未量化保留 Markets 常驻对 Trade 标签的 CPU 影响（回到 ade94020 之前的行为，`active` 守卫仍在）。探针在 Trade 标签结束时读到 iframe 计算样式为 `visible`，未深究（wrapper 为 `invisible`，截图无泄漏）。

## 后续与替代关系

- 不替代任何记录；补充 `2026-09-16-warm-visit-startup-plan.md` Round 2 的 Markets Activity 决定：启动延迟保留，离开后卸载效果的副作用已修正。
- 后续可选：量化 Markets 常驻对 Trade 标签的 CPU 开销；真机复核。
