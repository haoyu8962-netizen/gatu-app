# ADR 0012：交易路由在首屏静态闭包解析完成后再揭示

- 状态：已接受（产品负责人，2026-09-17）；实施与验证记录见[任务记录](../work-memory/sessions/2026-09-17-trade-route-reveal.md)。
- 前置：[ADR 0006](0006-startup-preloads-and-edge-caching.md)（壳内预加载启动闭包、SW 回壳）、[ADR 0010](0010-blank-until-ready-startup.md)（空白直到就绪，先 chrome 后数据）。
- 证据：[二三次刷新对照](../work-memory/sessions/2026-09-17-warm-reload-comparison.md)。

## 背景与约束

2026-09-17 对 `app.gatu.ai/trade/HYPE` 第三次刷新（持久化 profile，headless Chromium）用 React DevTools 钩子记录每次 commit：

| 时刻 | 事件 |
| --- | --- |
| 90 ms | DCL；所有 JS 资源在 143 ms 前已从缓存取回，网络字节为 0 |
| 147 ms | 首个含 Suspense fallback 的 commit：`/trade` 路由 `Match` 因 `_displayPending`/`loadPromise` 挂起，显示 `StartupFallback` |
| 193 ms | Privy iframe 出现：client-root 运行时块（含 Privy/wagmi）已挂载 |
| 221 ms | 最后一次仍挂起的 commit；此后至 411 ms 没有任何 commit，也没有长任务 |
| 447 ms | 路由揭示，导航栏出现（fibers 489） |
| 471 ms | 网格与五个面板出现（fibers 1234） |

147 + 300 = 447：这是 React 19 `FALLBACK_THROTTLE_MS` 的节流——`router.load()` 约 221 ms 完成后，重试渲染进入 `TradeTerminalPage`，但页面内部通过 `lazyRouteComponent` 惰性加载的 FooterBar、TopNav 片段、五个工作区面板、GlobalModals 等此时尚未解析（它们的 `preload()` 在 `bootTradeRoute` 里只是触发、未等待），重试渲染再次挂起，React 把提交推迟到最近一次 fallback 之后 300 ms。`lib/trade/trade-route-boot.ts` 的原注释已描述过这一风险，但假定"块在壳的预加载清单里，通常在目录应答前解析完"，实测热刷新下并不成立。

官方终端同条件下网格 489 ms、Privy iframe 529 ms；两站 CPU 采样同量级。此前"导航栏被钱包运行时块挡住"的假设不成立：运行时在 193 ms 已就绪，瓶颈是 Suspense 节流。

约束：不改壳、预加载清单、HTTP 缓存、SW、启动门控（`ClientRuntimeGate`、`StartupReadyGate`）与数据/签名守卫；不改 ADR 0010 的空白播报语义。

## 决策

1. `bootTradeRoute` 返回 Promise：并行等待 `preloadAppRuntimeOverlays()` 与 `preloadTradeTerminalSurface()`，两者各自返回其 `lazyRouteComponent.preload()` 的 `Promise.all`。目录引导与订单簿流仍是即发即忘。`/trade` 路由的 `beforeLoad` 改为 `await bootTradeRoute(...)`，因此 `router.load()`（即 SPA 壳水合中的 `displayPendingPromise`）只在首屏每一个惰性片段解析完成后才落定；路由揭示时的重试渲染不再挂起，React 直接提交（`RootCompleted`），不触发 300 ms 节流。
2. 等待集合只含首次渲染必然挂载的惰性片段：FooterBar、TopNav 的惰性片段、桌面工作区五个面板（Account、Chart、Orderbook、Positions、Trade）及它们首屏必然渲染的二级片段（图表面板的 `TradingViewChart` 包装组件、持仓面板默认页 `PositionsTab`）、GlobalModals、Toaster、FundsActionRecoveryHost。首版曾把二级片段留作即发即忘，实测它们在网格出现后再次挂起并被节流到 fallback + 300 ms，故纳入。TradingView 图表库本身是 iframe 内的脚本，不在集合内；持仓面板其它页签按意图预加载。移动视口沿用现有分支：不等待桌面面板。
3. 等待有上限 `TRADE_ROUTE_REVEAL_BUDGET_MS`（1500 ms）：超时或任一预加载失败时照旧揭示，由既有 Suspense 与 `lazyRouteComponent` 的模块缺失自动重载兜底。`lazyRouteComponent.preload()` 自身吞掉错误，等待不会抛出。
4. `preloadDesktopTerminalSurface`、`preloadMainWorkspacePanels`、`preloadTopNav`、`preloadGlobalModals`、`preloadAppRuntimeOverlays` 的返回类型从 `void` 改为 `Promise<void>`；现有调用方继续 `void` 调用，不改行为。

## 备选方案

- 把 TopNav/FooterBar 与市场数据移出钱包运行时门控，仅让钱包 SDK 门控账户/签名 UI：改动面覆盖所有直接调用 Privy/wagmi 钩子的组件，而实测钱包运行时在 193 ms 已就绪，不是当前瓶颈；否决，保留为后续独立议题。
- 在 `hydrateRoot` 之前手动 `await` 页面块：`Match` 仍因 `router.load()` 未完成而抛出 `displayPendingPromise`，fallback 照样提交，且嵌套惰性片段仍会在重试时挂起；不解决节流，否决。
- 把工作区面板改为静态导入：会把面板并入 `trade-terminal-page` 块，破坏现有 chunk 预算与移动/桌面分面预加载（ADR 0006 决策 6）；否决。
- 去掉 `pendingComponent`/Suspense 边界：`ssr: false` 路由总会被 `Match` 包在 Suspense 里，节流照旧；否决。

## 后果

- 热刷新预期：路由揭示从约 447 ms 提前到 `router.load()` 完成时刻（约 230–260 ms），导航栏与网格同帧出现；无新网络请求，包体只增加返回 Promise 的胶水代码。
- 冷加载：揭示改为等待首屏全部惰性块到达，而这些块本就在壳的 `modulepreload` 清单里并行下载；导航栏不再先于面板出现，但面板揭示不再额外等 300 ms。实测数字记录在任务记录中，不在本 ADR 内预设。
- 超过 1500 ms 未解析（极慢网络或块失败）时回到现状行为，不会阻塞路由。
- 客户端导航进入 `/trade`（非水合）同样经过 `beforeLoad`，等待同一集合；`defaultPreload: "intent"` 的意图预加载会提前解析这些块，等待通常立即完成。

## 验证

单测：`trade-route-boot.test.ts`（返回 Promise、等待集合、超时与失败兜底）、`trade-terminal-boot.test.ts`、`trade-terminal-page-boot.test.tsx`、`root-startup-fallback`；typecheck；Biome。浏览器：本地生产构建热刷新第三次加载的 commit 时间线（无 300 ms 空窗、导航栏与网格在 `load()` 完成后同帧）；10 Mbps/40 ms 限速冷加载的 header/grid 里程碑前后对照；`boot-milestones.mjs` 冷加载不回退；构建预算。实际结果记录在任务记录中，本 ADR 不宣称已执行。

## 补充（2026-09-27）：仪表盘路由

仪表盘路由的 `bootDashboardRoute` 原先只等待 `preloadTopNav()`，而页面各自声明的 `FooterBar`（仅桌面）与 `GlobalModals` 惰性包装未被预加载：冷启动直达时页面先揭示，页脚与全局弹窗宿主（含 Ctrl/⌘K 监听）随后经 300 ms 节流才出现。现在十个仪表盘页面（2026-09-27 合入 `dev` 时迁移的 Earn 页在内，及渲染 Referrals 的 `/join/$code` 邀请路由）统一从 `components/dashboard/dashboard-chrome.tsx` 渲染 `DashboardHeader` 与同一组惰性实例，`bootDashboardRoute` 只动态导入该模块并等待 `preloadDashboardChrome()`（账户菜单、全局弹窗宿主、桌面页脚），并沿用本 ADR 的 `TRADE_ROUTE_REVEAL_BUDGET_MS` 上限与失败兜底；该模块动态导入，路由树块不引入钱包依赖。头部放在同一模块是为了让动态块与页面共享头部闭包：只放惰性包装时 Rollup 会拆分页面与交易页共享的头部块，桌面运行时启动体积超出预算。验证记录见 `docs/work-memory/sessions/2026-09-27-dashboard-route-chrome-preload.md`。
