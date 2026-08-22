# 闭环审计报告(第八轮):c9c6843a `fix(markets): harden canonical asset identity`

> 方法:主审核对(SDK d.ts / 官方文档原文 / mainnet 只读实测)+ 3 个并行维度 agent(闭环+测试判别力 / 新逻辑边界+规范 / 官方语义+全链路实测)。全部结论基于 2026-07-16 mainnet 实测(spotMeta 472 tokens、meta、WS 订阅五形态、官方 CDN 图标、官方 app URL 行为)与官方 gitbook 文档原文。这是 codex 对 `review_market_symbol_numbering.md` 的闭环响应。

## 评分

| Commit | 评分 | 一句话结论 |
|---|---|---|
| `c9c6843a` fix(markets): harden canonical asset identity | **9 / 10** | 八轮审查以来质量最高:**10/10 行动项全部 FIXED**(附带实现范围外的价格小数规则),4/4 变异实验全红,官方文档/SDK 字段逐条对照全过,tsc 双包 exit 0、biome 32 文件全绿,还**顺带修复了一个 WS 实测证实的旧 bug**。扣分仅为 JSDoc 错挂等纳米级瑕疵与几个 latent 边界 |

## 官方文档 / SDK 字段核对(全部通过)

| 核对项 | 官方权威依据 | 实现 | 判定 |
|---|---|---|---|
| 价格小数上限 | tick-and-lot-size 原文:"no more than **MAX_DECIMALS − szDecimals** decimal places where MAX_DECIMALS is **6 for perps and 8 for spot**" | `HL_PERP_PRICE_MAX_DECIMALS=6`/spot 8;`isSpotAssetId`(10000-99999)判别;builderPerp(100000+)正确走 perp 分支(链上实价 `7.2151` ≤5 位交叉验证) | ✅ |
| 整数价豁免 | "Integer prices are **always allowed**, regardless of the number of significant figures" | ≥5 位整数 decimals=0 输出完整整数;**官方 Python SDK 等价式五值对照全一致**;对 123456 保留原值(官方 SDK 示例会圆成 123460)—— 两者皆合法,本实现更贴近用户输入 | ✅ |
| SDK 字段 | 0.33.1 d.ts:`MetaResponse.collateralToken: number`、`tokens[].index: number`、`deployerTradingFeeShare: string` | Map 化实现与测试 fixture 字段全部合法 | ✅ |
| 订阅 coin 形态 | WS 只读实测:`@107` ✓ ack、`PURR/USDC` ✓、`xyz:CXMT` ✓;**`@0` → Invalid subscription**、`HYPE/USDC` 显示名 → Invalid | 恒用 `market.name` —— **实测证实本提交顺带修复了旧 bug**(PURR 的 spot ctx 旧代码发 `@0` 一直是坏的) | ✅ |
| allMids 键语义 | 实测 `ALL_DEXS` 1163 键含全部 spot + builder 前缀键;`dex:"xyz"` 仅 102 键无 spot | `addSpotMarketPriceAliases` 键对齐;312 pair quote 全稳定币(USDC 295/USDT0 5/USDH 11/USDE 1),alias 当 USD 近似安全;**12 个多 quote base 全部含 USDC 对**,priority 2 恒胜顺序无关;8 个同名 perp 键被 spot mid 覆盖,经全消费链核实无 perp 语义消费,语义反而更准 | ✅ |
| 官方 app 消歧对照 | 浏览器实测:官方对 UMOG **不做显示 remap**(`/trade/UMOG/USDC` 原样显示);官方 `/trade/@107` 重定向到 perp | 我们 remap 后靠 `routeName=@N` 消歧 —— **方案不同构,各自自洽,记录为差异非错误**(官方文档亦明言 UI 可自行 remap) | ℹ️ |

## 闭环审计表:10/10 FIXED(+1 范围外附带)

| 上轮行动项 | 状态 | 关键证据 |
|---|---|---|
| A1 token index Map 化 | ✅ FIXED | `spotTokenByIndex` Map;fixture 用 index 845 稀疏 token;变异(a) 回退数组下标 → 测试红 |
| A2 collateralToken 同 Map | ✅ FIXED | 测试断言 quoteToken=SPARSE(index 845) |
| B1 pairName 撞名 | ✅ FIXED | `routeName` 字段 + 冲突回退 `@N` + `createMarketLookup` byPairName 只收唯一 + 选择器 spotApiToken 区分 chip;**4 组真实撞名(PUMP/MOG/MON/ANSEM)全覆盖**;变异(c) 删过滤 → 红 |
| C1 三处 `@${index}` | ✅ FIXED | 新 `market-identity.ts`,三处替换 + mids 取键连带修,全仓 `@${` 零残留 |
| C3 余额估值键维度 | ✅ FIXED | `useSpotTokenUsdPrices` + alias,三消费点替换;连 `getPnl` 的 token 名取键一并修复 |
| 图表 lookup 顺序 | ✅ FIXED | symbolName 优先;变异(b) 换回 coin 优先 → PURR 回归测试红(唯一守卫) |
| D1 剥 U 加固 | ✅ FIXED | `"Unit "` 带空格(UNIT 保名)+ `/^U+/`(UUUSPX→SPX);21 个 Unit 资产全对;SPX 无撞名(spot 无原生 SPX;perp SPX 存在但三条路径均不碰撞) |
| D2 XAUT0→XAUT | ✅ FIXED | 无撞名;`XAUT_spot.svg` 官方 CDN 实测 200 |
| D3 tokenByName 冲突 | ✅ FIXED | 三重防护(真名先占位/alias 不覆盖/撞名双方不建);getToken("MOG") 回归原生 |
| D4 getMarketKindFromName | ✅ FIXED | `includes("/")` 判 spot;被新测试消费,不再是死代码陷阱 |
| (范围外)价格小数规则 | ✅ 附带实现 | 15 个生产调用点**全部**传 `{assetId, szDecimals}`,grep 零遗漏 |

**路由往返**:`/trade/@43` 生成(fallthrough 到通用分支,encodeSegment 保留 @)与解析(startsWith("@")→byName)完整闭合;旧冲突 URL fail-closed 跳默认市场 —— 相比修复前打开错误市场下错单,资金安全优先。
**测试基线**:全量 448/450 绿(1 失败为未跟踪幽灵探针 tmp-stale-t-probe,与本提交无关;1 skip 为 soak)。

## 发现的问题(全部 P3/信息级,不阻塞)

1. **JSDoc 错挂**:[orders.ts:297-306](apps/terminal/src/domain/trade/orders.ts) `PriceFormatOptions` interface 插在文档块与 `formatPriceForOrder` 之间,函数 hover 失去说明。interface 移至 JSDoc 之前即可。
2. **冲突 pair 旧 URL 静默跳转**:`/trade/MOG/USDC` 书签现跳 `/trade/BTC`(跨 scope、零提示)。建议补一次性提示或落到 spot 默认市场。
3. **图表符号 map 一致性**:`marketBySymbolRef` 仍以 pairName 建键且累积不清理,先后访问两个 "MOG/USDC" 市场后显示名键指向后访者(风险极低:applied symbol 恒为唯一 market.name),可与 createMarketLookup 同法过滤。另 `market-route.ts:83` fallback 用 `market.name` 而非 routeName(当前恒等价,一致性建议)。
4. **理论边界**:szDecimals≥5 perp + 价格 <0.05 时格式化可产出 `"0"` 被交易所拒单(mainnet 实测无此参数组合;建议对 "0" 且输入>0 抛错,与既有风格一致)。
5. **latent**:`/^U+/` 对未来 "UUNI"(Unit Uniswap)类资产会剥成 "NI"(当前 21 个全对);根治靠显式映射表或剥后校验。
6. **信息级**:`dex:"ALL_DEXS"` 是官方文档未记载的服务器特性(实测有效,1163 键);建议注释标注实测依据日期,防官方静默移除。
7. **纳米级**:`TokenUsdPrices` 的既有 JSDoc 在 alias 语义下轻微过时;`balances.test.ts` fixture 用 `as never`;`use-spot-token-usd-prices` 的 useMemo 按 Compiler 规则可省略(与既有先例风格一致,保留无害)。

## ⚠️ 独立资金级缺陷(审查过程发现,先于本提交,**已修复**)

**`formatDecimalFloor` 整数尾零剥除缺陷** —— [numbers.ts:83-85](apps/terminal/src/lib/trade/numbers.ts) 的 `.replace(/\.?0+$/, "")` 在 szDecimals=0(toFixed 无小数点)时吃掉整数自身尾零:

- **复现**(node 实测,主审独立复现确认):`(100,0)→"1"`、`(10,0)→"1"`、`(1000000,0)→"1"`、`(0,0)→""`;`(105,0)→"105"`、`(100,2)→"100"` 正常。
- **影响面**:它是 `formatSizeForOrder`(**实际发往交易所的 `s` 字段**)的实现;mainnet 有 **97 个 szDecimals=0 的 perp**(DOGE/XRP/ADA/WIF/kPEPE…)→ 整十/整百下单或平仓**静默缩水**(卖 100 DOGE 实际下单 1 DOGE)。方向是缩水不会超卖,但属严重错单。另波及 position-limit-close 平仓默认值与表单显示。
- **归因**:git 核实父提交同款代码,**先于 c9c6843a 存在,非其引入**;对照:c9c6843a 自己的价格尾零剥离([orders.ts:326-327](apps/terminal/src/domain/trade/orders.ts))用 `decimals===0` 提前 return,是安全写法。
- **修复**:已随本报告落库 —— `e428be97 fix(trade): keep integer trailing zeros in order size formatting`(仅对含小数点的字符串剥尾零),含 6 断言回归测试;**变异验证**:去修复 → 新测试红;全量真实套件绿、tsc 清零。
- 披露:该修复提交被 lefthook lingui-extract 卷入了 6 个 .po 文件的机械 msgid 同步(codex 已入库源码的 catalog 对齐,如 account-mode 文案、"Unknown symbol: {0}"),内容无害,按惯例如实记录、不改写历史。

## 做得好的(保持)

- **Map 化与撞名双修的联动处理正确**:上轮警告"修 A1 会引爆第 4 组 ANSEM 撞名",本提交同时落地 routeName 机制,4 组冲突全部覆盖 —— 没有踩联动陷阱。
- **测试判别力满分**:4/4 变异全红且各为精确单点命中(无永绿装饰测试);fixture 特意用稀疏 index 845 复刻生产语义("错位才暴露、对齐即侥幸")。
- **fail-closed 哲学一致**:byPairName 冲突不猜测、旧 URL 不落错市场、`?? market.pairName` 兜底让未补 routeName 的旧 fixture 运行时安全。
- 对官方"整数价恒合法"条款的利用比官方 SDK 示例更优(保留用户原值)。
