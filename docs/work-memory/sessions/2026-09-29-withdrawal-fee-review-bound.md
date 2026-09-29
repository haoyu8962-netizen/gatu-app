<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-29-withdrawal-fee-review-bound",
  "date": "2026-09-29",
  "title": "提现路径手续费以表单显示值为界：点击时不等即留在表单内",
  "kind": "task",
  "status": "verified",
  "topics": ["account-funding"],
  "summary": "修复 2026-09-29 提现通知任务发现的缺口：表单显示 CCTP 转发手续费后，点击时重新读取的值被直接使用，没有与显示值比较（显示 1、点击时 2，仍按 10 发出、通知说到账 $8.00）。现在点击时的读取与 SDK 签名边界的读取共用 assertWithdrawalRouteFeeMatchesReview，必须与表单显示值精确相等，更高、更低都拒绝；点击时不等则不发交易所请求、以 withdrawal-fee-changed 留在表单内供复核重提。新回归渲染真实弹窗与提交路径，旧代码下两个方向都调用了 SDK。签名动作不带手续费字段，这个界约束不了签名后实际扣除的手续费；表单打开期间手续费变化仍不另外提示（确认面第 4 条未做）。未做真实钱包验收。",
  "thread": null,
  "baseCommit": "b67229f2",
  "commits": [],
  "sources": [
    { "path": "apps/terminal/src/components/trade/tradebox/deposit-modal.tsx" },
    { "path": "apps/terminal/src/lib/trade/withdrawal.ts" },
    { "path": "apps/terminal/src/lib/tests/deposit-modal-withdrawal-routing-guard.test.tsx" },
    { "path": "apps/terminal/src/lib/tests/withdrawal.test.ts" },
    { "path": "docs/withdrawals.md" },
    { "path": "docs/confirmation-surfaces.md" },
    { "path": "docs/funds-dialog-outcome-plan.md" },
    { "path": "docs/work-memory/sessions/2026-09-29-withdraw-toast-copy.md" },
    { "path": "CHANGELOG.md" }
  ],
  "supersedes": []
}
-->
# 提现路径手续费以表单显示值为界：点击时不等即留在表单内

## 背景与范围

同步记录，没有取得可核对的会话 ID。用户给出的前提来自[提现通知精简任务](2026-09-29-withdraw-toast-copy.md)的核实结论：表单用 `getWithdrawalRouteFee(withdrawalRoute, cctpFeeQuery.data)` 显示手续费与预计到账，`handleWithdrawSubmit` 在点击后 `cctpFeeQuery.refetch()` 并直接使用新值（`freshRouteFee`）做校验与提交，从不与显示值比较；`assertFreshCctpWithdrawalFee` 只比较「点击时读取」与「SDK 签名边界读取」。这与[确认面契约](../../confirmation-surfaces.md)第 3 条「执行不能超出用户点击时所见」冲突。

工作在 `.claude/worktrees/peaceful-hellman-769c0f`，分支 `claude/withdrawal-fee-review-bound`，基线 `b67229f2`（`claude/withdraw-toast-copy` 的末端，尚未进入 `dev`）。选这个基线是因为任务要更正的 `docs/withdrawals.md`「currently used as is」一句和通知精简只存在于该分支；`origin/dev` 上没有。依赖在 worktree 内用 `pnpm install --frozen-lockfile --prefer-offline` 补装。范围只含提现的路径手续费比较、对应测试与文档；激活费、路径、账户模式、地区等其他守卫不变，没有新增翻译文案（沿用已有的 `withdrawal-fee-changed`）。

开工时另一个 worktree（`.claude/worktrees/withdraw-toast-copy`）里有其他会话未提交的改动，其中 `deposit-modal.tsx` 约 17 行、`deposit-modal-withdrawal-routing-guard.test.tsx` 2 行；本任务没有读取或改动它们，合并时可能需要处理冲突。

## 结论与依据

- **传入审阅值。** `handleWithdrawSubmit` 在开头把本次渲染的 `withdrawalRouteFee` 记为 `reviewedRouteFee`（与已有的 `reviewedAmount` 同一做法，按钮点击发生在这一次渲染上）。点击时读取到新手续费后，调用 `assertWithdrawalRouteFeeMatchesReview(reviewedRouteFee, freshRouteFee)`；不等时抛出 `withdrawal-fee-changed`，由原有 `catch` 在尚未发起交易所请求时写入表单内的预检反馈。
- **两处边界一个规则。** 新函数放在 `lib/trade/withdrawal.ts`：两个值都要能解析为非负小数，否则 `withdrawal-fee-unavailable`；数值不等则 `withdrawal-fee-changed`。`assertFreshCctpWithdrawalFee` 改为调用同一个函数，行为不变（原来用 `toBig`，现在拒绝负数手续费，这种值不会由合约返回）。
- **更低也拒绝。** 决定按精确相等，而不是「新值 ≤ 显示值」。理由：签名边界与激活费（`assertPreTransferCheckMatchesReview`）、CCTP 充值的 `maxFeeRaw` 比较都已是精确相等；精确相等让成功通知里的到账金额等于点击时表单的估算；放行更低手续费需要第二条规则，而代价只是手续费罕见变化时多点一次。
- **留在表单内。** 点击时不等：弹窗不关、金额草稿保留，表单随查询缓存显示新手续费和 `Circle fees changed before submission. Review the updated fee and retry.`，提交按钮保持可用（`WithdrawForm` 只按 `canSubmit`、`isPending`、`prerequisitesPending` 禁用）。签名边界不等：请求已经开始，照原有规则关闭并发错误通知。
- **界的边界。** 签名的 `sendToEvmWithData` 参数里没有手续费或最低到账字段（`buildCctpWithdrawalParameters`），所以两次比较约束的是用户据以提交的手续费，约束不了签名之后合约实际扣除的手续费。文档如实写明。

未采用：只拒绝更高的手续费（见上）；在表单打开期间手续费变化时额外显示「对象已变化」提示（契约第 4 条）——超出本任务范围，记为后续。

## 验证与限制

版本：基线 `b67229f2` 加本任务改动；2026-09-29，本地 macOS，Node v24.15.0，worktree 内新装依赖。

- 新回归 `keeps the form open without signing when the click-time CCTP fee is higher/lower than the displayed fee`（`deposit-modal-withdrawal-routing-guard.test.tsx`）：提现 10、可提 100，从表单的 `data-route-fee` 读到显示值后点击，点击时读取返回另一个值并同步更新模拟的查询数据。断言：不调用 SDK、不进入 `mutateAsync`、手续费只读取一次、表单内显示 `withdrawal-fee-changed` 文案、没有通知、弹窗未关、金额仍为 10、表单显示新手续费；再次点击后 SDK 恰好一次（`amount: "10"`），通知为 `You'll receive $8.00`（显示 1→2）或 `$9.00`（显示 2→1）。在改提交路径之前运行，两个方向都失败：`sendToEvmWithData` 已以 `amount: "10"` 被调用一次。
- `withdrawal.test.ts` 新增函数单测：`0.2` 与 `0.200000` 相等；`0.200001`、`0.199999` 为 changed；缺失、`null`、负数、非数字为 unavailable。
- 变异检查（检查后已还原）：把比较改为只拒绝更高（`current.gt(reviewed)`），新回归的 lower 用例与函数单测失败；删掉点击时的比较，新回归两个用例都失败。
- AGENTS.md「Confirmation surfaces」测试组外加 `withdrawal.test.ts`、`withdraw-form-ui.test.tsx`：第一次 52 个文件中 1 个失败——`staking-view.test.tsx` 的 `reports a verified staking operation once …` 在整组并行下超时（6,970 ms > 5,000 ms），该文件单独运行 13 项通过，与本改动无依赖；Biome 格式修正后第二次整组运行 52 个文件 1,085 项全部通过。
- `pnpm exec biome check` 改动的 4 个 TypeScript 文件：第一次报 `withdrawal.ts` 函数签名需换行，`biome format --write` 后通过。
- `pnpm --filter @gatu/terminal typecheck` 退出码 0；`./node_modules/.bin/tsc -p apps/terminal/tsconfig.json --noEmit`（5.7.2）退出码 0。本 worktree 的应用内 `tsc` 也是 5.7.2，没有主检出里那个残留 5.9.3 的问题。
- 未做：真实钱包提现（手续费变化无法在测试网按需触发）、浏览器与真机、全量单测与生产构建。测试里 `WithdrawForm`、`@gatu/ui` 外壳、`useExchange` 与数据 hook 是替身；`useExchange` 替身按真实顺序调用组件自己的执行守卫，但不证明真实 SDK、签名或网络时序。

## 后续与替代关系

- 关闭了[提现通知精简任务](2026-09-29-withdraw-toast-copy.md)「后续」里的待办；`docs/withdrawals.md` 的「currently used as is」已更正，`docs/funds-dialog-outcome-plan.md` 以追加段落更正「目前不会中止」，原句保留。该记录本身不被替代。
- 未做：表单打开期间手续费变化的可见提示（确认面第 4 条）；发送、划转、充值的展示 → 承诺核对。
- 分支未推送。它叠在尚未合入 `dev` 的 `claude/withdraw-toast-copy` 之上，开 PR 前要先确定那条分支的去向，并与另一会话在 `deposit-modal.tsx` 上的未提交改动合并。
