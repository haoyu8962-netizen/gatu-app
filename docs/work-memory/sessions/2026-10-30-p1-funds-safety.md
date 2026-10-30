<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-30-p1-funds-safety",
  "date": "2026-10-30",
  "title": "第一批 P1 资金安全：发送前预检与激活费确认、邮箱提现地址校验、发送兑换反手接入地区闸门",
  "kind": "task",
  "status": "recorded",
  "topics": ["account-funding", "pr-review"],
  "summary": "全功能审查第一批的第二组（D1、D2、B4/D4）。D1：发送前调用 preTransferCheck，被制裁地址拒绝；有激活费或目的地址从未发过交易时在同一弹窗进入确认步骤，披露费用与丢失风险，必须勾选后静态的 Send / Send with Fee 才可用；请求失败或答复异常不发送。D2：邮箱提现拒绝本人地址与两个网络的 USDC 合约地址，表单与提交时都检查。B4/D4：发送改用与提款相同的资金动作可用性（含地区）并在执行前复核地区；兑换与反手跟随交易地区闸门，反手在资产锁内复核。平仓类动作不变，待运营方决定。全量单测与 account-actions 浏览器套件结果见正文。未推送。",
  "thread": null,
  "baseCommit": "d99c2bc9",
  "commits": [],
  "sources": [
    {"path": "apps/terminal/src/components/trade/positions/send-modal.tsx"},
    {"path": "apps/terminal/src/domain/trade/send-destination.ts"},
    {"path": "apps/terminal/src/domain/trade/withdraw-destination.ts"},
    {"path": "apps/terminal/src/components/trade/tradebox/deposit-modal.tsx"},
    {"path": "apps/terminal/src/components/trade/positions/balances-tab.tsx"},
    {"path": "apps/terminal/src/components/trade/components/spot-swap-modal.tsx"},
    {"path": "apps/terminal/src/hooks/trade/use-position-reverse-submit.ts"},
    {"path": "docs/runtime-guardrails.md"},
    {"url": "https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/activation-gas-fee"}
  ],
  "supersedes": []
}
-->
# 第一批 P1 资金安全：发送预检、提现地址与地区闸门

## 背景与范围

同步记录，未取得任务标识。[全功能审查](2026-10-30-full-feature-audit.md)第一批的第二组：D1、D2、B4/D4。分支 `claude/p1-funds-safety`，基于 `dev` `d99c2bc9`；与第一组（`claude/p1-order-safety`）互不依赖。

## 结论与依据

- **D1 发送前预检。** 官方前端包（2026-10-30 抓取）：发送时调用 `preTransferCheck`（`t6`），`isSanctioned` 时报 `Unable to send funds to this address`；`fee !== 0` 或 `userHasSentTx === false` 时弹出确认层 `r1`：有费用时显示 `USD Transfer Fee` 与 `This transfer will incur a fee of {amount} {feeToken}`，目的地址从未发过交易时附 `usd.transfer.warning`，必须勾选 `send.warning.understood` 才能点 `Transfer with Fee` / `Send`；预检请求失败报 `Unexpected error checking if destination is allowed`。[官方文档](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/activation-gas-fee)：新账户作为目的地址的第一笔交易收 1 个报价币的费用，与所转资产无关。本终端按同一流程实现，确认步骤在同一弹窗内（静态按钮名，Back 返回表单），预检答复由 `getSendDestinationVerdict` 校验形状，异常一律不发送。Max 不预留激活费（与官方相同）。
- **D2 邮箱提现地址。** 官方 `AcrossWithdrawModal` 有 `withdraw.to.yourself.not.allowed` 与 `cannot.withdraw.to.usdc.contract` 两条拒绝。本终端的邮箱提现填写 Arbitrum 目的地址，提到自己地址会被 ADR 0040 的自动存款存回，提到 USDC 合约地址资金丢失；`getWithdrawDestinationIssue` 对本人地址（钱包与内嵌钱包地址）和两个网络的原生 USDC 合约拒绝，表单显示原因并禁用提交，提交入口再查一次。
- **B4/D4 地区闸门。** 发送此前只看余额与账户模式；现在余额表与弹窗都用 `useFundsActionAvailability` 的提款可用性（含地区），执行前守卫调用 `assertFreshGeoAllowed`。兑换下的是现货单、反手开反向仓位，跟随下单面板的 `useGeoRestriction().actionsBlocked`：余额表隐藏 Swap，兑换弹窗禁用并说明，持仓行（桌面与手机）禁用 Reverse，反手提交在资产锁内两次复核（地区未确认时用已有的「Unable to verify regional availability. Trading is temporarily unavailable.」）。平仓、限价平仓、TP/SL、逐仓保证金不变：是否允许受限地区只减仓仍待运营方决定（审查记录「需要运营方决定」第 5 项）。

## 验证与限制

- 新增与更新的测试：`funds-destination-rules.test.ts`（预检判定与提现地址规则）；`funds-action-balances.test.tsx`（预检直接发送、确认步骤与勾选、Back、被制裁、预检失败与异常答复、发送执行前地区复核与拒绝）；`deposit-modal-withdrawal-routing-guard.test.tsx`（真实 `DepositModal` 拒绝本人与两个 USDC 合约地址）；`deposit-empty-balances-entry.test.tsx`（资金动作受限时不出现 Send，交易受限时不出现 Swap）；`spot-swap-modal.test.tsx`、`position-reverse-submit.test.tsx`、`position-market-close-entry.test.tsx`、`mobile-position-isolated-margin-entry.test.tsx`（兑换与反手受限）。地区查询模拟补到 `desktop-positions-readiness.test.tsx`；`balances-table-visual-contract.test.ts` 的发送按钮写法同步。
- 变异：撤掉预检、发送地区复核、提现地址校验、兑换与反手的地区判断、余额表发送与兑换的闸门、持仓行的 `reverseBlocked` 后，18 个新用例失败；已还原。
- 全量：`pnpm --filter @sairn/terminal test --maxWorkers=4`，688 个文件 9304 项中 9301 通过、1 跳过、2 失败：`balances-table-visual-contract`（源码契约钉住旧的发送按钮写法，已同步并单独重跑 4 项通过）与 `vite-development-cache`（沙箱禁止监听 5173 端口，沙箱外通过，与第一组相同）。
- `pnpm typecheck`、改动文件的 Biome 通过；新文案 8 条补齐六种语言，缺失数与改动前相同。
- 浏览器（沙箱外运行，需要监听端口）：`account-actions.playwright.config.ts` 36 项中 34 通过、2 项超时（1363px 下点击夹具的 `Toggle card funding` 与 `中文` 按钮等待「可见且稳定」超时，与本组改动的区域无关），单独重跑这 2 项通过（14.7 秒），判断为负载下的偶发。
- 未做：真实发送与提现、真机、受限地区的真实访问；Codex 推送前审查待做。

## 后续与替代关系

- 待运营方决定：受限地区是否允许只减仓类动作；发送 Max 是否预留激活费。
- 发送确认步骤的 320px 换行没有用浏览器布局套件核对。
