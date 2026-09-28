# Hyperliquid SDK 接口覆盖审查

状态：审查记录。覆盖清单描述基线代码的实际调用；接入建议与排序是拟议，未实施、未排期。审查日期：2026-09-27。基线：`e3b5dd82`（`main`，树与 `origin/dev` 相同）。SDK：`@nktkas/hyperliquid` 0.33.3（仓库锁定版本，也是 npm 当前 `latest`，发布于 2026-08-02）。

范围：`apps/terminal/src` 与 `packages/hl-react/src` 的生产代码（不含测试）对 SDK 四个客户端的调用。`apps/website` 只有 Ticker 的一次原始 `allMids` 请求，不影响结论。自建的 `pac` / `sac` 紧凑行情频道和增量 `l2` 频道不是 SDK 方法，不计入。协议语义以[核对工作流](hyperliquid-sdk-reference.md)为准；本文不改变任何现行契约。文中以 `components/`、`domain/`、`hooks/`、`lib/` 开头的路径相对 `apps/terminal/src`。

## 结论摘要

| 客户端 | SDK 方法 | 生产代码已调用 | 未调用 |
| --- | ---: | ---: | ---: |
| Info | 77 | 42 | 35 |
| Exchange | 59 | 23 | 36 |
| Subscription | 28 | 23 | 5 |
| Explorer | 5 | 0 | 5 |
| 合计 | 169 | 88 | 81 |

未调用的 81 个方法：

| 结论 | 数量 | 方法 |
| --- | ---: | --- |
| 建议接入 | 6 | `fundingHistory`、`perpsAtOpenInterestCap`、`perpDexLimits`、`predictedFundings`、`maxMarketOrderNtls`、订阅 `notification` |
| 可选 | 15 | `userBorrowLendInterest`、`userTwapSliceFillsByTime`、`agentSendAsset`、`agentSetAbstraction`、`userToMultiSigSigners`、`userRateLimit`、`reserveRequestWeight`、`linkStakingUser`、`approvedBuilders`、`scheduleCancel`、`cancelByCloid`、`noop`、`exchangeStatus`、`spotUser`、`setDisplayName` |
| 战略级功能（需单独设计与 ADR） | 12 | 子账户：`subAccounts2`、`createSubAccount`、`subAccountModify`、`subAccountTransfer`、`subAccountSpotTransfer`；HIP-4 预测市场：`outcomeMeta`、`settledOutcome`、订阅 `outcomeMetaUpdates`、`userOutcome`；金库管理：`createVault`、`vaultModify`、`vaultDistribute` |
| 已在其他分支或被策略关闭 | 2 | `borrowLend`（`claude/earn-page` 已接入，未合入）、`userPortfolioMargin`（`HyperliquidExchangePolicyProvider` 默认拦截组合保证金开启） |
| 冗余：已有等价来源 | 18 | 见[冗余](#冗余已有等价来源) |
| 与交易终端无关 | 28 | 见[不适用](#不适用部署者验证者与节点运营) |

性价比最高的是资金费率历史、OI 上限预警和跨交易所资金费率对比：都是公开只读接口，官方前端都在用。gatu 目前只显示当前资金费率和结算倒计时，订单撞上 OI 上限后才显示拒单原因。收益最大的是子账户和 HIP-4 预测市场，但两者会改变账户或市场模型，不能当作接一个接口处理。

## 判定方法

1. 方法全集：锁定包 `esm/api/{info,exchange,subscription,explorer}/_methods/*.d.ts`。
2. 调用点：生产代码中 `useInfo`、`usePortfolioInfo`、`infoQueryOptions`、`useSubscription`、`useExchange` 的字面量首参（跨行匹配），以及 `getInfoClient().x(`、`info.x(`、`client.x(`、`getSubscriptionClient().x(` 等直接调用。只有 `useInfo`、`useExchange`、`usePortfolioInfo` 包装本身用变量分发，它们的调用方都用字面量。
3. 人工排除同名字符串：账本 delta 类型（`subAccountTransfer`、`borrowLend`）、通知操作名（`cancel`、`modify`）；Info 与 Subscription 的同名方法（`openOrders`、`activeAssetData`、`clearinghouseState` 等）分别判定。
4. 只出现在注册表、锁表或策略里、没有调用点的方法算未接入：`USER_SIGNED_METHODS`（`packages/hl-react/src/registries/exchange.ts`）、资金操作锁（`packages/hl-react/src/internal/exchange/funds-action-lock.ts`）、组合保证金策略（`packages/hl-react/src/exchange-policy.tsx`）、请求调度优先级（`packages/hl-react/src/internal/exchange/request-scheduler.ts`）。这些预留降低了接入成本，下文会注明。
5. 官方前端证据：2026-09-27 用内置浏览器未登录打开 `app.hyperliquid.xyz`，从入口包的 Vite 依赖表递归取得 395 个同源 JS 文件（约 14 MB），检索 `type:"<方法>"` 请求对象并记录所在模块名。压缩代码里用户签名动作有时经 EIP-712 辅助函数拼装，检索会漏，所以“未发现”不等于官方不支持；“发现”都附模块或上下文。
6. 公开数据实测：2026-09-27 对主网 `/info` 发只读请求，不带任何用户地址。结果写在各条目中。

## 已接入

- Info（42）：`allBorrowLendReserveStates`、`allMids`、`allPerpMetas`、`borrowLendUserState`、`candleSnapshot`、`clearinghouseState`、`delegations`、`delegatorHistory`、`delegatorRewards`、`delegatorSummary`、`extraAgents`、`frontendOpenOrders`、`historicalOrders`、`l2Book`、`leadingVaults`、`legalCheck`、`maxBuilderFee`、`meta`、`metaAndAssetCtxs`、`orderStatus`、`perpAnnotation`、`perpConciseAnnotations`、`perpDexs`、`portfolio`、`preTransferCheck`、`referral`、`spotClearinghouseState`、`spotMeta`、`tokenDetails`、`twapHistory`、`usdcRouting`、`userAbstraction`、`userFees`、`userFills`、`userFillsByTime`、`userFunding`、`userNonFundingLedgerUpdates`、`userRole`、`userTwapSliceFills`、`userVaultEquities`、`validatorSummaries`、`vaultDetails`。
- Exchange（23）：`approveAgent`、`approveBuilderFee`、`batchModify`、`cDeposit`、`cWithdraw`、`cancel`、`claimRewards`、`order`、`registerReferrer`、`sendAsset`、`sendToEvmWithData`、`setReferrer`、`spotSend`、`tokenDelegate`、`topUpIsolatedOnlyMargin`、`twapCancel`、`twapOrder`、`updateIsolatedMargin`、`updateLeverage`、`usdClassTransfer`、`userSetAbstraction`、`vaultTransfer`、`withdraw3`。
- Subscription（23）：`activeAssetCtx`、`activeAssetData`、`activeSpotAssetCtx`、`allDexsAssetCtxs`、`allDexsClearinghouseState`、`allMids`、`bbo`、`candle`、`fastAssetCtxs`、`l2Book`、`openOrders`、`orderUpdates`、`spotAssetCtxs`、`spotState`、`trades`、`twapStates`、`userFills`、`userFundings`、`userHistoricalOrders`、`userNonFundingLedgerUpdates`、`userTwapHistory`、`userTwapSliceFills`、`webData3`。其中 `allDexsAssetCtxs`、`spotAssetCtxs` 只在紧凑频道关闭时作回退。
- Explorer：无。交易哈希、地址和代币只生成外链（`packages/hl-react/src/explorer.ts`）。

## 收益排序

排序规则：先按收益与成本之比，再把有前置条件的项后移。收益和成本是基于下列证据的判断，不是测量。

| 顺序 | 接入项 | 用途 | 收益 | 成本 | 依据与前置 |
| ---: | --- | --- | --- | --- | --- |
| 1 | 资金费率历史：`fundingHistory` | 在市场详情或资金费率悬浮层显示历史费率曲线（小时粒度，按区间取数） | 高 | 低 | 官方用 `fundingRateHistory` 查询画渐变图；gatu 只显示当前费率与“Resets in”倒计时（`components/trade/market-overview.tsx`、`mobile-market-bar.tsx`）。实测每页 500 条、按时间升序，HIP-3 币（`xyz:AAPL`）可用；分页可复用 `lib/trade/history-pagination.ts`，数字经 `lib/format.ts` 格式化 |
| 2 | OI 上限预警：`perpsAtOpenInterestCap` + `perpDexLimits` | 市场达到 OI 上限时在下单区提示只能减仓或价格受限；HIP-3 市场显示每币 OI 上限和单笔划转上限 | 中 | 低 | 字段已随现有 `webData3` 订阅到达（`perpDexStates[].perpsAtOpenInterestCap`），gatu 没有读取；未连接钱包时才需要 Info 请求。官方读取同一字段，并以 5 分钟缓存请求 `perpDexLimits`。实测主网 7 个处于上限的市场全部已下架，10 个 HIP-3 dex 为空；但 HIP-3 每币上限可低至 `km:AAPL` 16 万美元、`mkts:BVIV` 200 美元。gatu 目前只在拒单后显示 `positionIncreaseAtOpenInterestCapRejected` 等状态标签。新提示属于被动数据提示，须先更新[数据展示契约](mobile-data-presentation.md) |
| 3 | 跨交易所资金费率对比：`predictedFundings` | 列出 Hyperliquid、Binance、Bybit 的预测费率、下次结算时间与价差；也可在市场头显示 HL 预测费率 | 中 | 低 | 官方 Funding Comparison 页（`FundingPage` 模块）只调用这一个接口并过滤已下架币。实测 234 个资产、3 个场所，单次约 64 KB；协议只支持第一个 perp dex |
| 4 | 服务端账户通知：订阅 `notification` | 接收服务器推送给该账户的文本通知 | 中低 | 低 | 官方订阅当前账户并以成功样式 toast 显示原文。消息内容和频率未取得（需要真实账户观察）；原文是英文字符串，与[运行时翻译](i18n-presentation.md)冲突，需先决定原文展示还是映射已知消息；接入 `AppToaster` 前更新[通知规范](trading-notifications.md) |
| 5 | 大额市价单上限：`maxMarketOrderNtls` | 下单前提示市价单名义价值超出上限，避免被拒 | 中低 | 低 | 实测按资产最大杠杆分档：25x 及以上 3000 万美元、20x 500 万、10x 200 万、其余 50 万。官方在持仓 TP/SL 弹窗加载。只作提示，不改变现有签名与可用性守卫 |
| 6 | Earn 利息明细：`userBorrowLendInterest` | Earn 页展示每期借出/借入利息 | 中（Earn 合入后） | 低 | `claude/earn-page` 已接 `borrowLend` 与两个状态查询，未接利息历史。官方还订阅同名 WebSocket 频道，SDK 0.33.3 只有 Info 版本 |
| 7 | TWAP 成交完整历史：`userTwapSliceFillsByTime` | 按时间分页取 TWAP 子单成交，补 CSV 导出，并突破 `MAX_TWAP_HISTORY_ROWS`（2000）截断 | 中低 | 低 | 官方在 TWAP 成交页签的 CSV 导出中使用；gatu 的成交 CSV 只导出非 TWAP 成交（`fill.twapId === null`） |
| 8 | Agent 代签资金操作：`agentSendAsset`、`agentSetAbstraction` | Agent 签名的自有账户划转（perp、spot、HIP-3 dex 之间，协议要求目标地址等于源地址）和账户模式切换 | 中 | 中 | 能让 Agent-only 会话（桌面配对的手机）使用划转，外部钱包做内部划转也不再弹钱包。这会改变签名模型：先更新 [ADR 0002](adr/0002-exact-owner-trading-signers.md)、[签名机制](hyperliquid-signing.md)，以及 Runtime guardrails §8 中“Agent-only 资金操作显示需桌面”的约定。资金锁已预留两者；生产配对开关仍关闭，近期收益有限；`agentSetAbstraction` 的组合保证金取值已被策略拦截 |
| 9 | 多签账户识别：`userToMultiSigSigners` | 连接时识别多签账户，给出明确的失败原因，而不是签名报错 | 中低 | 低 | 官方在账户状态中查询。符合签名契约“缺失或不一致时 fail closed” |
| 10 | 地址级限频额度：`userRateLimit`，可附 `reserveRequestWeight` | 显示已用/上限请求数，解释“累计请求超过成交量额度”的拒单；可选付费预留额度（每次请求 0.0005 USDC，从 Perps 余额扣） | 中低 | 低 | 官方未使用。gatu 已处理 IP 级 429（图表、历史分页），未处理地址级限频 |
| 11 | 质押账户关联：`linkStakingUser` | 交易账户发起、质押账户确认后，质押量计入交易账户的手续费折扣 | 中低 | 中 | Staking 页已只读显示关联状态（`userFees.stakingLink`）。两步分别由交易账户和质押账户做 EIP-712 签名；不可逆的 `stakingLinkDisableTradingUser` 不应一并提供 |
| 12 | Builder 授权清单：`approvedBuilders` | 列出账户授权过的 builder，可用 `approveBuilderFee` 设为 0 撤销 | 低 | 低 | 官方 Builder Codes 页使用 |
| 13 | 死人开关：`scheduleCancel` | 设定时间点自动撤销全部挂单；时间至少在 5 秒后，每日最多触发 10 次 | 中低 | 中 | 官方文档注明“API only”，官方前端未用。需要页面存活心跳与可见性处理；撤单状态标签 `scheduledCancel` 已存在；多数挂单用户希望离线后订单保留，只能默认关闭 |
| 14 | 在途订单撤销：`cancelByCloid`、`noop` | 未拿到 oid 时按 cloid 撤单；用 `noop` 占用 nonce，使未确认的在途动作无法再落地 | 中低 | 中高 | 官方未用。gatu 下单已带 cloid（`domain/trade/order-tracking.ts`），调度器已给 `cancelByCloid` 设紧急优先级；`noop` 需要 hl-react 掌握 nonce，并牵涉“结果未确认”的通知语义 |
| 15 | 零散设置：`exchangeStatus`、`spotUser`、`setDisplayName` | 交易所特殊状态横幅、退出现货小额清扫、排行榜昵称 | 低 | 低 | `exchangeStatus` 实测 `specialStatuses: null`，字段语义无文档，官方未用，做横幅同样属于被动数据提示；后两项官方用 Agent 签名 |

只看收益：高是子账户、HIP-4 预测市场、资金费率历史；中是 OI 上限预警、跨交易所资金费率、Agent 代签资金操作、Earn 利息明细、组合保证金；其余为中低或低。

## 战略级功能

这些功能收益高，但接入范围远超单个接口，实施前各需设计文档与 ADR。

| 功能 | 接口 | 收益 | 成本与前置 |
| --- | --- | --- | --- |
| 子账户 | `subAccounts2`、`createSubAccount`、`subAccountModify`、`subAccountTransfer`、`subAccountSpotTransfer` | 高：专业用户按策略分仓；官方有独立 Sub-Accounts 页，创建和改名用 Agent 签名 | 高：子账户没有私钥，动作由主账户签名并带 `vaultAddress`；账户切换影响全部订阅、视图、草稿与通知身份；需要扩展“签名账户必须等于所选 Hyperliquid 用户”的契约。`subAccounts`（v1）不必接 |
| HIP-4 预测市场 | `outcomeMeta`、`settledOutcome`、订阅 `outcomeMetaUpdates`、`userOutcome`（拆分/合并 Yes/No 份额） | 高：新品类；实测主网已有 231 个 outcome、20 个 question（价格触及、二元价格、体育赛事冠军等模板），官方已支持 | 很高：新增 `MarketKind`、下单与结算语义、持仓展示、拆分合并资金流；合规与地区限制需先定。hl-react 已有 outcome 资产 ID 辅助函数，撤单已支持 `#` 前缀币 |
| 金库管理 | `createVault`、`vaultModify`、`vaultDistribute` | 低中：只面向金库领投人；官方有创建（`TradeAsVaultModal`）与管理入口 | 中：以 `vaultAddress` 代金库交易，领投人视图与费用规则需要设计 |
| 组合保证金 | `userPortfolioMargin`，以及 `userSetAbstraction` / `agentSetAbstraction` 的组合保证金取值 | 中：官方资格为账户价值超过 1 万美元或加权成交量超过 500 万美元、账户价值低于 500 万美元，且开启前无持仓、挂单和 TWAP | 路由已存在，但被 `HyperliquidExchangePolicyProvider` 默认拦截；开启是风险与产品决策，不是接口缺口 |

## 冗余：已有等价来源

| 接口 | 等价来源 |
| --- | --- |
| `marginTable` | `allPerpMetas` 的 `marginTables` 加隐式单档规则（`resolveMarketMarginTiers`）。实测 11 个 dex、528 个资产全部可解析（显式 43、隐式 485），0 缺失。官方在杠杆弹窗按所选杠杆取分档下界，显示该杠杆可开的仓位上限；gatu 杠杆弹窗没有这项信息，但可直接用现有分档实现，属于功能缺口而非接口缺口 |
| `perpCategories` | 已接入的 `perpConciseAnnotations` 带同一分类；实测 206 个币全部一致 |
| Info `openOrders`、Info `activeAssetData` | 同名订阅，以及 `frontendOpenOrders` |
| `spotMetaAndAssetCtxs`、订阅 `assetCtxs` | `spotMeta` 加紧凑 `sac` / `pac` 频道，回退 `spotAssetCtxs` / `allDexsAssetCtxs` |
| `recentTrades` | `trades` 订阅首帧快照 |
| `webData2` | `webData3` |
| 订阅 `clearinghouseState` | `allDexsClearinghouseState` |
| 订阅 `userEvents` | `userFills`、`userFundings`、`userNonFundingLedgerUpdates`（含清算）、`userHistoricalOrders`（含系统撤单状态） |
| Info `userDexAbstraction`，Exchange `userDexAbstraction`、`agentEnableDexAbstraction` | `userAbstraction` / `userSetAbstraction` 的统一账户模式 |
| `borrowLendReserveState` | `allBorrowLendReserveStates` |
| `subAccounts` | 做子账户时改用包含各 dex 状态的 `subAccounts2` |
| `modify` | `batchModify` |
| `usdSend` | `sendAsset` / `spotSend` |
| `vaultSummaries` | 金库发现用 stats-data 公共列表（`usePublicVaults`）。此接口只返回 2 小时内新建的金库，官方用它补充列表 |

## 不适用：部署者、验证者与节点运营

| 类别 | 接口 |
| --- | --- |
| HIP-1/2/3/4 部署与 HyperEVM 关联 | `perpDeploy`、`spotDeploy`、`finalizeEvmContract`、`evmUserModify`、`activateOutcomeDeployer`、`outcomeTemplates`、`authorizeAqav2Role`、`perpDeployAuctionStatus`、`spotDeployState`、`spotPairDeployAuctionStatus`、`perpDexStatus` |
| HIP-3 后备清算池 | `hip3LiquidatorTransfer`（存取以 1000 报价币为单位；官方未用） |
| 验证者 | `cSignerAction`、`cValidatorAction`、`validatorL1Stream`、`validatorL1Votes` |
| 节点与网络 | `gossipPriorityBid`、`gossipPriorityAuctionStatus`、`gossipRootIps` |
| 清算者与未公开语义 | `liquidatable`、`isVip`（官方仅在 Portfolio 页查询） |
| 高风险且小众 | `convertToMultiSigUser`（单签与多签互转）、`stakingLinkDisableTradingUser`（不可逆锁定交易账户） |
| Explorer | `blockDetails`、`txDetails`、`userDetails`、订阅 `explorerBlock` / `explorerTxs`：官方用于站内浏览器页，gatu 的外链已够用；若要在资金对账中按哈希核验交易，需另接 explorer 端点并补 CSP |

## 附：SDK 工具函数

`@nktkas/hyperliquid/utils` 的 `formatPrice`、`formatSize`、`SymbolConverter` 未使用。gatu 有自己的 `formatPriceForOrder` / `formatSizeForOrder`（`apps/terminal/src/domain/trade/orders.ts`，Big.js 实现，`orders.test.ts` 覆盖）和市场目录。不建议替换；可以在测试中把 SDK 函数当对照，替换前先核对两边的舍入方向。

## 验证与限制

- 已核对：方法全集；调用点由脚本检索后逐条人工确认同名项；对 `origin/dev` 之后的本地与远端分支检索新增代码，只有 `claude/earn-page` 新增了上述候选之一（`borrowLend`）。
- 官方前端：2026-09-27 未登录取得的产物；检索基于压缩代码，漏检情形见方法第 5 条。2026-09-21 的两个主包副本（本地 `.worklog/close-all-queue-review-2026-09-21/`，Git 忽略）提供了部分上下文。
- 公开数据是当日快照：OI 上限名单、outcome 数量、市价单上限都会变化。
- 未做：没有修改代码、没有运行应用或单元测试、没有连接真实账户；`notification` 的消息内容和 `userRateLimit` 的真实额度未取得。
- 复核示例（在已安装依赖的检出中运行）：

```bash
ls node_modules/.pnpm/@nktkas+hyperliquid@0.33.3*/node_modules/@nktkas/hyperliquid/esm/api/info/_methods | grep '\.d\.ts$'
rg -n '"fundingHistory"|\.fundingHistory\(' apps/terminal/src packages/hl-react/src -g '!*.test.*'
```

## 后续

- 按排序实施时从第 1–3 项开始：它们只读、公开、官方已用，且不触碰签名与资金契约。
- 子账户、HIP-4、Agent 代签资金操作在实施前各自需要设计文档与 ADR。
- 升级 SDK 时重跑本审查，确认新增方法以及 `userBorrowLendInterest` 订阅是否可用。

## 后续：第一批实施（2026-09-28 追加）

以上审查内容保持 `e3b5dd82` 基线时的原样，计数不随实施更新。按[接入规划](sdk-feature-integration-plan.md)实施的第一批六项已集成到分支 `claude/sdk-api-review-51a3ea`（未推送、未合入 `dev`、未发布），实施、三轮对抗审查与验证见规划的实施记录：

| 本文排序 | 接口 | 实施结果 | 归属文档 |
| ---: | --- | --- | --- |
| 1 | `fundingHistory` | 图表区 Funding 页签（桌面与手机） | [市场资金费率历史](market-funding-history.md) |
| 2 | `webData3.perpDexStates[].perpsAtOpenInterestCap`、`perpDexLimits` | 上限市场拦截限价、止损限价、止盈限价；HIP-3 资产信息显示每币上限；不新增订阅 | [未平仓量上限](open-interest-cap.md)、[ADR 0023](adr/0023-open-interest-cap-advisory-check.md) |
| 3 | `predictedFundings` | `/fundingComparison` 对比页 | [资金费率对比](funding-comparison.md) |
| 5 | `maxMarketOrderNtls` | 持仓 TP/SL 弹窗的滑点提示（按持仓当前杠杆选档，与官方前端一致；与本文把它描述为「避免被拒」的下单预检不同） | [TP/SL 滑点提示](position-tpsl-slippage-warning.md) |
| 7 | `userTwapSliceFillsByTime` | TWAP 成交 CSV 导出；表格仍显示最近 2,000 条；不发送 `aggregateByTime` | [TWAP 回归](twap-regression-tests.md) 的 Export 一节 |
| 冗余表中的 `marginTable` | 不调用；复用 `allPerpMetas` 已解析的分档 | 杠杆弹窗显示所选杠杆下的最大仓位 | [杠杆仓位上限](leverage-position-limit.md) |

未实施的第 4 项服务端账户通知（订阅 `notification`）：实施前侦察发现 SDK 0.33.3 按频道分发帧且帧内没有用户字段，同一共享 socket 上切换账户时旧账户的帧可能进入新账户的监听，需要传输层隔离的架构决策；原因与前提见规划的「范围取舍」。其余第 6、8–15 项与战略级功能未排期。
