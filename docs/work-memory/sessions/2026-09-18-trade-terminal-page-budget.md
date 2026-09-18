<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-18-trade-terminal-page-budget",
  "date": "2026-09-18",
  "title": "PR #27 预算超限：下单表单三个弹窗改为按意图懒加载",
  "kind": "task",
  "status": "recorded",
  "topics": [
    "order-entry"
  ],
  "summary": "PR #27 的四个 Build terminal 任务因 trade-terminal-page 128,778 B 超出 127,242 B 上限而失败（main 为 127,085）；增量来自 MobileAccountView 去掉提前 return 后被 React Compiler 编译，以及移动端订单簿表头芯片。未重定基线，改为把保证金模式、杠杆、账户模式三个弹窗移出启动 chunk：首次打开才加载、指针或焦点到达下单表单时按意图预热，失败时不刷新页面而是给出重试与显式刷新。trade-terminal-page 降到 126,255 B，桌面与移动端总启动分别减少 5.7 KB 与 4.1 KB。最初的空闲预热版本按基线文档的计数规则会让桌面运行时预算超限，已弃用。",
  "thread": null,
  "baseCommit": "35146f69",
  "commits": [],
  "sources": [
    { "path": "docs/terminal-performance-baseline.md" },
    { "path": "apps/terminal/src/lib/lazy.ts" },
    { "path": "apps/terminal/src/components/ui/lazy-dialog-host.tsx" },
    { "path": "apps/terminal/src/components/ui/lazy-dialog-boundary.tsx" },
    { "path": "apps/terminal/src/components/trade/tradebox/lazy-trade-settings-modals.ts" },
    { "path": "scripts/check-client-bundle-budget.mjs" }
  ],
  "supersedes": []
}
-->
# PR #27 预算超限：下单表单三个弹窗改为按意图懒加载

## 背景与范围

PR [#27](https://github.com/zora4523-bot/gatu-app/pull/27)（`claude/surface-tokens-touch-feedback` → `dev`）的 CI 中四个 `Build terminal` 矩阵任务全部失败，日志里唯一的失败行是 `trade-terminal-page-*.js gzip increased by 5457 bytes from baseline 123242; allowed increase is 4000 bytes`；其余四项检查通过。用户要求先处理这个预算问题，并要求方案「符合实践、审查过、调试过、有收益」。本记录为同步记录。

## 结论与依据

- 来源定位：在隔离 worktree 构建 `origin/main`（`3a80b360`）得到 127,085 B，本分支 128,778 B。按函数段归一化对比两个产物：`MobileAccountView` 在 main 上未被 React Compiler 编译（有提前 return 之后的 hook），`d13435d2` 去掉提前 return 后被编译，压缩前多约 3.7 kB 记忆化代码；移动端订单簿表头芯片多约 0.7 kB。两次构建的字面量总量基本相等，配对开关开或关只差 29 B。
- 采用：保证金模式、杠杆、账户模式三个弹窗经 `LazyDialogHost` 首次打开才挂载，使用新的 `createRetryableLazyComponent`。预热由下单表单外壳（`TradePanelBodyView`、`MobileTradeFrameView` 的 `onIntent`：pointerenter、pointerdown 捕获、focus 捕获）触发，每个表面只触发一次。
- 未采用的方案与原因：
  - 只重定基线：`docs/terminal-performance-baseline.md` 要求「移除回归，或记录并评审一次有意的重定基线，不得只为让 CI 变绿而改数字」；该表面 9 月 14 日刚重定过一次，先移除回归。基线未改。
  - 空闲预热（第一版实现）：同一文档规定确定性的空闲预热要计入运行时档位。如实计入后桌面增量约 211.6 kB，超过 201,988 B 上限，且总启动字节比修复前多约 6.7 kB，等于把字节挪到没登记的地方，已弃用；为此对 `lazy-global-modals.ts` 做的 `runWhenIdle` 抽取也已撤回。
  - 异步加载现货社交链接数据（约 7.6 kB gzip）：收益更大，但会让现货市场头在数据到达时重排，触碰市场头抖动的既有约束，未做。
- 审查发现并已处理（只读对抗审查子代理，一轮）：`createLazyComponent` 包的是 TanStack 的 `lazyRouteComponent`，导入失败后会在下一次渲染该组件时 `window.location.reload()`；下单表单的数量、价格草稿只在内存里，会被清空。为此新增不刷新页面的加载器。
- 实现中自己发现并修复的缺陷：加载器第一版在导入失败后立即清掉缓存的 promise，React 在拒绝后的重渲染会再次发起导入，错误永远到不了错误边界，持续失败时形成循环。现在「有渲染在等待」的失败会保持为 `LazyComponentLoadError`，直到错误边界调用其 `retry()`；没有渲染在等待的预热失败则被遗忘。测试「持续失败时不自行发起第二次导入」钉住这一点。
- 浏览器实测得到的平台事实：Chromium 对同一文档内加载失败的模块不会重新请求（恢复文件后点 Try again 仍失败，且没有新的网络请求）。因此错误外壳同时提供 `Reload page` 并说明刷新会清除未发送的订单；刷新由用户决定。

## 验证与限制

2026-09-18 本地，工作区基于 `35146f69`：

- `pnpm --filter @gatu/terminal typecheck` 通过；改动文件 Biome 通过。
- 新增/更新测试：`lazy-dialog-host`（6）、`lazy-trade-settings-modals`（4）、`use-has-been-active`（1）；`mobile-trade-size-validation-a11y` 的 `@/lib/lazy` mock 补上新导出。
- `pnpm build`（配对开关关闭）通过全部预算，数字见 `docs/terminal-performance-baseline.md` 的「Order-form dialogs leave `trade-terminal-page`」一节。
- 浏览器（生产构建经 `scripts/serve-spa-static.mjs`，Playwright，文档可见）：桌面静置 6 秒、390 px 静置 5 秒均无弹窗 chunk 请求；指针进入下单面板后四个 chunk 返回 200，三个弹窗 6–22 ms 打开；390 px 模拟点按（按下后 90 ms 点击）123 ms 出现抽屉，滑入 13 个位置，无加载外壳。把 chunk 从磁盘挪走后：先出现加载外壳，再出现错误外壳，同一文档、无重复请求、无 TanStack 重载标记。
- 限制：网络为本机零延迟，真实移动网络首次打开可能出现加载外壳；失败路径只测了 404，未能模拟纯网络错误；应用内浏览器面板处于隐藏状态时动画不推进，动画相关结论来自 Playwright。全量 Vitest 结果见提交前的最后一次运行。

## 后续与替代关系

- `trade-terminal-page` 距上限约 1 kB；该 chunk 同时装着桌面与移动端表面，下一步值得评估的是把现货社交链接数据移出，或把移动端视图与桌面表面拆开。
- 本记录取代 `.worklog/2026-09-18/budget-lazy-modals/` 里搁置的半成品补丁，该补丁不再需要。
