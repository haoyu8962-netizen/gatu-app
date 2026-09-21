<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-21-funds-dialog-outcomes",
  "date": "2026-09-21",
  "title": "资金类弹层的结果反馈：划转、发送、提现、充值三步实施",
  "kind": "task",
  "status": "verified",
  "topics": [
    "market-recovery",
    "docs-governance"
  ],
  "summary": "按 docs/funds-dialog-outcome-plan.md 实施三步。划转与发送保持打开到请求结束、随后关闭、结果走通知，发送失败保留内存草稿，外部钱包等待签名时显示 Confirm in wallet。提现请求结束后关闭，成功、失败走通知，状态未知为常驻警告。充值新增页面级 CCTP 跟踪通知器，弹层的成功、失败、状态未知状态页改为通知，广播前失败回到表单重试。偏差：没有新建持久化的待处理提现列表。既有守卫测试拦下一处缺陷：旧请求的失败被当成当前结果上报并关闭弹层，已改为按尝试的对象身份判断。未做真实钱包验收。",
  "thread": null,
  "baseCommit": "951125e0",
  "commits": [
    "11efedc4",
    "d050a219",
    "40e31ea6",
    "0cf6d20b"
  ],
  "sources": [
    { "path": "docs/funds-dialog-outcome-plan.md" },
    { "path": "apps/terminal/src/components/trade/positions/transfer-modal.tsx" },
    { "path": "apps/terminal/src/components/trade/positions/send-modal.tsx" },
    { "path": "apps/terminal/src/stores/use-send-draft-store.ts" },
    { "path": "apps/terminal/src/components/trade/tradebox/deposit-modal.tsx" },
    { "path": "apps/terminal/src/components/trade/tradebox/cctp-deposit-tracking-notifier.tsx" },
    { "path": "apps/terminal/src/components/trade/tradebox/deposit-explorer-link.tsx" },
    { "path": "apps/terminal/src/providers/client-root.tsx" },
    { "path": "apps/terminal/src/hooks/trade/use-cctp-deposit-tracking.ts" },
    { "path": "apps/terminal/src/lib/tests/funds-action-balances.test.tsx" },
    { "path": "apps/terminal/src/lib/tests/deposit-modal-withdrawal-routing-guard.test.tsx" },
    { "path": "apps/terminal/src/lib/tests/cctp-deposit-tracking-notifier.test.tsx" },
    { "path": "docs/confirmation-surfaces.md" }
  ],
  "supersedes": []
}
-->
# 资金类弹层的结果反馈：划转、发送、提现、充值三步实施

## 背景与范围

同步记录，接续 `2026-09-21-funds-dialog-official-practice.md`（官方前端包取证与方案）。产品负责人对方案的答复是「要做第 2、3 步」，对 D1（失败后弹层去留）与 D2（是否显示 `Confirm in wallet`）没有单独表态，按方案表里的建议执行。分支 `fix/market-close-confirmed-size`（工作树 worktree-05），未推送。

## 结论与依据

做法、与官方的对照和偏差的完整说明在 `docs/funds-dialog-outcome-plan.md` 的「实施记录」，这里只记要点与过程中的发现。

- **第一步（`11efedc4`）划转、发送。** 弹层保持打开并禁用到请求结束，随后无论成败都关闭，结果走通知。发送失败把草稿存进内存 store（按「环境:所有者」隔离，不持久化），重新打开即恢复，成功即清空。外部钱包等待签名时按钮显示 `Confirm in wallet`，内嵌钱包保持静态名称；判断依据是 `useWalletSession().walletIntent`。`funds-action-balances` 里守卫相关的断言一条未动，只改写了「错误留在弹层内、随语言重译」这一半：改为在失败发生前切换语言，断言通知用的是稳定代码对应的当前语言文案。
- **第二步（`d050a219`）提现。** 结果在 `handleWithdrawSubmit` 内按 mutation 的实际结局上报，不再从 mutation 状态派生状态页；成功通知带净到账、手续费与到账说明，状态未知为常驻警告。提交前的预检失败仍留在表单内。
- **第三步（`40e31ea6`）充值。** 新增页面级 `CctpDepositTrackingNotifier`；弹层的成功、失败、状态未知状态页改为通知，等待钱包、等待链上确认与重新打开时的「转发中」页保留。

**过程中由既有测试拦下的缺陷。** 提现结果上报最初只比较上下文标识字符串。用户在请求途中切到充值页签再切回来，标识字符串会恢复成同一个值，旧请求的守卫拒绝于是被当成当前结果上报并调用 `handleClose()`，连带作废第二个合法请求（它再也到不了 SDK）。`does not let a same-amount replacement review revive the old request` 变红后定位到这一点，改为同时要求 `withdrawalPreflightRef.current === attempt`。原实现一直用对象身份做这类判断，是我新增的上报逻辑没有沿用。

**复核后对方案的修正。** 方案第二步原计划扩展 `funds-action-marker` 给提现并加账户面板入口。读实现后放弃：该标记是为金库与质押设计的歧义锁，签名前要抓取历史与状态基线，存在未核销标记时会锁住后续资金动作；而原先提现的「状态未知」页只是组件状态，刷新即失，本来就不是持久恢复入口。因此这一轮没有新建持久化的待处理提现列表，常驻警告通知指向交易所自己的划转记录。

另一处发现：默认通知时长只有 3 秒（`TOAST_DEFAULT_DURATION_MS`），不够读完带费用的提现结果，新增 `FUNDS_OUTCOME_TOAST_DURATION_MS = 10_000` 用于资金结果通知。

## 验证与限制

均为 2026-09-21 在本机对本分支执行。

- 针对性测试：`funds-action-balances` 70 项、`deposit-modal-withdrawal-routing-guard` 94 项、`cctp-deposit-tracking-notifier` 7 项、`deposit-form-routing` 等充值相关套件全部通过。
- 变异检查：把提现上报的条件改回只比较上下文标识，`does not let a same-amount replacement review revive the old request` 两项变红；还原后文件逐字节一致（`cmp`）。第一次变异因格式化后的文本不匹配而没有生效，当次结果作废后重做。
- 全量：`pnpm --filter @gatu/terminal typecheck` 通过。`pnpm --filter @gatu/terminal test` 在加入通知器后的首次运行有 2 个文件失败：`client-root-theme-lifecycle` 没有为新挂载的通知器提供替身（本次改动引起，已补），`client-bootstrap-error` 的 1 项超时（此前多次记录过的负载相关用例）。补替身后两个文件单独运行 5 项通过。随后对最终工作树再跑一次：`pnpm --filter @gatu/terminal typecheck` 通过；`pnpm --filter @gatu/terminal test` 590 文件通过、1 跳过，6,703 项通过、1 跳过。
- 生产构建（临时工作树 `wt05-build`，基于 `d050a219` 加未提交改动，Node 22.15.0，`pnpm install --frozen-lockfile`，两个移动配对开关关闭，用后已删除）：`pnpm --filter @gatu/terminal build` 退出码 0；411 个客户端 chunk 无循环静态依赖；包体预算通过；`trade-terminal-page` 126,021 B gzip。通知器静态挂在 `client-root`，它依赖的跟踪模块本来就随自动充值桥进入启动闭包：静态启动资源从 98 个增到 99 个，启动闭包约增 1.4 KB gzip，运行时启动增量相对基线为移动端 +3,833 B、桌面端 +5,542 B（上一轮为 +3,826 B、+5,480 B），均在预算内。
- 限制：没有在真实页面或真实钱包上验证任何一步；没有执行任何划转、发送、提现或充值。钱包弹窗、签名拒绝、链上确认与 Circle 转发的真实时序只能靠人工在测试网验收，清单见方案文档「验证标准」。内嵌钱包自动充值的通知逻辑未改动，也未复核它与新通知器同时存在时的观感。

## 后续与替代关系

- 不替代任何记录。
- 待产品负责人决定：是否需要持久化的待处理提现列表与账户面板入口（需单独设计）；D1、D2 如不认可当前取值可以单独回退，两者互不依赖。
- 下一次先查：`docs/funds-dialog-outcome-plan.md`「实施记录」、`funds-action-balances.test.tsx`、`deposit-modal-withdrawal-routing-guard.test.tsx`。
