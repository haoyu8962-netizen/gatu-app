<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-27-dashboard-route-chrome-preload",
  "date": "2026-09-27",
  "title": "仪表盘路由揭示前预加载页脚与全局弹窗宿主",
  "kind": "task",
  "status": "verified",
  "topics": ["static-hosting"],
  "summary": "九个仪表盘页面改为从共享的 components/dashboard/dashboard-chrome.tsx 渲染 DashboardHeader、FooterBar 与 GlobalModals，bootDashboardRoute 动态导入该模块并在 1500 ms 上限内等待账户菜单、全局弹窗宿主与桌面页脚。只共享惰性包装的首版使 Rollup 拆分页面与交易页共享的头部块，桌面运行时启动超预算（+10,473 / 上限 10,000）；把头部并入同一模块后所有预算指标都低于基线构建。首帧测试、三处变异检查、完整单测 602 文件 6,878 项、Node 22.15 生产构建通过；未做浏览器冷加载时间线实测。",
  "thread": null,
  "baseCommit": "e3b5dd82",
  "commits": [],
  "sources": [
    { "path": "apps/terminal/src/components/dashboard/dashboard-chrome.tsx" },
    { "path": "apps/terminal/src/lib/navigation/boot-dashboard-route.ts" },
    { "path": "apps/terminal/src/lib/tests/dashboard-chrome.test.tsx" },
    { "path": "apps/terminal/src/lib/tests/boot-dashboard-route.test.ts" },
    { "path": "apps/terminal/src/lib/tests/dashboard-frame-view.test.tsx" },
    { "path": "docs/adr/0012-trade-route-reveal-after-surface-preload.md" },
    { "path": "docs/runtime-guardrails.md" }
  ],
  "supersedes": []
}
-->
# 仪表盘路由揭示前预加载页脚与全局弹窗宿主

## 背景与范围

同步记录。用户指出：仪表盘页面（portfolio、vaults、staking、referrals、leaderboard、api-wallet、trade-history、funding-history、historical-orders）各自声明 `FooterBar`（仅桌面）与 `GlobalModals` 的 `createLazyComponent` 包装，而路由 `beforeLoad` 的 `bootDashboardRoute` 只等待 `preloadTopNav()`。冷启动直达时页面先揭示，页脚与全局弹窗宿主随后经 React 300 ms 节流出现（ADR 0012），期间 `GlobalModals` 安装的 Ctrl/⌘K 监听缺失；`boot-dashboard-route.ts` 注释称账户菜单是首帧唯一惰性片段，与事实不符。参照 `worktree-06` 分支上法律页的做法（`preloadLegalDocPage` + `boot-legal-route.ts` + `settleWithinBudget`）。该分支未合入本分支基线，法律页不在本次范围内。

## 结论与依据

- 新增 `components/dashboard/dashboard-chrome.tsx`：导出 `FooterBar`、`GlobalModals` 惰性实例、`preloadDashboardChrome()`（`preloadTopNav()` + `GlobalModals`，非 `MOBILE_MEDIA_QUERY` 时再加 `FooterBar`）和 `DashboardHeader`（移动端 `MobileHeader`，桌面 `TestnetBanner` + `TopNav`）。九个页面删除页内包装，改用这些导出，保证预加载与渲染是同一实例。
- `bootDashboardRoute` 只动态导入该模块，结果交给 `settleWithinBudget(…, TRADE_ROUTE_REVEAL_BUDGET_MS)`，失败或超时照常揭示。`trade-route-boot.ts` 导出 `settleWithinBudget`（与 `worktree-06` 的一行改动相同）。
- 为什么头部也进共享模块：首版只共享惰性包装，并由路由分别动态导入 `top-nav` 与新模块。`GlobalModals` 因此多了一条不经过页面块的动态导入路径，Rollup 不再认为页面头部闭包已加载，把原先页面与交易页共享的 `testnet-banner` 块拆成 `mobile-header`、`lazy-global-modals`、`use-wallet-session` 等多个块。交易桌面运行时启动增加约 659 B 并超出预算。第二版让新模块静态引入 `top-nav` 后仍超 135 B；把整个头部并入同一模块后，动态块与页面共享头部闭包，分块恢复并略有改善。
- 路由树块（`vendor-tanstack-router`）静态依赖与基线相同（`vendor-base-ui`、`vendor-icons`、`vendor-tanstack-query`），只对 `dashboard-chrome` 做动态 `import()`。

## 验证与限制

工作区基线 `e3b5dd82`，2026-09-27 本地：

- 生产构建对照，Node 22.15.0（与 CI 的 zlib 一致），无 `.env.local`，基线在临时 worktree 中构建：

  | 指标 | 基线 | 首版（仅惰性包装） | 最终 |
  | --- | --- | --- | --- |
  | 总 gzip | 3,121,942 | 3,121,394 | 3,113,183 |
  | trade 静态启动 | 1,549,811（101 个资源） | 1,551,806（107） | 1,546,314（99） |
  | 桌面运行时增量 | 201,802（+9,814） | 202,461（+10,473，超预算） | 201,447（+9,459） |
  | 移动运行时增量 | 118,380 | 118,382 | 118,319 |

  最终版 `pnpm build` 通过 chunk 环检查与全部预算。另有一次默认 Node 24 加 `.env.local` 的首版构建同样超预算（+10,379），只作参考，不作字节证据。
- 单测：`dashboard-chrome.test.tsx` 覆盖三个真实页面（Referrals、Leaderboard、ApiWallet）在 `preloadDashboardChrome()` 之后的同步首帧（头部、页脚、弹窗宿主），移动端不预加载页脚，以及九个页面的源码契约。`boot-dashboard-route.test.ts` 覆盖等待、1500 ms 上限、失败兜底与动态导入契约。`dashboard-frame-view.test.tsx` 的源码契约改为检查 `DashboardHeader`。
- 变异检查（改完即还原）：页面恢复页内包装，Referrals 首帧用例失败；预加载去掉 `GlobalModals` 失败 4 项；去掉桌面 `FooterBar` 失败 3 项；移动端也预加载页脚失败 1 项。
- `pnpm --filter @gatu/terminal typecheck` 与 Biome 通过；启动渲染回归组、契约测试及页面测试共 55 个文件通过；完整 `pnpm --filter @gatu/terminal test` 602 文件 6,878 项通过、1 项跳过。
- 未做：浏览器冷加载时间线（`tests/browser/boot-milestones.mjs`）和真机检查；Ctrl/⌘K 首帧可用只由单测中弹窗宿主同步挂载间接证明。

## 后续与替代关系

- `worktree-06` 合入后，法律页的 `preloadLegalDocPage` 可以改用 `dashboard-chrome.tsx`：它渲染同样的头部、页脚和弹窗宿主，`bootLegalRoute` 也可以直接复用 `bootDashboardRoute`。合并时 `trade-route-boot.ts` 的 `settleWithinBudget` 导出两边相同，不会冲突。
- Portfolio 的 `PositionsPanel` 仍是惰性加载，用骨架作 fallback，不在本次范围内。
