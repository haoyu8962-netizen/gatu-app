# Earn：借贷储备池页面

- 状态：已实施，2026-09-27；尚未发布，未做真实钱包验收。
- 决策与取舍：[ADR 0020](adr/0020-earn-borrow-lend-page.md)。关联：[确认面契约](confirmation-surfaces.md)、[资金类弹层的结果反馈](funds-dialog-outcome-plan.md)、[Runtime guardrails §11](runtime-guardrails.md#11-desktop-top-navigation)、[ADR 0013](adr/0013-desktop-navigation-collapse.md)。
- 代码：`apps/terminal/src/domain/earn.ts`、`domain/earn-submission.ts`、`hooks/earn/use-earn-data.ts`、`components/earn/`、`routes/earn.tsx`。

## 目标

`/earn` 对齐官方终端 `app.hyperliquid.xyz/earn`：在 HyperCore 借贷储备池里存入（Supply）、取出（Withdraw）、借入（Borrow）和偿还（Repay）。官方文档把它叫做 Earn（HLP 的说明写 HLP "supplies USDC in Earn"），与组合保证金、手动借款是同一套储备池。页面不汇总 HLP 金库或 HYPE 质押，这两者仍在 `/vaults` 与 `/staking`。

## 依据与核对方式

实现以三处来源为准，冲突时按项目契约取舍并写入 ADR 0020：

| 来源 | 用到的内容 |
| --- | --- |
| 官方文档（hyperliquid-docs MCP） | `borrowLendUserState`、`borrowLendReserveState`、`allBorrowLendReserveStates`、`userAbstraction` 的请求与返回；LTV、健康因子、部分清算阈值 `(1+LTV)/2`、利率模型、账户模式与组合保证金规则 |
| SDK `@nktkas/hyperliquid` 0.33.3（仓库锁定版本） | `borrowLend({ operation, token, amount })` 的参数校验（`amount` 为无符号小数字符串或 `null`）、L1 action 签名；`userBorrowLendInterest({ user, startTime, endTime? })`；账本 `borrowLend` 类型。该版本没有 `userBorrowLendInterest` 订阅 |
| 官方终端（2026-09-27 只读取证：页面脚本 `BorrowLendPage-*.js` 与 `config-*.js`、公开 info 接口） | 页面结构、文案、Max 规则、按钮禁用条件、清算价公式、Agent 签名、组合保证金下的行为、USDH 的显示规则、资产 ID |

取证只读取了公开脚本与公开接口，没有在官方终端提交任何操作。

## 数据

| 数据 | 来源 | 刷新 |
| --- | --- | --- |
| 储备池（利率、利用率、预言机价、LTV、全局存入/借出） | `allBorrowLendReserveStates` | 30 秒 |
| 用户仓位（每个资产的 `supply`/`borrow` 的 `basis` 与 `value`，`healthFactor`） | `borrowLendUserState` | 15 秒，提交前强制刷新 |
| 现货余额与维持后可用额 | 共享 `spotState` 订阅（`useDefaultDexBalances`） | 实时 |
| 资产名、`weiDecimals`、`szDecimals` | `spotMeta`（`useSpotTokens`） | 市场目录缓存 |
| 利息页签 | `userBorrowLendInterest`，最近 30 天（起点按小时对齐，保证查询键稳定） | 30 秒 |
| 操作历史页签 | 共享账本 `useAccountLedger` 中来源或去向为 Earn 的记录（`userNonFundingLedgerUpdates` 的 `borrowLend`） | 账本订阅 |

资产列表由储备池条目对照 `spotMeta` 生成，不写死 ID：主网为 USDC 0、HYPE 150、UBTC 197（显示 BTC）、USDT0 268（显示 USDT）、USDH 360；测试网的 HYPE 是 1105，还有其他条目。储备池里有、`spotMeta` 里找不到的资产会让整张快照不可用（失败关闭）。接口返回在 `parseEarnReserves` / `parseEarnUserState` / `parseEarnInterest` 里逐字段校验，格式不对按不可用处理。

## 计算（`domain/earn.ts`，全部 Big.js）

- **抵押品与计息资产。** `ltv > 0` 为抵押品（HYPE、BTC），存入不计息，表里利息列显示 N/A；`ltv = 0` 为计息资产（USDC、USDT、USDH），也是唯一可借的资产。
- **USDH。** 只有持有存入或借出时才出现在表里，也不出现在存入的资产选择里（官方同样处理）。
- **汇总。** 总存入 = Σ 存入 × 预言机价；LTV 加权存入 = Σ 存入 × 预言机价 × LTV；总借出 = Σ 借出 × 预言机价；可借额度 = max(0, LTV 加权存入 − 总借出)。
- **健康因子。** 直接显示接口的 `healthFactor`，上限 1000%；没有借款时显示 `--`。
- **已赚利息 / 应付利息。** `value − basis`。
- **清算价（标准账户）。** 阈值系数 Z(LTV)：LTV ≥ 0.5 时为 (1+LTV)/2，否则为 2·LTV/(1+LTV)。对资产 t：价 = (其他借款价值 − 其他资产阈值价值) / (存入ₜ × Z − 借入ₜ)，结果 ≤ 0 或高于当前预言机价时不显示。与官方文档的部分清算阈值（HYPE 82.5%、BTC 75%）一致。
- **清算价（组合保证金）。** 预言机价 × (1 − 维持后可用额 / 现货总额)。
- **Max。**

| 操作 | Max |
| --- | --- |
| 存入 | 现货可用余额（有维持后可用额时取它） |
| 取出计息资产 | 已存入 |
| 取出抵押品 | min(已存入, 可借额度 / (预言机价 × LTV)) |
| 借入 | 可借额度 / 预言机价 |
| 偿还 | min(已借入 + 10^-weiDecimals, 现货可用余额) |

  Max 向下取整到该资产的 `weiDecimals`，输入框也限制到这个精度。

## 页面

- 标题、官方说明（组合保证金账户显示另一段说明）、四个操作按钮。
- 三张统计卡：健康因子（悬浮说明官方定义）、总存入、总借出。
- 三个页签：存入与借入（两张表；1000px 及以下为卡片）、利息、操作历史。
- 存入表列：资产、LTV、APY、预言机价格、清算价、你的存入、你的已赚利息（组合保证金账户隐藏）、总存入、操作。借入表列：资产、LTV（N/A）、APY、预言机价格、你的借入、你的应付利息（组合保证金账户隐藏）、总借出、操作。
- APY 直接显示 `yearlyRate × 100`，与官方一致；字段名叫 YearlyRate，官方文档的利率是连续复利年化，页面沿用官方的“APY”称呼。
- 被动加载只显示稳定占位（`-`、`--`）和 `aria-busy`，不显示加载或错误文字，遵守[数据展示契约](mobile-data-presentation.md)。未连接钱包时表格照常显示公开数据，个人列为占位，操作禁用；连接入口在页头。

## 操作可用性

按钮的禁用条件对齐官方：

| 操作 | 禁用条件 | 说明文案 |
| --- | --- | --- |
| 存入 | 组合保证金；数据未就绪；行内另要求该资产现货余额 > 0 且不是 USDH | 组合保证金说明 |
| 取出 | 组合保证金；没有任何存入 | You have no supplied assets to withdraw. |
| 借入 | 组合保证金；没有存入抵押品 | Supply a supported collateral asset to borrow. |
| 偿还 | 没有借款；组合保证金（偏差，见下） | You have no borrows to repay. |

在此之上叠加项目的资金动作门控（`useFundsActionAvailability`）：地区受限或无法判定、手机上的 Agent-only 会话（显示唯一的“需要桌面主钱包”原因）、没有钱包访问、账户模式未知或不支持、账户数据未就绪时全部禁用。地区受限与 Agent-only 的原因显示在页头说明下方；其他情况只禁用，不显示文字。

## 提交

1. 同步 ref 防重复点击；弹窗在请求期间不可关闭，确认按钮名固定为操作动词（Supply / Withdraw / Borrow / Repay），不显示进度。
2. 确认按钮是 `TradingActionButton`（`requiresBuilderFee={false}`）：签名方未就绪时先换成“启用交易”，与官方在确认按钮外包一层交易前置状态的做法一致。借贷不需要 builder fee。
3. 发送前核验：账户模式未变（`useAccountAbstractionPreExecutionGuard`）、地区（强制刷新）、储备池与用户仓位（强制刷新）。用最新数据重算 Max，发送数量必须 ≤ 弹窗展示的 Max 且 ≤ 最新 Max，否则失败关闭并提示“收益余额已变化”。存入与偿还还校验现货余额的新鲜度（`assertFreshFundsAmount`）。
4. `useExchange("borrowLend")` 走交易签名方：邮箱账户用自己的嵌入式钱包，外部钱包用已验证的 Agent。`borrowLend` 已加入跨标签页资金锁，锁内由 `useExchange` 强制刷新法律条款校验。SDK 边界的同步守卫再核对身份、交易生命周期和参数与核验时一致。
5. 数量总是精确的小数字符串，从不发送 `null`（全额），见 ADR 0020 D2。
6. 请求结束后关闭弹窗，结果走全局通知：成功为 `Supplied USDC` 等并附数量；交易所拒绝或核验失败为错误通知；传输层结果不明为常驻警告，提示先查看操作历史再重试。

## 与官方的偏差

| 偏差 | 原因 |
| --- | --- |
| Max 不发送 `null`，总是发送展示的精确数量 | 确认面契约要求执行不超过用户看到的值；全额取出后可能留下提交期间新增的极小利息 |
| 组合保证金账户不能在 Earn 页偿还 | 官方在组合保证金下的偿还是卖出抵押品换成债务币再还的现货兑换流程，第一版没有实现；按钮禁用并说明原因。组合保证金的开通在本项目仍受 `PORTFOLIO_MARGIN_FEATURES` 门控 |
| 利息页签轮询 info 接口，不是 WebSocket 推送 | 锁定的 SDK 0.33.3 没有 `userBorrowLendInterest` 订阅 |
| 操作历史来自共享账本的 30 天窗口，最多 `MAX_HISTORY_ROWS` 条（与其他账本类型共用） | 复用已有的分页、校验与订阅合并；官方最多显示 30 条 |
| 结果未知没有持久化标记与恢复入口 | 金库/质押的标记机制绑定其对账数据源；Earn 第一版只给常驻警告并提示查看历史 |
| 地区受限时四个操作都禁用 | 与官方一致（官方的交易状态门控在 IP 受限时禁用全部操作）；也符合本项目地区门控拦截资金动作的规则 |

## 验证

自动化（2026-09-27，本机，分支 `claude/earn-page`）：

- `pnpm exec vitest run src/lib/tests/earn-domain.test.ts src/lib/tests/earn-action-modal.test.tsx`：解析失败关闭、官方表格、USDH 规则、清算价两套公式、健康因子上限、五种 Max、数量校验、按钮门控、提交前的双重上限；弹窗测试渲染真实弹窗与提交路径，核对展示的 Max 等于发送的数量、最新状态变小时不发送、超过展示值时禁用、重复点击只发一次、交易身份结束后不到 SDK、传输结果不明报告为未知。变异验证：去掉提交前核验后对应用例变红。
- 导航：`desktop-nav-layout`、`top-nav`、`mobile-nav-drawer`、`earn-page-surface-contract`；资金锁：`funds-action-lock`。
- 浏览器（本地开发服务器，未连接钱包）：1440px 桌面表格、窄面板卡片、法语全文；导航余量见 [Runtime guardrails §11](runtime-guardrails.md#11-desktop-top-navigation)。

未做：真实钱包的存入、取出、借入、偿还；已连接钱包状态下的导航余量；生产构建下的页面检查。上线前应在测试网用测试账户走一遍存入 → 取出，并核对通知与账本记录。
