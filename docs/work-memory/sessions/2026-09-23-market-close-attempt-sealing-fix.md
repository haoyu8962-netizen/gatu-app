<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-23-market-close-attempt-sealing-fix",
  "date": "2026-09-23",
  "title": "市价平仓点击即封存、TP/SL 保证金例外与 account-actions 夹具修复",
  "kind": "task",
  "status": "verified",
  "topics": ["pr-review", "order-entry"],
  "summary": "修复对抗审查 F1–F3：确认点击时同步封存不可变的提交尝试并按会话去重，宿主按尝试对象记录执行；部分成交 TP/SL 提示完整写出官方的保证金不足例外；给 account-actions 浏览器夹具补账户身份。全量单测、CI 条件构建与 5 个 CI 浏览器套件通过，未做真实钱包或真实成交验收。",
  "thread": null,
  "baseCommit": "155f36aa",
  "commits": ["7fe62d3e", "b6f726ce", "4429b067"],
  "sources": [
    { "path": "docs/work-memory/sessions/2026-09-23-claude-eight-commit-adversarial-review.md" },
    { "path": "apps/terminal/src/lib/trade/position-market-close-submitter.ts" },
    { "path": "apps/terminal/src/components/trade/components/position-market-close-submit-host.tsx" },
    { "path": "apps/terminal/src/hooks/trade/use-position-market-close-submit.ts" },
    { "path": "apps/terminal/src/lib/tests/position-market-close-submit-lifecycle.test.tsx" },
    { "path": "apps/terminal/src/lib/trade/order-notification-copy.ts" },
    { "path": "apps/terminal/tests/browser/account-actions-hyperliquid.browser.ts" },
    { "path": "apps/terminal/tests/browser/account-actions.vite.config.ts" },
    { "path": "docs/confirmation-surfaces.md" },
    { "path": "docs/trading-notifications.md" },
    { "path": "docs/adr/0014-market-close-submit-and-dismiss.md" },
    { "url": "https://hyperliquid.gitbook.io/hyperliquid-docs/trading/take-profit-and-stop-loss-orders-tp-sl" }
  ],
  "supersedes": []
}
-->
# 市价平仓点击即封存、TP/SL 保证金例外与 account-actions 夹具修复

## 背景与范围

另一会话在 `173585a4` 对本分支 8 个 Claude 联署提交做了[对抗审查](2026-09-23-claude-eight-commit-adversarial-review.md)，确认 3 项 P2（F1、F2、F3）。我在补跑浏览器套件时另外发现 `account-actions` 套件从 codex 的 `a379d231` 起失败（`git bisect` 定位，`origin/dev` `9387a888` 上通过），属于夹具缺口。用户要求按建议修复并确保符合编码规范。基线 `155f36aa`，开始时工作区干净。本记录由会话同步写成，没有可核对的会话标识。按 ultracode 模式执行：先实现，再用五维对抗审查工作流复核（每条发现由两位复核者尝试推翻）。

## 结论与依据

- F2（等待宿主期间未封存）：`submitPositionMarketClose()` 改为在点击的同步阶段调用 `beginPositionMarketCloseAttempt()`。它建立唯一的待处理通知、关闭弹窗、让会话离开 `idle`，并把数量意图、显示上限、开窗方式与「不再提示」冻结进不可变的 `PositionMarketCloseAttempt`，然后才等待宿主。`usePositionMarketCloseSubmit` 只暴露 `execute(attempt)`，执行时读冻结的意图，并要求会话仍处于 `validating`，否则失败关闭。等待 5 秒仍无宿主时，按同一条通知报告失败，子项标为 rejected，并释放会话。
- F1（重复调用清掉运行标记）：同一会话的后续调用复用同一个尝试的 Promise，不再派发；宿主改为按尝试对象记录执行中的提交。复核指出，正常路径里首要屏障是封存时的 `idle` 检查：封存后弹窗按钮即禁用，第二次调用也开不出新尝试。复用与按对象记录是纵深防御，与首要屏障不可区分。文档与测试标题已按这一点写实，不宣称它们被单独证明。
- F3（TP/SL 提示漏了官方例外）：文案改为「只有订单完全成交，或剩余部分因保证金不足被取消时，附带 TP/SL 才会下达；请检查持仓的 TP/SL」，依据是 Hyperliquid 官方 TP/SL 文档。文案不推断某一笔附属单的状态。六种语言同步；这条文案在本会话中新加、从未发布过，所以删掉了旧文案留下的废弃目录条目。
- account-actions 夹具：`a379d231` 让 `AccountModeForm` 在渲染时调用 `useHyperliquid()`，但夹具没有 Provider。新增 `account-actions-hyperliquid.browser.ts`：先 `export *` 转出真实的 `@/lib/hyperliquid`，只用本地导出覆盖 `useHyperliquid`，返回夹具的账户身份；再在该夹具的 Vite 配置里加别名。产品代码不变。
- 五维审查的 6 条 P3 均为测试与文档精度问题，已全部处理：F1 用例改名，并断言重挂载按钮禁用、只产生一个尝试；补「重复调用后宿主卸载不发单」「无宿主超时后子项 rejected」两个用例；`confirmation-surfaces.md` 第 3 行改为现行接口，第 6 行写明替身范围；F3 更正链接到审查记录；上一轮任务记录追加更正；补本记录。

## 验证与限制

- 新增与更新的测试：`position-market-close-submit-lifecycle.test.tsx` 4 项（真实市价平仓弹窗、`TradingActionButton`、`useTradingGuard`、提交入口、宿主与 store；`@gatu/ui` 外壳、输入、滑杆、数据 hook 与签名状态 hook 是替身，断点重挂载为模拟），`position-market-close-submit-host.test.tsx` 9 项，`order-notification-copy.test.ts` 增加 4 种附属单状态下文案相同的用例。
- 变异检查：把提交入口、宿主与 hook 三个文件还原为 `155f36aa` 的实现时，生命周期 4 项全部失败；删掉超时路径的 rejected 映射时，两个超时用例失败。
- 修复代码定稿后的工作区（测试只增补了断言）：全量 `pnpm --filter @gatu/terminal test` 604 个文件（1 个跳过）、7,007 项通过（1 项跳过）；类型检查 0 错误；Biome 通过；CI 条件的 `pnpm build`（Node 22.15、两个配对开关关闭）通过，chunk 循环与包体积预算检查均通过，运行时启动比基线多 7,608 B（移动端）和 8,768 B（桌面端），允许增量 10,000 B；浏览器套件 `mobile-trade-all-orders` 47/47、`position-close-all` 40/40、`notifications` 19/19、`account-actions` 24/24、共享配置 4 个 spec 共 49/49。
- 补测试断言之后重跑：AGENTS.md 确认面测试组，加通知文案、toast、i18n 与市价平仓 submit/session 测试，共 46 个文件 1,068 项通过；类型检查 0 错误；`memory:index`、`memory:check` 通过，`memory:test` 8/8 通过。
- 未执行：真实钱包签名、真实成交（含真实的 `marginCanceled` 回包）、真机与屏幕阅读器验收、推送或发布。`user-menu-recovery` 套件在 `origin/dev` 上同样 10 项失败，不在 CI 里，本次未处理。

## 后续与替代关系

- 本记录局部替代 [市价平仓页面级提交宿主](2026-09-23-market-close-page-level-submit-host.md) 中「宿主注册前确认最多等待 5 秒」的实现细节（改为先封存再等待），以及 [codex 六提交审查与修复](2026-09-23-codex-legal-notification-review-fixes.md) 中 TP/SL 文案的表述。两份记录都已追加更正。
- 待处理：`user-menu-recovery` 浏览器套件在 dev 上的 10 项失败。
