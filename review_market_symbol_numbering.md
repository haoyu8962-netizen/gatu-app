# 交易对编号体系穷尽审查报告:URL 显示名 ↔ API 记号 ↔ asset id

> 方法:主审核对核心链路 + 4 个并行维度 agent 穷尽扫描(name 反推逻辑 / 行情消费点 / 交易侧消费点 / 重映射与编号混用)。全部结论基于 2026-07-16 mainnet 只读实测(spotMeta 472 tokens / 312 pairs 全量、metaAndAssetCtxs、allPerpMetas、perpDexs、tokenDetails、allMids 1163 键、WS 订阅实测、官方 CDN 图标探测、官方 gitbook 文档)。起因:用户询问官方 `app.hyperliquid.xyz/trade/HYPE/USDC` 的交易对编号处理方式,并要求对照核对本项目。

## 官方编号体系(权威参考,全部实测确认)

一个交易对有**三套并存编号**,以 HYPE/USDC 为例:

| 编号 | 值 | 来源 | 用途 |
|---|---|---|---|
| Token index | HYPE=150,USDC=0 | `spotMeta.tokens[].index` | 标识代币;**注意 index ≠ 数组位置**(实测 14 个 token 错位) |
| Spot pair 记号 | `@107` | `spotMeta.universe` 中 `tokens:[150,0]` 的 pair | 行情 coin 参数(candleSnapshot/l2Book/WS) |
| Asset ID | `10107` | `10000 + pair.index` | 下单 action 的 `a` 字段 |

- perp:coin=币名("HYPE",universe index=159),asset id=159;builderPerp:coin="dex:NAME"("xyz:TSLA"),asset id=`100000+dexIndex*10000+assetIndex`。
- **PURR/USDC 是全网唯一斜杠记号 spot**(index 0,isCanonical);其余 spot 一律 `@N`,斜杠显示名直传行情接口 500(实测 `HYPE/USDC`→500、`@107`→200)。
- **UI 重映射**:官方前端把 UBTC 显示为 BTC(fullName "Unit Bitcoin")、USDT0→USDT、XAUT0→XAUT;官方文档:"The L1 name on the token details page can be used to detect remappings"。

## 总结论

**下单与行情主链路全部正确,无资金安全的编号错误**:全部 22 处 `useExchange` 调用、10 处 `a:` 字段构造恒为数字 `market.assetId`;行情订阅(l2Book/trades/candle/activeAssetData)全用 `market.name`;ctx 合并按 pair.index 稠密数组 0 错绑;三类特殊市场(PURR/UBTC@142/builderPerp)三重实测通过。**但穷尽扫描发现 3 个 P1(影响交易/功能)+ 2 个 P2 + 一批 P3**,均在市场目录构建与显示层,详列如下。

## P1(影响交易,优先修)

### A1. token index 被当数组下标 → 11 个真实市场被静默丢弃,未来会静默错绑
[use-markets.tsx:69](apps/terminal/src/lib/hyperliquid/markets/use-markets.tsx) `pair.tokens.map((idx) => spotTokens[idx])` 把 **token index 当数组位置**。mainnet 实测:472 个 token 中 **14 个 index ≠ 位置**(位置 458-471,index 478-845),引用它们的 **11 个真实上架 pair 整体被丢**(`tokensInfo.length<2 → continue`):@367 WARS、@465 SPCXD、@496 ONEAR、@497 MGW、@590 SPCX、@591 MAX、@698 HNIL、**@699 UANSEM(日成交 $780K)**、**@700 DRV($261K)**、@701 WBRL、@702 NVDAX —— 这些市场在终端**完全不可见、不可交易**。更危险的是"只丢不错绑"纯属侥幸:一旦官方在 index gap(458-477)中上新 token,数组插入整体错位 → **静默绑错 base token**(pairName/szDecimals 全错,szDecimals 错会导致下单数量格式化错误)。
**修**:构建 `Map<token.index, token>` 查表,禁止按位置访问。

### B1. 剥 U 撞名 → 点原生市场落到 Unit 市场下单(交易对象错误)
[market-route.ts:76](apps/terminal/src/lib/hyperliquid/market-route.ts) 路由用 pairName 生成 + [useMarketsInfo.ts:169](apps/terminal/src/lib/hyperliquid/hooks/useMarketsInfo.ts) byPairName 后写覆盖。UPUMP→PUMP、UMON→MON、UMOG→MOG 剥壳后与**原生 HIP-1 同名 token 撞名**,两个不同市场生成**完全相同的 pairName 与路由**,Unit 盘(universe 序靠后)覆盖原生盘。实测三组冲突且价格天差地别:`MOG/USDC` @43(0.000026)vs @200 UMOG(**1.715**);`PUMP/USDC` @20($30/日)vs @188 UPUMP(**$516K/日**);`MON/USDC` @129 vs @243 UMON。**用户点原生盘的行,页面与下单 assetId 都是 Unit 盘**(10188/10200/10243 而非 10020/10043/10129);原生盘从 URL 层面永久不可达。⚠️ 第 4 组 `ANSEM/USDC`(@18 vs @699)目前被 A1 的丢弃 bug 意外掩盖——**修 A1 会立即引爆它,两个必须一起修**。
**修**:pairName 冲突时路由退回真名(`/trade/@43`);byPairName 构建时检测冲突不覆盖;列表行加区分标识。

### C1. 三处 `activeSpotAssetCtx` 用 `@${index}` 重构 coin → PURR/USDC 订阅必然失败
[market-overview.tsx:75-77](apps/terminal/src/components/trade/market-overview.tsx)、[use-document-title.ts:6-9](apps/terminal/src/hooks/use-document-title.ts)、[mobile-market-bar.tsx:429-432](apps/terminal/src/components/trade/mobile/mobile-market-bar.tsx) 的 `getSpotSubscriptionCoin` 用 `` `@${market.index}` `` 而非 `market.name`。对普通 spot 碰巧等价(name=@index);对 **PURR/USDC(name="PURR/USDC",index=0)生成 "@0"** —— WS 实测直接报 `Invalid subscription`,永远收不到 ctx。影响:PURR 市场栏 24h 成交量/实时 markPx/市值、标签页标题价格失效或降级(部分字段回退 5s 节流的 market.*)。同一 helper 在 3 个文件重复定义。
**修**:三处统一改 `market.name`(实测 activeSpotAssetCtx 接受两种记号),并收敛为一个 domain 工具。

### C1-同族 [P1,与 review_e0ab4854.md F1 交叉印证]. 图表 PURR perp→spot 切换解析成 perp
[tradingview-chart.tsx:297-302](apps/terminal/src/components/trade/chart/tradingview-chart.tsx) `getMarketForChartSymbol` **先查剥离后的 coin、后查原始 symbolName**,且 marketBySymbolRef 按渲染累积永不清理。先访问 PURR perp(写入键 "PURR")再切 PURR/USDC spot → resolveSymbol 的 coin="PURR" **优先命中 perp 键** → 图表拉 perp K 线,随后 symbol-switch 看门狗失败报错。测试盲区:现有测试是单市场键集且 symbolName 优先(与生产顺序相反)。
**修**:交换两个 lookup 顺序(symbolName 优先);补 "先 PURR perp 后 PURR/USDC spot" 组件级回归测试。此条已在 review_e0ab4854.md 以 F1 报告,本轮独立复现并补充了查找顺序层面的新证据。

## P2

- **A2. collateralToken 位置查找(latent)**:[use-markets.tsx:98](apps/terminal/src/lib/hyperliquid/markets/use-markets.tsx) `spotTokens[meta.collateralToken]` 同类混用。实测 9 个 builder dex 的 collateralToken(0/360/235/268)都 <458,位置==index 侥幸正确;未来某 dex 用高位 index 抵押 token 即错绑。与 A1 同一张 Map 一起修。
- **C3. spot 余额 USD 估值用 token 名查 allMids → 无同名 perp 的 token 估值恒 0**:[balances.ts:61-66](apps/terminal/src/domain/trade/balances.ts) `tokenUsdPrices?.[balance.coin]`,而 `balance.coin` 是 token 名("UBTC")。allMids 实测**无裸 token 键** → UBTC/UETH/USOL 等余额 USD 显示 0、spot 总值低估;HYPE/PURR 等碰巧命中**同名 perp** 的 mid(近似值)。**修**:建 token→spot market name 映射查 mids,或直接用已订阅的 spotAssetCtxs midPx。

## P3(显示层/死代码/边界)

| # | 位置 | 问题 |
|---|---|---|
| D1 | [tokens.ts:16-18](apps/terminal/src/domain/market/tokens.ts) | 剥 U 启发式 `slice(1)` 只剥一个字符:**UUUSPX(@193 真实上架)→ "UUSPX" 残留**(官方 CDN 两个名字的图标都不存在,名称错+图标破);**UNIT → "NIT"** 会经余额表 AssetDisplay 真实渲染(UNIT 在 tokens 数组内) |
| D2 | [config/tokens.ts:3](apps/terminal/src/config/tokens.ts) | ASSET_REPLACEMENTS 仅 USDT0→USDT 一条;**缺 XAUT0→XAUT**(@209 活跃,官方 CDN 证实官方显示 XAUT);启发式偏离官方"L1 name 检测重映射"方法论,建议显式映射表为主 |
| D3 | [use-markets.tsx:127-133](apps/terminal/src/lib/hyperliquid/markets/use-markets.tsx) | tokenByName 被 displayName 覆盖真名键(UMOG 覆盖 "MOG" 等 4 组):持原生 MOG 的用户余额表拿到 UMOG token,szDecimals 格式化位数错(仅显示;send 转账路径已核实走独立 map,安全) |
| D4 | [helper.ts:21-25](apps/terminal/src/lib/hyperliquid/markets/helper.ts) | `getMarketKindFromName` 把 PURR/USDC 判成 perp;全仓零调用(仅 re-export),死代码陷阱。删除或修为 `includes("/")∥startsWith("@")→spot` |
| D5 | [kline-chart.tsx](apps/terminal/src/components/trade/chart/kline-chart.tsx) 整树 | KlineChart + use-kline-*-overlays + kline-toolbar + chart-source-toggle **零引用死代码**;且其 builder 持仓兜底(剥前缀再查)与 API 实测相反(持仓 coin 恒带前缀),永不命中。建议整树删除 |
| D6 | [orders-tab.tsx:100-105](apps/terminal/src/components/trade/positions/orders-tab.tsx) | "全部撤单"时 `getAssetId(order.coin)` 失败的订单被静默过滤,极端时序漏撤无提示 |
| D7 | [position-row.tsx:69](apps/terminal/src/components/trade/positions/position-row.tsx) | delisted 市场持仓平仓按钮被禁用(getMarket 无映射);HL 通常强制结算,风险低 |
| D8 | [symbol.ts:5-13](apps/terminal/src/lib/chart/symbol.ts) | 理论:未来若出现名为 "hyperliquid" 的 HIP-3 dex 会被当交易所前缀误剥(当前无此 dex) |
| D9 | [domain/market/tokens.ts:26-38](apps/terminal/src/domain/market/tokens.ts) / display.ts:23-25 | getIconUrlFromPair / getBaseToken 仅 re-export 的死代码,误传 market.name 时产出垃圾值,建议删除或类型收紧 |
| 范围外 | [orders.ts:282-296](apps/terminal/src/domain/trade/orders.ts) | 价格格式化统一按 8 位小数截断,未实现官方 "perp ≤ 6−szDecimals、spot ≤ 8−szDecimals" 规则,低价 perp 可能被拒单(报错不损资金)。交易侧 agent 附带发现,建议单独处理 |

## 已穷尽核实无遗漏的正确面(四维度声明)

1. **交易侧(asset id)**:22 处 `useExchange` 调用 + 10 处 `a:` 字段构造逐一核对,恒为数字 `market.assetId`;modify/cancelByCloid/scheduleCancel/updateIsolatedMargin 零调用确认;持仓/挂单/成交/资金费/订单历史/TWAP × 桌面/移动 12 类消费点 coin 映射全部正确;PURR(10000)/UBTC(10142)/builderPerp(100000+) 三重实测。**无资金安全风险**。
2. **行情消费点**:l2Book×3、trades×1、candle×2、activeAssetData×1、activeAssetCtx×4、allMids×7、全量 ctx×2 逐一核对,除 C1/C3 外全用 `market.name`;无任何一处以 pairName/shortName 发行情请求;`useSubscription` 对 params 原样透传无转换。
3. **编号混用**:getSpotAssetId 唯一调用传 pair.index ✓;perp assetId=universe 位置(delisted 占位不挪)✓;builder 公式与 allPerpMetas/perpDexs 顺序逐一实测对齐 ✓;spot ctx 按 pair.index 稠密数组 312/312 全对 ✓;唯二混用即 A1/A2。
4. **重映射**:22 个 Unit token 全量枚举(19 正确 + UUUSPX/UNIT 两缺口 + AURA 天然正确);误伤扫描零命中(RUB/USDUC/UP/USDE 等不触发);USDT0 quote 重映射六 pair 全链路(余额匹配/路由/下单/订阅)无交易影响;UBTC 图标(BTC_spot.svg)与官方 CDN 一致;categoryMapping/搜索/isWrapped(零消费)无缺口。
5. **name 反推**:getBaseQuoteFromPairName 全部 4 个调用点约定正确;路由往返三类形态闭环;持仓/挂单/成交与 market.name 逐字节一致(API 实测);其余 split/startsWith 命中点均与市场名无关。

## 修复优先级建议(转交 codex)

1. **A1 + B1 必须一起修**(修 A1 会引爆 B1 的第 4 组撞名):token index Map 化 + pairName 冲突检测不覆盖 + 冲突市场路由退回真名。
2. **C1 三处 `@${index}` → `market.name`**(一行级 ×3,收敛 helper),连带 mobile-market-bar 的 mids 取键同修。
3. **图表 lookup 顺序交换**(symbolName 优先)+ PURR perp→spot 回归测试(与 review_e0ab4854.md F1 同项)。
4. **C3 余额估值键维度**:token→spot market 映射或改用 spotAssetCtxs。
5. P3 批次:XAUT0 映射条目、剥 U 启发式加固(循环剥/残留校验)、tokenByName 冲突不覆盖、getMarketKindFromName 与 KlineChart 死代码清理、撤单静默过滤提示。

> 更正（2026-09-14）：文中引用的 `apps/terminal/src/components/trade/chart/kline-chart.tsx` 已被删除，图表实现现为 `apps/terminal/src/components/trade/chart/tradingview-chart.tsx`；本文其余内容按原样保留。
