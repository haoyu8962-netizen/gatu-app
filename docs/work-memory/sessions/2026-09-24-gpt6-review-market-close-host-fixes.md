<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-24-gpt6-review-market-close-host-fixes",
  "date": "2026-09-24",
  "title": "GPT-6 astra 对抗审查与提交宿主按意图加载、等待尝试失败关闭",
  "kind": "task",
  "status": "verified",
  "topics": ["pr-review", "order-entry"],
  "summary": "用 codex exec（gpt-6-astra，read-only，medium）对 b82dd443..15196136 做对抗审查：确认 2 项 P2——提交宿主在挂载后无条件下载但未计入启动预算、宿主注册前封存的尝试离开页面后可被其他页面接手。已改为按意图加载宿主、门控卸载时废弃等待中的尝试；未发现 P0/P1，TP/SL 文案与官方规则一致。",
  "thread": null,
  "baseCommit": "15196136",
  "commits": ["81add820", "416b2ed7"],
  "sources": [
    { "path": "apps/terminal/src/components/trade/components/position-market-close-submit-host-loader.ts" },
    { "path": "apps/terminal/src/components/trade/components/position-market-close-submit-host-gate.tsx" },
    { "path": "apps/terminal/src/lib/trade/position-market-close-submitter.ts" },
    { "path": "apps/terminal/src/components/trade/positions/positions-tab.tsx" },
    { "path": "apps/terminal/src/components/trade/mobile/mobile-positions-tab.tsx" },
    { "path": "apps/terminal/src/lib/tests/position-market-close-submit-host-gate.test.tsx" },
    { "path": "docs/terminal-performance-baseline.md" },
    { "path": "docs/adr/0014-market-close-submit-and-dismiss.md" },
    { "path": "docs/confirmation-surfaces.md" },
    { "path": "scripts/check-client-bundle-budget.mjs" }
  ],
  "supersedes": []
}
-->
# GPT-6 astra 对抗审查与提交宿主按意图加载、等待尝试失败关闭

## 背景与范围

用户要求用 GPT-6 astra CLI 对本分支这轮修复做对抗审查，标准是项目开发文档与调试 Hyperliquid 交易终端的实践。调用：`codex exec -m gpt-6-astra -s read-only -c approval_policy='"never"' -c model_reasoning_effort='"medium"'`，提示词限定只读、不提交，范围 `b82dd443..15196136`（GPT 计为 17 个提交），约 128k token。报告原文保存在会话 scratchpad，未入库。基线 `15196136`，开始时工作区干净。

## 结论与依据

审查报告确认 2 项 P2、无 P0/P1；我逐条核对后两项都成立并修复：

1. 启动预算漏计（P2）。`PositionMarketCloseSubmitHostGate` 在挂载后无条件 `import()` 宿主，是每次打开交易页都会发生的确定性下载；`scripts/check-client-bundle-budget.mjs` 只统计登记模块的静态闭包，动态导入边不计入，而 `docs/terminal-performance-baseline.md` 明确规定「A deterministic idle download would still be startup weight」，下单面板对话框正是因此改为按意图预热。GPT 对 `155f36aa` 产物只读重算，漏计约 4,250 B gzip，补计后两端都会超过上限（移动 122,438 > 120,580；桌面 205,006 > 201,988）。修复：新增 `position-market-close-submit-host-loader.ts`，宿主只在指针、按下或焦点到达持仓面板（桌面 `positions-tab.tsx` 根节点、手机 `mobile-positions-tab.tsx` 列表根节点）或市价平仓会话打开时加载；门控组件用 `useSyncExternalStore` 订阅加载结果。直提偏好用户在宿主就绪前点击仍回退为确认弹窗（既有设计）。
2. 等待中的尝试无页面归属（P2）。宿主未注册时封存的尝试只等待注册；用户离开交易页后 5 秒内进入另一个带宿主的页面（如投资组合），新宿主会接手执行，违反 ADR 0014「离开页面失败关闭」的语义。修复：提交入口记录等待中的尝试，新增 `abandonWaitingPositionMarketCloseAttempts()`，门控卸载时调用，等待中的尝试按同一条通知失败、子项 rejected、会话释放。

GPT 未确认其他缺陷：封存上限、重复调用、宿主执行守卫、legal 分支、StrictMode、SSR 导入路径、选项点击几何、浏览器夹具断言均已检查；TP/SL 六语言文案与官方父订单 TP/SL 规则一致。它指出生命周期测试里仍有按调用时读取仓位的桩，不能单独证明卸载后的数据新鲜度——该证明由 `position-market-close-submit-host.test.tsx` 的按渲染捕获桩承担，已在上一记录写明。

## 验证与限制

- 新增 `position-market-close-submit-host-gate.test.tsx` 3 项（挂载不加载、会话打开后加载、意图预热后加载与卸载废弃）；`position-market-close-submit-host.test.tsx` 增加「页面离开后新宿主不接手」用例；`global-modals-market-close-legal.test.tsx` 改为会话打开后再等待宿主注册。
- 实际运行（`81add820` 的工作区）：类型检查 0 错误；全量 `pnpm --filter @gatu/terminal test` 605 个文件（1 个跳过）、7,012 项通过（1 项跳过）；CI 条件 `pnpm build`（Node 22.15、配对开关关闭）通过，运行时启动比预算基线多 7,352 B（移动端）和 8,830 B（桌面端），允许 10,000 B，且宿主不再随启动下载；浏览器套件 position-close-all 40/40、account-actions 24/24、mobile-trade-all-orders 47/47。持仓面板的预热绑定用 `onPointerEnter`/`onPointerDownCapture`/`onFocusCapture`，与 `trade-panel-body-view.tsx` 相同，通过 Biome 的 `noStaticElementInteractions`。
- GPT 的沙箱无法写 `.vite-temp`，它没有运行 Vitest、Playwright 或构建，其结论基于代码阅读与不落盘的边界复现；它的预算重算基于 `155f36aa` 产物。
- 未执行：真实钱包、真实成交、真机触控、浏览器实测页面离开场景。

## 后续与替代关系

- 局部替代 [点击即封存与 TP/SL 例外修复](2026-09-23-market-close-attempt-sealing-fix.md) 中「宿主按需加载、只比 HEAD 多 522 B」的表述：那次统计没有把动态加载计入；本次改为按意图加载后无交互不下载。
- 待用户决定：`user-menu-recovery` 是否入 CI；是否推送并向 `dev` 开 PR。

## 周整理补注（2026-09-28）

GitHub 只读查询（2026-09-28T01:05:38.487091+00:00）：后续 PR #40 已合入 dev，PR #41 已合入 main；具体 head/检查集合见本周记录。“是否推送并开 PR”已是历史待办；当前 checkout 的 CI 浏览器清单仍未包含 user-menu-recovery，是否纳入仍待单独决定。合并状态不代表本次部署或真实交易验收。

本条为事后整理；本轮仅核对 Git、现行文档和相关实现入口，原验证结果仍归属来源任务，未重跑业务测试。详见 [本周整理](2026-09-28-weekly-memory-review.md)。
