<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-21-global-sonner-notifications",
  "date": "2026-09-21",
  "title": "全局 Sonner 通知统一及遗漏操作补齐",
  "kind": "task",
  "status": "verified",
  "topics": [
    "order-entry",
    "account-funding",
    "pr-review",
    "vite-cache",
    "docs-governance"
  ],
  "summary": "单一全局 Sonner 容器与按需订单宿主落地，补齐操作反馈、owner/env 隔离、逐市场结果和 pending 恢复；6888项终端测试、生产构建与预算通过，未执行真实交易或发布。",
  "thread": {
    "id": "01a0c3b4-5aec-7f93-bc8b-6ecf0e661507",
    "title": "启动开发服务器"
  },
  "baseCommit": "ae2f11d4634ec7e2651c5caf60ff0d3cd32d580c",
  "commits": ["a379d231"],
  "sources": [
    {
      "path": "docs/trading-notifications.md"
    },
    {
      "path": "docs/adr/0019-global-trading-notifications.md"
    },
    {
      "path": "apps/terminal/src/components/trade/order-notification-host.tsx"
    },
    {
      "path": "apps/terminal/src/lib/tests/order-toast-placement.test.tsx"
    },
    {
      "path": "apps/terminal/tests/browser/position-close-all.pw.ts"
    },
    {
      "url": "https://raw.githubusercontent.com/emilkowalski/sonner/v2.0.7/src/state.ts"
    },
    {
      "url": "https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint"
    }
  ],
  "supersedes": []
}
-->
# 全局 Sonner 通知统一及遗漏操作补齐

## 背景与范围

用户授权在先前反馈组件审查基础上，规划并执行一个全局 Sonner 容器的统一调整，同时审查遗漏操作。同步记录本次修改；开始时工作区干净，分支 `codex/reviewceshi`。没有重复执行主网交易。

## 结论与依据

- 根运行时稳定挂载 AppToaster，由轻量 gate 按需加载订单宿主，订单内容、普通提示、资金恢复与 CCTP 共用一个 Sonner 堆叠；交易页不再持有 OrderToast 容器。
- 任务以 owner/env 和稳定逻辑 ID 关联。迟到结果写原任务，离页和换账户只改变显示；关闭等待通知不取消请求、不解除业务锁。成功仅进入堆叠前台时开始显示计时。
- 补齐单仓/全部/限价平仓、反手、TP/SL、逐仓保证金、现货兑换、撤改单、TWAP终止、账户模式/杠杆/保证金模式、推荐操作。资金核验、密钥保存等保留专用面板，完整入口矩阵见 Reference。
- 子项区分接受、完整成交、部分成交和仅状态已成交但数量未核对；全部仓位已平仍需原路径的新仓位快照。可选展示 metadata 损坏不能丢弃合法 pending 事实。
- 附带修复反馈回调异常误改交易事实、组件卸载后将真实成功改报失败、TWAP历史终态误标运行中，以及账户切换的程序 dismiss 误删任务风险。真实Sonner进一步复现资金恢复、CCTP及邮箱自动充值快速隐藏/重显被旧400ms退出计时移除的问题，8项反例修前失败，修后相关5文件64项通过。
- 首轮生产构建编译和chunk循环检查通过，但runtime startup增量预算失败：移动端+11542、桌面+13054（均允许+10000）。静态启动较预算基线减少27784，不能将这解释为总加载变慢；仍保留原预算，采用有任务才加载Host的自然边界，不调整阈值。按需 gate 实施后完整生产build通过，runtime增量gzip为移动117552（+6972）、桌面200498（+8510），未改预算阈值；chunk cycle、bundle budget、shell preload、inline hashes、head scrub均通过。
- 采用现有 Sonner custom/同ID更新；不引入另一通知库、不把通知队列当交易所执行队列或永久历史。

## 验证与限制

验证版本：上述基线加本任务工作区修改，最终提交由 Git 历史关联。任务开始于 2026-09-21，最终验证跨越至 2026-09-22（Asia/Shanghai）；以下记录不代表发布。

- 第一轮 terminal 全量：590文件通过、5失败、1跳过；6846测试通过、14失败、1跳过。失败包括旧双宿主/source-import约束、旧toast断言、缺失mock provider及滑块SSR旧fixture。保留 `/tmp/gatu-feedback-full-tests.log`；修正后第二轮全量595文件通过、1跳过；6870测试通过、1跳过（105.82秒，23:57:42开始）。此轮之后又补充了竞态回归与少量等价代码整理，最终结果另列。
- typecheck前几轮失败（onResponse测试元组、反馈错误union、Sonner类型缩窄），对应修正后 terminal typecheck 通过。
- 宿主/Toaster/启动/pending metadata聚焦4文件45测试通过。后续presentation旧回调及unconfirmed软隐藏回归4文件60项通过，代码风格等价清理3文件68项通过。
- 新 gate 后全量一轮（599文件）：596通过、2失败、1跳过；6886项通过、2失败、1跳过。失败是modal源码契约未跟随gate更新、真实Host首次动态transform在并行构建时超过单测5秒上限。测试现改为collection预加载真实模块、继续保留可控deferred importer及30秒等待/实际展示5秒断言，不放宽timeout或削弱行为；最终全量复跑结果见下表。
- 最终源码TypeScript通过；84个改动源码/测试TS/TSX/CSS的Biome检查通过，浏览器fixture格式化（该目录由仓库Biome配置排除）。Lingui提取/编译通过，本次32个新增key已补全zh/ar/hi/es/fr翻译并逐项校验占位符；未扩大处理既有缺失翻译。
- 子任务报告 close-all Playwright 全套39通过，再新增pending-dismiss用例1通过；首次38通过1失败是mock使用裸TypeError不能代表SDK歧义异常，改用实际HttpRequestError后通过。脱敏记录 `.worklog/feedback-components-review/close-feedback-browser-validation.txt`。
- CUA隔离fixture手动验证单Sonner、普通提示和批次同栈、逐市场部分成交、模拟跨页展示与切账户返回原结果；宽度390/600/601/800/1000时通知底部776、底部导航顶部788（视口高844）；1001/1280稳定后底部820。最初快速切换桌面后的即时旧media-query读数已丢弃，未作为结论。
- 实际localhost开发页面读到一个空闲Notifications区域、零已填充栈，无Vite错误遮罩；没有触发真实账户动作。另检查了浅色800px通知外观，深色与各宽度布局此前已检查；结束后已还原临时视口并关闭自建fixture标签/服务器，用户标签保持。
- 仅模拟网络/隔离浏览器，没有真实交易、真实钱包签名、物理设备验收、推送或发布。普通短提示并未全部改成可重译/可恢复的语义任务；邮箱自动充值controller回到idle后残留短提示仍存在语言切换边界。

### 最终检查（2026-09-22）

| 命令/范围 | 实际结果 |
| --- | --- |
| `pnpm --filter @gatu/terminal test` | 598文件通过，1文件跳过；6888项通过，1项跳过，86.91秒（02:24:59开始）。跳过的是需显式开启的 `websocket-soak` 长时测试 |
| `pnpm --filter @gatu/terminal typecheck` | 通过 |
| `pnpm exec biome check` 本任务84个改动源码/单测TS/TSX/CSS | 通过；gate和modal测试最后调整另作定向Biome检查 |
| `pnpm --filter @gatu/terminal build` | 完整通过，包括chunk循环、未改阈值的bundle budget、shell预载、inline script hashes和head scrub；第三方PURE/use-client及大chunk提示未阻止构建 |
| `pnpm i18n:extract`、`pnpm i18n:compile` | 通过；最终build也执行了compile，本次32条新增翻译全部已补齐 |
| `pnpm --dir apps/terminal exec playwright test --config tests/browser/position-close-all.playwright.config.ts`，随后同命令 `--grep 'hiding waiting feedback'` | 39项全套+1项新增用例通过。发生在最终展示ID竞态和lazy gate补修之前；后续代码由真实Sonner用例、最终full/typecheck/build验证，不冒称又执行过Playwright |
| 本任务Markdown本地链接 | 285个目标有效（含AGENTS/guide/Reference/ADR/旧文档修订）；后加验证记录未引入新链接 |
| `pnpm memory:index`、`pnpm memory:check`、`pnpm memory:test` | 已通过；最终元数据更新后再次运行并确认，测试8项 |
| `git diff --check`、提交前staged diff检查 | 通过 |

最终检查日志在本机 `/tmp/gatu-feedback-verified-tests.log`、`/tmp/gatu-feedback-build-final.log`、`/tmp/gatu-feedback-typecheck-complete.log`、`/tmp/gatu-feedback-biome-final.log`。这些是本地临时证据，不承诺永久存在；本记录保存了结果、失败与范围。最后修改仅为测试可靠性/契约和交付文档，未在通过构建后再改运行时代码。

## 后续与替代关系

本记录局部替代历史交易反馈审查的双宿主和遗漏入口描述；历史观察/测试记录保留。完整历史通知中心与不存在pending事实的刷新重放不在本次范围，均不承诺。本次实现和检查已完成；后续变更先查全局操作通知Reference及ADR0019。
