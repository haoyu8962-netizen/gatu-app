<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-29-withdrawal-fee-review-bound",
  "date": "2026-09-29",
  "title": "提现 CCTP 手续费不设门禁：用点击时读到的手续费提交",
  "kind": "task",
  "status": "verified",
  "topics": ["account-funding"],
  "summary": "起因是提现通知任务发现：表单显示 CCTP 转发手续费后，点击时重新读取的值直接使用、不与显示值比较。本任务先按确认面契约加了「必须与显示值精确相等」的门禁（2310f26b），随后核对 Circle、Hyperliquid、SDK 文档与 CoreDepositWallet 合约源码，产品负责人决定不设门禁。最终：点击时读到的手续费直接用于提交与成功通知，不与显示值比较，SDK 签名边界也不再重读（原先两次读取不相等时会关闭弹窗报错）；只有读不到手续费或金额低于按最新手续费计算的最低值时留在表单内。已登记为确认面第 3 条的有意例外。依据：手续费是合约 owner 配置的固定值（主网实测 0.2 USDC），签名动作不带手续费字段、合约执行时才计算。未做真实钱包验收。",
  "thread": null,
  "baseCommit": "b67229f2",
  "commits": ["2310f26b"],
  "sources": [
    { "path": "apps/terminal/src/components/trade/tradebox/deposit-modal.tsx" },
    { "path": "apps/terminal/src/lib/trade/funds-action-feedback.ts" },
    { "path": "apps/terminal/src/lib/tests/deposit-modal-withdrawal-routing-guard.test.tsx" },
    { "path": "docs/withdrawals.md" },
    { "path": "docs/confirmation-surfaces.md" },
    { "path": "docs/funds-dialog-outcome-plan.md" },
    { "path": "docs/work-memory/sessions/2026-09-29-withdraw-toast-copy.md" },
    { "path": "CHANGELOG.md" },
    { "url": "https://developers.circle.com/cctp/howtos/withdraw-usdc-from-hypercore-to-evm" },
    { "url": "https://developers.circle.com/cctp/concepts/forwarding-service" },
    { "url": "https://developers.circle.com/cctp/concepts/fees" },
    { "url": "https://github.com/circlefin/hyperevm-circle-contracts/blob/master/src/CoreDepositWallet.sol" }
  ],
  "supersedes": []
}
-->
# 提现 CCTP 手续费不设门禁：用点击时读到的手续费提交

## 背景与范围

同步记录，没有取得可核对的会话 ID。起因是[提现通知精简任务](2026-09-29-withdraw-toast-copy.md)发现的缺口：表单用 `cctpFeeQuery.data` 显示手续费和预计到账，`handleWithdrawSubmit` 在点击后重新读取手续费并直接使用，不与显示值比较；另有一次签名边界的重读（`assertFreshCctpWithdrawalFee`），与点击时读到的值不等就关闭弹窗、发错误通知。

工作在 `.claude/worktrees/peaceful-hellman-769c0f`，分支 `claude/withdrawal-fee-review-bound`，基线 `b67229f2`（`claude/withdraw-toast-copy` 的末端，尚未进入 `dev`，要更正的文档句子只存在于该分支）。依赖在 worktree 内用 `pnpm install --frozen-lockfile --prefer-offline` 补装。开工时另一个 worktree（`.claude/worktrees/withdraw-toast-copy`）里有其他会话未提交的改动，涉及 `deposit-modal.tsx` 约 17 行和守卫测试 2 行，本任务没有读取或改动，合并时可能冲突。

## 结论与依据

### 过程与决策

1. **先加门禁（`2310f26b`，已被本记录的第二个提交撤销）。** 按 [确认面契约](../../confirmation-surfaces.md) 第 3 条，把点击那次渲染显示的手续费作为审阅值，点击时与签名边界两次读取都必须与它精确相等，更高、更低都拒绝；点击时不等则以 `withdrawal-fee-changed` 留在表单内。新测试在改动前的代码上失败（显示 1、点击时 2，SDK 以 `amount: "10"` 被调用一次）。
2. **核对官方文档。** 用户问这是否符合实践，于是核对了以下来源（摘录与下载文件在会话 scratchpad，未入库）：
   - Circle「Withdraw USDC from HyperCore to EVM chains」：只要求从 `CoreDepositWallet` 查询手续费（初始到 Arbitrum 0.2 USDC）、金额大于手续费（否则 HyperEVM 交易回滚），**没有**关于展示后、提交前手续费变化的指南。
   - Circle「Forwarding Service」：HyperCore 提款到 Arbitrum 等链的服务费 $0.20，多出的 gas 预算不退。
   - Circle「CCTP fees」：通用做法是不写死费用，并在自己发起的销毁交易里设 `maxFee`，留 10–20% 余量，由链上约束；签名报价（upfront fee quotes）约 2 分钟过期。HyperCore 提款的签名动作没有这类字段。
   - Hyperliquid 文档：CCTP 是首选、旧桥已弃用，实现指向 Circle 合约仓库；没有 `sendToEvmWithData` 的专门说明。SDK 文档只有参数结构。
   - `CoreDepositWallet.sol`：手续费 = `cctpMaxFee` + 按目标链的转发费，只能由 owner 修改，修改时发事件；`coreReceiveWithData` 在执行时计算费用并要求金额大于它。
   - 实测（2026-09-29）：`usdcRouting` 返回提款走 `cctp`；主网合约（区块 47189162）`calculateCrossChainWithdrawalFee(true, 3)` = 0.2（`cctpMaxFee` 0、默认转发费 0.2、Arbitrum 无覆盖值）；Circle 费率 API 中 HyperEVM→Arbitrum 的 `minimumFee` 为 0，所以「到账 = 金额 − 0.2」没有漏费。
3. **产品负责人决定不设门禁（不加「大幅上涨才停」的折中）。** 理由：手续费是 owner 配置的固定值，变动罕见且只有几分钱；签名动作不带手续费字段、合约执行时才计算，前端比较约束不了实际扣费；拦下只会让用户多点一次。唯一需要停下的是金额低于按最新手续费计算的最低值，而这个检查本来就在。

### 最终实现

- 点击时：重新读取手续费；读不到则 `withdrawal-fee-unavailable`，按最新手续费校验金额不通过则 `withdrawal-conditions-changed`，两种都留在表单内。否则直接用最新手续费提交，成功通知按它计算到账金额。这与 `b67229f2` 的点击时行为相同。
- 签名边界：删除 `assertFreshCctpWithdrawalFee` 及 `WithdrawalExecutionReview.routeFee`，不再重读手续费。路径、账户模式、地区、激活费与余额守卫不变；激活费仍在两处要求与审阅值相等。
- 删除 `2310f26b` 加入的 `assertWithdrawalRouteFeeMatchesReview` 及其单测，以及不再使用的 `withdrawal-fee-changed` 错误码。同一句文案仍被存款流程（`use-deposit.ts`）使用，翻译目录不受影响。
- 文档：`docs/withdrawals.md`（CCTP route 与 Request and completion semantics，新增 Circle Forwarding Service 与合约源码两条参考）、`docs/confirmation-surfaces.md` 例外表登记为第 3 条的有意例外、`docs/funds-dialog-outcome-plan.md` 追加段落改写为最终决定、`CHANGELOG.md` 删去上午的 Fixed 条目，改为 Changed 条目。

## 验证与限制

版本：基线 `b67229f2` 加本任务两个提交的改动；2026-09-29，本地 macOS，Node v24.15.0，worktree 内新装依赖。

- 新回归（`deposit-modal-withdrawal-routing-guard.test.tsx`）：
  - 显示 1、点击时 2，或显示 2、点击时 1：SDK 恰好一次（`amount: "10"`），手续费只读一次，通知为 `$8.00` / `$9.00`，无错误通知，弹窗关闭。
  - 点击时手续费 6（最低 12 大于金额 10）：不调用 SDK，留在表单内显示 `withdrawal-conditions-changed` 文案，金额保留，提交按钮禁用，无通知。
  - 反向检查：换成 `2310f26b` 的源码，这 3 项失败；换成 `b67229f2` 的源码，前 2 项失败（签名边界多读一次手续费），第 3 项通过（这是原有行为）。检查后源码已还原。
- 原先依赖签名边界比较手续费的 2 个测试已删除；「按当前语言格式化守卫拒绝」一项改用激活费变化触发。
- AGENTS.md「Confirmation surfaces」测试组外加 `withdrawal.test.ts`、`withdraw-form-ui.test.tsx`：52 个文件 1,083 项全部通过。门禁版本在同一组合下的记录：第一次整组有 1 项 `staking-view` 在负载下超时（6,970 ms > 5,000 ms，单独运行 13 项通过），第二次 52 个文件 1,085 项通过。
- `pnpm exec biome check` 改动的 5 个 TypeScript 文件通过（测试文件先经 `biome format --write` 修正一处换行）。`pnpm --filter @gatu/terminal typecheck` 与 `./node_modules/.bin/tsc -p apps/terminal/tsconfig.json --noEmit`（5.7.2）退出码均为 0。
- 未做：真实钱包提现、浏览器与真机、全量单测与生产构建；没有查询合约手续费的历史修改事件；没有核实官方 Hyperliquid 终端点击时是否重新核对手续费。测试里 `WithdrawForm`、`@gatu/ui` 外壳、`useExchange` 与数据 hook 是替身，不证明真实 SDK、签名或网络时序。

## 后续与替代关系

- 关闭了[提现通知精简任务](2026-09-29-withdraw-toast-copy.md)「后续」里的待办：点击前后手续费不一致不中止，这是有意的行为，文档已写明。该记录本身不被替代。
- 未做：发送、划转、充值的展示 → 承诺核对。
- 分支未推送，叠在尚未合入 `dev` 的 `claude/withdraw-toast-copy` 之上；开 PR 前要先确定那条分支的去向，并与另一会话在 `deposit-modal.tsx` 上的未提交改动合并。
