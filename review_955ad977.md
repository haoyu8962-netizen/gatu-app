# 对抗审查报告:955ad977 feat(portfolio): add account overview and stablecoin swaps

- 审查对象:`955ad977`(39 文件:portfolio 页 + domain/portfolio.ts + domain/trade/swap.ts + spot-swap-modal 重构 + hl-react 钱包链改动 + 7 个测试文件 + 六语言 .po)
- 对照 HEAD:`ae775fc6`。中间的 `ebe9c920 fix(portfolio)` 已修复部分问题,每项发现均标注「仍在 / 已修」。`swap.ts` 与 `spot-swap-modal.tsx` 在 955ad977..HEAD 零改动,swap 相关结论对 HEAD 直接成立。
- 审查方法:主审 + 3 个并行对抗 agent;官方文档原文逐条对照 + SDK 0.33.1 类型对照;mainnet spotMeta/l2Book/portfolio/userFees 只读实测;15 组变异实验;隔离 worktree 工具链。全程零真实下单、零签名。
- 工具链基线:vitest 全量 548 passed + 1 skip 一次通过;tsc 唯一既有 viem 双实例错误;biome 4 个诊断均为既有(markdown.tsx / lazy.ts,非本提交);routeTree.gen.ts 与生成器输出 byte 级一致。
- 评分:8/10

---

## 一、官方文档字段核对 —— 全部正确(请勿改动)

| 项 | 官方出处 | 结论 |
|---|---|---|
| `STABLE_PAIR_FEE_SCALE="0.2"` | fees 文档 "Spot pairs between two spot quote assets have 80% lower taker fees" + 开发者公式 `scaleIfStablePair ? 0.2 : 1` | ✅ 逐字一致;适用对象(USDT0/USDH 均为 spot quote asset)经实盘 spotMeta 验证 |
| takerRate 来源 | userFees 端点 `userSpotCrossRate`(含 tier+质押折扣) | ✅ 用户真实费率口径;兜底 0.070% = 官方 Tier 0 |
| `tif: "FrontendMarket"` | SDK 类型注释 "Similar to Ioc, but add a note that this is market order" | ✅ IOC 语义,无残单风险;"could not immediately match" 错误串映射准确 |
| 下单字段 a/b/p/s/r/grouping | Asset IDs(10000+pairIndex)、tick 两约束(5 sig figs + 8−szDecimals)、size roundDown | ✅ 全对;USDT0/USDC→10166、USDH/USDC→10230 |
| l2Book | 每侧最多 20 档,不传 nSigFigs = 全精度 | ✅ 数据源正确;超深度大单保守报 isPartial |
| portfolio 端点 | `[[period, {accountValueHistory,pnlHistory,vlm}] × 8]`,ts 为 ms、值为 string | ✅ 8 键全映射且用 find 不依赖顺序(有测试);keep-strings 全程 Big |
| 余额扣 hold | spotState `balances[{total,hold}]` | ✅ swap 用 `max(0, total−hold)`(有测试钉住) |
| 账户总览源 | clearinghouseState `marginSummary.accountValue`(含未实现盈亏)+ spotState×allMids + vault equities + borrowLend | ✅ 字段语义正确;unified 模式避免共享 USDC 双计(有测试) |

## 二、修复清单(按优先级)

### P2-1 · swap 费用预估遗漏 builder fee(卖方向实收未计)— 仍在

- `packages/hl-react/src/hooks/useExchange.ts:26-27` 对 `"order"` 无条件注入 `builder={b, f:10}`(f 为 tenths of bps,=0.01%);`domain/trade/swap.ts:202-205` 估算只算 taker×0.2。
- 官方规则:builder codes **不适用于 spot 买侧、适用于卖侧** → USDT0/USDH→USDC 方向实际到手比 estimatedReceive 少 0.01% notional;base tier 下显示费 0.014% vs 实收 0.024%,**少报约 42%**。买方向巧合性正确。
- 修法:卖方向把 builder fee 计入估算,或对齐主交易盒 `order-summary.tsx:91-93` 的做法单列 "Builder fee" 一行。

### P2-2 · Max 按钮买方向自锁 — 仍在(实盘数据复现)

- `swap.ts:146-149`(getMaxSwapInput 按 balance/(1+slippage))与 `swap.ts:176-177,207`(size 按 markPx 折算、maxInput=size×limitPrice=balance×ask/markPx)口径不一致;`spot-swap-modal.tsx:211-212` 用 maxInput>balance 禁提交。
- 实测复现:USDH/USDC 当日 bestAsk 1.0001 > markPx 0.9999,余额 10000 点 Max → maxInput 10001.99 > 10000 → 弹 "Insufficient balance" 禁用。凡 ask>markPx(约半数时间)即触发,余额越大越必现。无资金损失风险(双重校验都会拦),纯可用性缺陷。
- 修法:Max 场景的 size 折算参考价改用 bestAsk(或直接用 limitPrice),与余额校验同口径。

### 高 · 测试盲区(资金安全级)— 仍在

变异实证(worktree,548 用例基线):

- **`getSwapSide` 返回取反(买卖方向全反)→ 全套件全绿存活**。该函数直接决定 `order.b`、bids/asks 选择、限价方向与 size 折算 —— 方向反了等于用户点「USDC→USDT0」实际提交卖出 USDT0 的市价单。代码本身静态核对正确,但全仓无一行测试触达它。
- 仅卖侧滑点方向反转(minus→plus)→ 存活。**整条卖出链路(稳定币功能的回程)零测试**;`findSpotPair` 同样零覆盖。
- 补:`getSwapSide`/`findSpotPair` 直测 + 卖侧 `buildSwapQuote` 用例(含滑点方向断言)。
- 其余变异 6/8 被杀(滑点全反、book 遍历、0.2 折扣、Max 折算、最小额、size 换算),买侧判别力良好。

### P2-3 · i18n 四语言空翻译 — 仍在

- 新增 25 msgid 中 **es/fr/hi/ar 各 24 条 msgstr 为空**(仅 en/zh 完整)→ 运行时回退英文,打破五语言 100% 翻译状态。
- 4 处硬编码英文漏提取(屏幕阅读器可见,HEAD 仍在):`portfolio-page.tsx:108` aria-label="Account activity";`portfolio-performance-chart.tsx:42/87/90` 两个 aria-label + `<title>`。同提交的 portfolio-overview 是正确写法(`aria-label={t\`...\`}`)可参照。
- `portfolio-mobile-balances.tsx:1` 用非响应式 `t`(@lingui/core/macro,无 useLingui 订阅)→ React Compiler memo 下切语言不刷新;同提交 portfolio-overview 用的响应式 `useLingui().t`,新文件应对齐(全库 53 个文件同病属既有系统性问题,新文件别再增量)。

### P3 批次 — 均仍在

1. 普通 swap 模式(mode:"spot")无 isPartial 提示、无 $10 最小额前置校验(仅稳定币模式有)—— 靠交易所报错兜底,文案未友好化。一致性问题。
2. Total Equity 优先取所选 period 的历史采样末点,>0 才回退实时聚合(`portfolio-overview.tsx:83-88`)→ 数值可能滞后一个采样间隔且随 period 切换变化。建议实时聚合优先。
3. swap 可用余额(total−hold)与主交易盒(tokenToAvailableAfterMaintenance)口径不一致 —— unified 账户 USDC 兼作保证金时 Max 可能被链上拒。
4. 费率估算未乘 `(1 − activeReferralDiscount)`(userFees 同端点可得)—— 方向保守(高估费用),仅影响 referral 用户。
5. 嵌套三元 ×3(违反 "Never nest ternary operators"):`use-wallet-session.ts:21-25`、`portfolio-performance-chart.tsx:34-35`、`spot-swap-modal.tsx:496-510`。提取 helper + 早返回。
6. `bg-portfolio-canvas` 新 token 未按 checklist 登记进 design-tokens.md。
7. 文案与常量脱钩:swap modal 硬编码 "1%"(DEFAULT_SWAP_SLIPPAGE_BPS)与 "10 USDC"(ORDER_MIN_NOTIONAL_USD)—— 改插值。
8. 提交的 .po 六语言仍引用未跟踪幽灵探针 `tmp-stale-t-probe.test.tsx`(生成物不可复现)—— 删探针后重跑 extract。

### 独立立案(既有,非本提交)

`packages/hl-react/src/signing/agent-utils.ts:21-25` 的 `convertFeeToPercentageString(10)` 把 f 当 bps 算出 "0.1%",官方 f 为 tenths of bps(f=10 = 0.01%)→ **用户签名授权的 maxFeeRate 是实收的 10 倍**(展示层 `format.ts:375` 换算正确)。源自 3e601056。已在任务面板立项,修换算 + 补测试 + 评估存量授权提示。

## 三、钱包红线:完好,且为主动强化(请勿回退)

- `toHyperliquidWallet` 第二参数从 `accountOverride`(覆盖)反转为 `expectedAddress`(校验,不匹配返回 null)—— "身份 A + 签名者 B" 的分叉在类型上不再可能;
- `privy-wagmi.ts` 删除 `任意地址 → 任意 embedded → wallets[0]` 三层兜底,只认精确匹配,否则走重连;
- user-signed 动作(转账/提现/授权)在 wagmi 活跃账户 ≠ 期望地址时抛 `WalletAccountMismatchError` 拒签;`order` 仍走 EOA 批准的 L1 agent client,分类正确;
- smart wallet(linkedAccounts `type:"smart_wallet"`)无法通过 EOA 过滤;funding/bridge 文件零触碰;
- useClients 移除按地址缓存(消除同地址换钱包复用旧签名者的隐患),SDK nonce 按地址键控无副作用;
- 三个新测试直接钉住机制(地址不符 → null 且 signTypedData 未被调用;不兜底 wallets[0] 断言反转为 toBeUndefined)。
- 建议(非必须):补一条 "type: smart_wallet 的 linkedAccount 不被 getPrivyEmbeddedWalletAddress 采纳" 的直接断言。

## 四、确认正确面(请勿"顺手修改")

- walk-the-book 方向/限价截断/isPartial 判定/IOC 全量提交组合正确;全程 string→Big→string(替换了旧版浮点滑点乘法,精度升级);
- USDT0→USDH 无直接对被正确阻止(非 USDC 只返回 [USDC],有测试;store 直开非法组合会 fallback 到 USDC);
- 空输入/超余额/订单簿缺失/流失败/flip 重置等边界全有防护;
- portfolio 域函数 7 组变异全红(双计/漏加/映射/回撤符号全被钉住);
- 955 态「数据不可用显示假零」(PNL $0.00、费率 0.0000%)已被 ebe9c920 以 null 传播 + "—" 占位 + Retry + 162 行组件测试修复;
- SSR:portfolio 路由 `ssr:false` + guard 完备;导航接线桌面/移动一致(aria-current);modal store 判别联合向后兼容;
- zh 术语质量佳(稳定币兑换/吃单/挂单/最大回撤/理财余额/挂单占用)。

## 五、建议执行顺序

1. swap 卖侧 builder fee 计入估算或单列(P2-1)
2. Max 参考价口径统一(P2-2)
3. 补 getSwapSide/findSpotPair/卖侧滑点测试(资金安全盲区)
4. es/fr/hi/ar 24 条翻译 + 4 处 aria-label 提取 + mobile-balances 响应式 t
5. P3 批次(isPartial 与 $10 一致化、Total Equity 口径、嵌套三元、design-tokens.md、文案插值、幽灵探针 extract)
6. builder fee 授权换算(独立任务,可并行)
