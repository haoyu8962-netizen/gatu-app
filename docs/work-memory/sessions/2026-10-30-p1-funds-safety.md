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

同步记录，未取得任务标识。全功能审查（`2026-10-30-full-feature-audit`，在 `claude/p1-order-safety` 分支上）第一批的第二组：D1、D2、B4/D4。分支 `claude/p1-funds-safety`，基于 `dev` `d99c2bc9`；与第一组（`claude/p1-order-safety`）互不依赖。

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

## Codex 推送前审查与修复

- 只读审查（`gpt-6-astra`，low，约 11.2 万 token）审 `b617f844`：3 项 P1、1 项 P2，评分 6.5。逐条核对后都成立，已修：
  - **预检未返回时可改草稿，迟到的放行结果仍提交点击时的旧草稿。** 预检期间锁定目的地、账户、资产与金额（`draftLocked`）；答复返回后核对签名身份对象与当前草稿（`draftRef`）都与点击时相同，否则丢弃答复、不发送也不提示。
  - **确认步骤未绑定账户。** 确认记录预检时的身份对象与身份键：渲染时身份键不同即不显示确认步骤，身份键变化时清掉确认与勾选（切回原账户也不会恢复），确认点击时再比较身份对象。
  - **Swap 与 Reverse 的地区检查不在 SDK 边界。** Swap 的执行状态带上实时 `tradeRestricted` 与 `actionsBlocked`，执行守卫按受限或未核验拒绝，并映射为「Trading is not available in your region」或「Unable to verify regional availability…」；Reverse 的执行守卫在阶段检查后先调用 `assertTradingRegionAllowed`。
  - **测试没钉住确认展示值等于提交值。** 新增用例读确认步骤显示的金额与代币，与 `spotSend` 收到的参数比较。
- 新增用例另覆盖：预检挂起期间输入被锁、期间换账户后答复被丢弃；确认步骤在换账户再切回后仍被丢弃；Swap 与 Reverse 在第一次执行守卫后地区变为受限或未核验时，第二次守卫拒绝且不下单。Swap 与 Reverse 测试的地区桩改为 `useSyncExternalStore`，因为经 React Compiler 编译的组件在同属性重渲染时不会重跑普通桩 hook。
- 变异：Reverse 守卫去掉地区检查、Swap 守卫去掉地区检查、Send 去掉答复后的身份与草稿核对、去掉身份变化时的确认清除、金额输入不在预检期间锁定、确认步骤显示另一个金额，各自让对应新测试失败，均已还原。
- 第二轮只读窄审（`4aaa1222`，范围 `b617f844 → 4aaa1222`）：原 3 项 P1 已修，评分 8.5；剩 1 项 P2，另有 2 项「无法确认」。都已处理：
  - **P2：金额一致性测试绕过了执行守卫。** 该用例改为开启守卫执行模式（执行守卫、前置守卫、SDK 前等待、再次执行守卫），并断言恰好发送一次。另配一条用例：已确认的发送停在 SDK 前等待时换账户，结果零发送。
  - **只换 Provider 生命周期对象时确认不清除。** 确认与勾选的清除并入登记身份的 effect 的清理函数，依赖为生命周期对象和身份键，不再只看身份键。新用例在 `4aaa1222` 的代码上失败，修复后通过。
  - **Reverse 只测了「受限」。** SDK 边界用例改为「受限」「未核验」两种参数。
- 第二轮变异：Send 执行守卫无条件拒绝、Send 执行守卫放行一切、Reverse 去掉未核验分支、身份变化时不清除确认，各自让对应新测试失败，均已还原。
- 全量（测试工作树）：第一轮修复 `4aaa1222` 9308 通过；第二轮修复 `0144c66f` 9311 通过；各 1 失败为沙箱内已知的 `vite-development-cache`（EPERM）。第三轮只读窄审（范围 `4aaa1222 → 0144c66f`）：上一轮的 P2 与两项「无法确认」都已处理，未发现新问题，评分 9.0；审查方注明 StrictMode、卸载与同次提交的时序是源码推演，测试替换了 `useExchange` 与 SDK 边缘，不证明真实钱包签名或链上发送。

## 按官方实践处理的待定事项

运营方授权按官方实践决定后（决定表见 `claude/p1-order-safety` 分支审查记录「2026-10-30 按官方实践处理的待定事项」），本分支的两项都不改代码，只写进 `runtime-guardrails.md` §2：

- **发送 Max 不预留激活费。** 官方的 Max 是可提余额向下取整到 2 位（现货按代币精度），不预留费用；有费用或对方从未发过交易时弹出确认，与 D1 的确认步骤一致。
- **本终端自己的地区检查不拦退出动作。** 核对代码后确认现状：`useGeoRestriction` 只拦新开仓、兑换、反手与资金动作，平仓、TP/SL、撤单、逐仓保证金调整照常；交易所 `legalCheck` 返回 `restrictions: "a"` 时 `canPerformActions` 为假，所有签名动作都会被拦。官方在自己的 IP 检查受限或仍在检查时隐藏平仓列、撤单列和下单表单。没有照搬：自己的检查若误判或查询失败，仓位就无法平掉；交易所自己的限制仍然拦住一切；交易所退出某地区时通常保留只能平仓的模式（这一条是一般行业做法，本次没有逐家核对）。

## PR #124 的 CI 浏览器回归（2026-10-31）

推送后 #124 的两个浏览器回归分片都失败，23 项全在 `position-close-all.pw.ts`：按钮 `element(s) not found`，「全部平仓」区块没有渲染出来。原因：本分支让 `PositionsTab` 与 `MobilePositionsTab` 调用 `useGeoRestriction()`（反手的地区闸门），真实钩子内部用 `useQuery`，而这个浏览器夹具既没有 QueryClient，也没有替身，组件渲染即报错。推送前只跑了 `account-actions` 浏览器套件，`position-close-all` 没跑。修复 `21ca05c5`：与 `account-actions`、`mobile-trade-all-orders`、`top-nav-connected` 夹具一样，在 `position-close-all.vite.config.ts` 把 `@/hooks/use-geo-restriction` 指向夹具模块，替身返回已判定、不受限的地区。本地（沙箱外）`position-close-all.playwright.config.ts` 46 项通过。

## 后续与替代关系

- 受限地区的只减仓动作、发送 Max 是否预留激活费：已按官方实践决定（见下文「按官方实践处理的待定事项」）。
- 发送确认步骤的 320px 换行没有用浏览器布局套件核对。
