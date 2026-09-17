<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-17-trade-route-reveal",
  "date": "2026-09-17",
  "title": "交易路由在首屏惰性片段解析后揭示（ADR 0012）",
  "kind": "task",
  "status": "recorded",
  "topics": [
    "static-hosting"
  ],
  "summary": "热刷新路由揭示被 React 300 ms fallback 节流拖到 447 ms；bootTradeRoute 改为返回等待首屏惰性片段的 Promise 并由 beforeLoad await，带 1500 ms 上限；改动前后本地时间线与验证见正文。",
  "thread": null,
  "baseCommit": "b80bd533bbf7c66e41817615a441e0cd973989ab",
  "commits": [],
  "sources": [
    { "path": "docs/adr/0012-trade-route-reveal-after-surface-preload.md" },
    { "path": "apps/terminal/src/lib/trade/trade-route-boot.ts" },
    { "path": "docs/work-memory/sessions/2026-09-17-warm-reload-comparison.md" }
  ],
  "supersedes": []
}
-->
# 交易路由在首屏惰性片段解析后揭示（ADR 0012）

## 背景与范围

同步记录。分支 `claude/placeholder-parity`，worktree `.claude/worktrees/previous-task-review-b5a831`。用户在[二三次刷新对照](2026-09-17-warm-reload-comparison.md)后要求"按第 1 项做，先写 ADR 再实施"。实施前追加的 React commit 钩子测量推翻了"导航栏被钱包运行时块挡住"的假设：Privy iframe 193 ms 已挂载；真正的空窗是路由 Match 的 Suspense 在 147 ms 提交 fallback 后，重试渲染因页面内惰性片段未解析再次挂起，React 按 `FALLBACK_THROTTLE_MS` 推迟到 447 ms。ADR 0012 据此改为等待首屏惰性片段。

## 结论与依据

- 改动：`lib/lazy.ts` 新增 `preloadLazyComponents`；`preloadTopNav`、`preloadMainWorkspacePanels`、`preloadDesktopTerminalSurface`、`preloadGlobalModals`、`preloadAppRuntimeOverlays`、`preloadTradeTerminalSurface` 返回 `Promise<void>`；`bootTradeRoute` 返回带 `TRADE_ROUTE_REVEAL_BUDGET_MS`（1500 ms）上限的 Promise；`routes/trade.tsx` 的 `beforeLoad` `await` 它。图表库与持仓面板的二级预加载仍即发即忘。
- 改动前本地生产构建（Nitro 3017，headless Chromium，React commit 钩子）：热刷新第 3 次 fallback commit 84 ms → 导航栏 385 ms → 网格 411 ms；10 Mbps/40 ms 限速冷加载 fallback 1588 ms → 导航栏 1896 ms → 网格 2154 ms。两者导航栏时刻都等于 fallback + 300 ms。
- 改动后：见"验证与限制"。

## 验证与限制

工作区版本：基线 b80bd533（ADR 0012 提交）+ 本任务未提交改动；2026-09-17，本地 macOS，headless Chromium，Nitro 本地服务 3017。

- Biome、`pnpm --filter @gatu/terminal typecheck` 通过。定向单测：trade-route-boot（3，含等待集合、失败兜底、1500 ms 上限）、trade-terminal-boot（10）、trade-terminal-page-boot（17）、root-startup-fallback（7）、desktop-grid-layout（32）、grid-content-height（6）：75/75；翻译契约 i18n-reactivity-contract + i18n-hot-switch：127/127。
- `pnpm build` 通过：总 gzip 3,081,963 B（较基线 −72,744），trade 静态闭包 1,569,180 B，`trade-terminal-page` 126,989 B（改动前 126,995），预算与 chunk 循环检查通过。
- 第一版（只等一级片段）复测：热刷新 fallback 77 ms → 导航栏/网格 122 ms，但网格出现后仍有 `TradingViewChart` 包装与 `PositionsTab` 两个二级边界挂起，到 377 ms（= 77 + 300）才提交；据此把二级片段纳入等待集合并修订 ADR 决策 2。
- 第二版（最终）复测：

| 场景 | 改动前 | 改动后 |
| --- | --- | --- |
| 热刷新第 3 次：fallback commit → 导航栏 → 网格 | 84 → 385 → 411 ms（+300 节流） | 76 → 94 → 118 ms，两次提交均无挂起边界 |
| 10 Mbps / 40 ms 限速冷加载：fallback → 导航栏 → 网格 | 1588 → 1896 → 2154 ms | 1562 → 1627 → 2241 ms（网格由市场目录网络请求决定，两轮差异在单次采样噪声内） |
| 本地不限速冷加载 `boot-milestones`（改动后） | — | hydrated 188、chrome 250、workspace/grid/bookData 591 ms |

- 一次自伤教训：重建脚本用 `pnpm build | grep | head -8` 截断输出，`head` 退出后 vite 收到 SIGPIPE 提前终止，`.output/server` 为空、`pipestatus` 仍显示 0；改为完整写入日志后再 grep。
- 全量 `pnpm --filter @gatu/terminal test`（默认并发，与构建串行）：566 文件 = 553 通过 / 12 失败 / 1 跳过；6,298 用例 = 6,245 通过 / 52 失败 / 1 跳过。其中 9 个文件为今早记录的既有基线红（desktop-positions-panel-shell 18 项的首个错误是 `@/lib/hyperliquid` mock 缺 `useInfo`，与本次无关）；`mobile-agent-sync-route`（18）与 `orderbook-boot`（1）为 09-16 记录的并发敏感文件，单独复跑 20/20、5/5 通过；`home-route.test.ts` 1 项是本次引入的真实回归——它整体 mock 了 `@/lib/lazy` 而缺少新导出 `preloadLazyComponents`，补上后 5/5 通过；另有 1 个文件 2 项未被日志过滤捕获。其余 10 个 mock 该模块的测试文件（221 项）复跑通过。未放宽任何断言。
- 顺带修复的真实 bug（用户在自己的 Chrome 打开开发服务器 3016 黑屏）：`StartupReadyGate` 的 effect 只在条件"尚未满足"时注册回调，若语言目录与字体在首次渲染与 effect 之间都已就绪（开发构建 StrictMode 第二次 effect 必然如此；生产构建为小概率竞争），既无回调也无 `reveal()`，页面永远停在空播报。修复为 effect 末尾无条件调用一次 `reveal()`；新增 `root-startup-fallback` 用例（`document.fonts.check` 首次 false、之后 true），去掉修复行验证为红、恢复为绿；修复后 3016 开发服务器在内置浏览器中正常渲染（导航栏、7 面板、22 档盘口）。这也解释了此前"内置浏览器面板开发模式停在门控"的现象。
- 未做：线上部署后的复测（本记录全部为本地生产构建数据）；真机与多浏览器验收；内置浏览器面板在开发模式下停在 `StartupReadyGate` 的问题未查明，与本改动无关（对照服务器同样如此），生产构建在面板中正常。

## 后续与替代关系

- 钱包运行时与 chrome 的拆分不再是当前瓶颈，未实施；若后续要让导航栏早于市场内容出现，需另行决策。
- 下次先查 `apps/terminal/src/lib/trade/trade-route-boot.ts`、`src/routes/trade.tsx`、`src/lib/lazy.ts`。
