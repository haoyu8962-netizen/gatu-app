<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-27-dashboard-route-chrome-preload",
  "date": "2026-09-27",
  "title": "仪表盘路由揭示前预加载页脚与全局弹窗宿主",
  "kind": "task",
  "status": "verified",
  "topics": ["static-hosting"],
  "summary": "九个仪表盘页面改为从共享的 components/dashboard/dashboard-chrome.tsx 渲染 DashboardHeader、FooterBar 与 GlobalModals，bootDashboardRoute 动态导入该模块并在 1500 ms 上限内等待账户菜单、全局弹窗宿主与桌面页脚。只共享惰性包装的首版使 Rollup 拆分页面与交易页共享的头部块，桌面运行时启动超预算（+10,473 / 上限 10,000）；把头部并入同一模块后所有预算指标都低于基线构建。首帧测试、三处变异检查、完整单测 602 文件 6,878 项、Node 22.15 生产构建通过；未做浏览器冷加载时间线实测。补记：gpt-6-astra 只读对抗审查 48b7d386 报 2 项 P2（/join/$code 邀请路由漏接预加载；断点只在预加载开始时读一次）与 2 项 P3（CHANGELOG 夸大；一文件多个可渲染导出），前三项修复并以变异钉住，同时消除 boot 测试在并行负载下的 5 s 超时。PR #46 第二轮 gpt-6-astra 审查报 1 项 P2（断点复核未等账户菜单）与 2 项 P3（新测试未接入按清单运行的 CI；CHANGELOG 仍夸大快捷键保证），均已修复。",
  "thread": null,
  "baseCommit": "e3b5dd82",
  "commits": ["48b7d386", "86540685"],
  "sources": [
    { "path": "apps/terminal/src/components/dashboard/dashboard-chrome.tsx" },
    { "path": "apps/terminal/src/lib/navigation/boot-dashboard-route.ts" },
    { "path": "apps/terminal/src/routes/join.$code.tsx" },
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

- `worktree-06` 合入时，法律页要整体迁移：页面改用 `DashboardHeader` 和共享的 `FooterBar`/`GlobalModals`，删除 `preloadLegalDocPage` 的页内实例，`bootLegalRoute` 直接复用 `bootDashboardRoute`。只改预加载目标、保留页内包装不行。该分支把 `legal` 加进了 `dashboard-frame-view.test.tsx` 的页面遍历，而本提交要求每个页面源码含 `DashboardHeader`，两边机械合并会让测试失败。`trade-route-boot.ts` 的 `settleWithinBudget` 导出两边相同。
- Portfolio 的 `PositionsPanel` 仍是惰性加载，用骨架作 fallback，不在本次范围内。

## Codex 对抗审查与修复（补记，2026-09-27）

用 `codex exec -m gpt-6-astra -s read-only`（medium）对 48b7d386 做只读对抗审查，约 8.2 万 token。报告结论：无 P0/P1；共享实例预加载机制成立（核对了 TanStack `lazyRouteComponent` 预加载成功后写入闭包 `comp`、渲染跳过 `use(load())`）。以下各项已逐条自行核实：

- P2，成立：`routes/join.$code.tsx` 渲染 `ReferralsPage`，但 `beforeLoad` 只校验邀请码。修复为校验通过后 `return bootDashboardRoute()`，无效邀请码仍立即 `notFound()`。
- P2，成立：`preloadDashboardChrome` 只在开始时读一次断点，等待期间从移动端变为桌面时会漏掉页脚。修复为其余片段解析后若已是桌面再补预加载页脚；开始时就是桌面的只预加载一次。（第二轮审查指出该复核只等了惰性片段、没等 `preloadTopNav()`，已在 PR #46 跟进中更正，见下一节。）
- P3，成立：CHANGELOG 把"宿主预加载"写成了"弹窗已加载、Ctrl/⌘K 立即可用"。实际上 CommandMenu 仍在首次使用时加载；法律接受分支不挂快捷键监听（`global-modals.tsx`）；1.5 秒上限此前只属于交易路由。已改写。
- P3，不改：`dashboard-chrome.tsx` 导出一个声明组件 `DashboardHeader` 和两个惰性实例常量，与 `lazy-global-modals.ts` 导出多个惰性实例的既有做法一致。头部必须留在该模块里，否则分块预算回退（见上文）。
- 变异推演指出测试钉不住的两项已补测试：删除 `preloadTopNav()`、断点查询字符串写错。另三项（`enableLegalGate` 值、api-wallet `!isFixture`、`typeof window` 保护）是本提交之前就有的行为，未扩大范围。

修复后的验证（同一工作区，未提交前）：

- 变异检查全部被抓住：去掉 `preloadTopNav`、错误断点字符串、去掉断点复核、`/join/$code` 去掉 boot，各致 1–2 项失败，改完即还原。
- Node 22.15 `pnpm build` 通过全部预算：总 gzip 3,113,483；trade 静态 1,546,433；桌面运行时 +9,445；移动 +7,736。typecheck 通过。
- 第一轮完整单测有 1 项失败：`boot-dashboard-route` 首个用例在并行负载下超过 5 s。该文件导入了 `trade-route-boot` 的真实依赖图，单独运行也要约 2.4 s，48b7d386 就有这个隐患，之前那轮完整单测是碰巧通过。已把 `app-runtime-overlays`、`market-catalog-bootstrap`、`orderbook-boot` 换成桩，保留真实的 `settleWithinBudget`，单文件耗时降到 128 ms。修复后的完整单测结果见下一条。
- 修复后完整 `pnpm --filter @gatu/terminal test`：602 文件通过、1 跳过，6,881 项通过、1 跳过。Biome 通过。仍未做浏览器冷加载时间线与真机检查。

## PR #46 与第二轮对抗审查（补记，2026-09-27）

已推送分支并开 [PR #46](https://github.com/zora4523-bot/gatu-app/pull/46)（base `dev`）。分支带入的 main 合并提交 `e3b5dd82` 与 `origin/dev` 树相同，PR 净改动只有本任务文件。随后用 `gpt-6-astra`（medium，只读）审查整个 PR，约 9.7 万 token。报告核对了 `src/routes/` 下全部 11 个入口均接入 boot，`join.$code` 返回 Promise 的语义正确，没有 P0/P1。以下各项经核实均成立，已修复：

- P2：断点复核接在惰性片段之后，却没有等 `preloadTopNav()`。交错时序"移动端启动 → 弹窗宿主完成 → 账户菜单仍在加载时转为桌面"下，预加载成功结束却从未加载页脚。改为先等账户菜单和初始惰性集合都完成，再复核并等待补加载的页脚。新增该交错顺序的测试，并断言补加载完成前总 Promise 不会结束。变异检查：恢复旧逻辑、改为不等待补加载，这两种都会让测试失败。
- P3：`.github/workflows/terminal-tests.yml` 按显式文件清单运行，本 PR 新增的测试都不在清单里。已把 `boot-dashboard-route`、`dashboard-chrome`、`dashboard-frame-view` 三个测试加入 "Test route provider lifecycles" 步骤。
- P3：CHANGELOG 改为"按时加载时首帧可用 Ctrl/⌘K，法律接受弹窗显示期间除外"。
- 审查中无法确认的一项：`gh pr view` 被沙箱网络拒绝，远端 PR 描述与 CI 状态由本会话另行核对。
- 修复后验证：CI「Test route provider lifecycles」步骤按 CI 参数（`--maxWorkers=1`）9 文件 126 项通过；`scripts/ci-workflows.test.mjs` 6 项通过；typecheck 通过；Node 22.15 `pnpm build` 通过全部预算（总 gzip 3,113,714，桌面运行时 +9,459）。
