# 根因分析报告:TradingView 图表对 HIP-3(XYZ)资产显示"出错了" —— 裸 coin 到达 candleSnapshot

> 方法:5 维多 agent 调查(entry-paths / race-timeline / api-contract / fix-design / regression-history)+ 每条发现 2 名独立反驳者,47 agent(2 个连接中断)。验证手段:**mainnet info/WS 端点只读实测**、临时 vitest 探针精确复刻 datafeed 回调链(已删除)、TradingView bundle 反汇编、git blame/log 回归考古。触发场景:用户报告 builderPerp 资产(如 `xyz:CXMT`)冷加载图表"出错了/重试",点重试有时恢复。

## 结论摘要(先读这段)

**代码里确实存在一条能让裸 coin `CXMT`(丢失 `xyz:` 前缀)到达 Hyperliquid `candleSnapshot` 从而 HTTP 500 的真实缺陷链**,已用 curl 实测 + 单测复现证实。**但根因归属需要一个诚实的修正**:该链的触发前提(TV 以展示名变体回喂 `resolveSymbol`)在当前 TV 配置下,经 bundle 反汇编 + dev 实机打点(16+ 次全是规范 ticker),**未能在真实应用流程中复现**。因此这是一个**真实且危险、但触发条件苛刻的健壮性缺陷**,而非已证实的用户冷加载根因 —— 用户看到的"出错了/重试"浮层更可能来自 symbol-switch 看门狗路径(codex 已用 `0c586ed4` 改了其呈现,但未修此缺陷)。无论根因归属如何,这条链一旦触发后果严重(500,甚至 WS 重连风暴),**应当修复**。

## API 合约(已实测确认,用户判断正确)

| coin 值 | HTTP | 结果 |
|---|---|---|
| `CXMT`(裸,无前缀) | **500** | `null` |
| `@CXMT` | **500** | `null` |
| `XYZ:CXMT`(大小写错) | **500** | `null` |
| `xyz:CXMT`(正确) | 200 | 正常 K 线 |
| `BTC` / `HYPE` | 200 | 正常 |

WS 层更危险(实测):裸 coin 的 candle **订阅会被服务器 close 1006 杀掉整条共享 WebSocket**,连同一连接上正常的 BTC 数据流一起断。

## 缺陷链(已单测复现)

1. **展示名换代引入不可逆映射**(REG-1,根因):builderPerp 的展示名 `pairName` 现在是 `CXMT-USDC`(`market-symbol.ts` 明确剥掉 dex 前缀)。若 TV 以交易所前缀+展示名(`HYPERLIQUID:CXMT-USDC`)回喂 `resolveSymbol`,`coinFromSymbolName`([symbol.ts](apps/terminal/src/lib/chart/symbol.ts))先剥 `HYPERLIQUID:` 再剥 `-USDC` → 裸 `CXMT`,**dex 前缀不可逆丢失**。
2. **市场键表 miss → 兜底成裸 coin**:`getSelectedMarketSymbolInfo` 的三级查表 `marketBySymbolRef` 键只有 `["xyz:CXMT","CXMT-USDC","xyz:CXMT/USDC"]`(`getChartMarketKeys` 产物,单测确认),**不含交易所前缀变体、也不含大小写变体** → 全 miss → [datafeed.ts:234](apps/terminal/src/components/trade/chart/datafeed.ts) `apiTicker = resolvedSymbol?.ticker ?? coin` 退化为裸 `CXMT`。
3. **fail-open 放行**(F3/FIX-2,使能条件):[datafeed.ts:112-114](apps/terminal/src/components/trade/chart/datafeed.ts) `isKnownCoin` 的 `catch { return true }` —— meta 请求失败时**任意裸 coin 无条件放行**。meta 成功时裸 coin 会被拦在 resolve 阶段报 "Unknown symbol";只有 meta 恰好失败才漏到 candleSnapshot 500。
4. → `getBars` → `candleSnapshot({coin:"CXMT"})` → **500**。

**为何"重试"能恢复**:冷加载是 meta 最易失败的时刻(与 spotMeta/perpDexs/candleSnapshot 并发)。meta 一旦成功,`metaCache` 永久缓存(注:`metaCache` 无 TTL,`fetchedAt` 写入后从未被读取),裸 coin 即被正确拦截;重试同时消除了 markets/meta/脚本缓存三个时间敏感因素。

## 严重度分歧(必须诚实呈现)

F1(裸 coin 主链)被一名反驳者从 **P0 降到 P2**,依据是**反汇编 TV bundle** 的结构性反证,值得 codex 知晓:
- TV 启用了 `pay_attention_to_ticker_not_symbol` featureset 且 datafeed 恒设 `ticker` → TV 内部二次 resolve 都用规范 `full_name="xyz:CXMT"`,**不会构造 `HYPERLIQUID:CXMT-USDC` 变体**;
- 所有会产生"交易所前缀+展示名"输入的 TV 入口(symbol search / quick search / compare / saveload / localStorage)在 `config/chart.ts` 中**全部禁用**;
- **dev 实机打点 16+ 次 `resolveSymbol` 输入全是规范 ticker,零变体**;
- **症状不完全对齐**:用户报告的"出错了/重试"浮层由 `initError` 驱动(仅 widget 构造异常 或 symbol-switch 看门狗超时两处点亮),而裸 coin 缺陷的直接后果是 `getBars` 500(空图),不直接点亮该浮层。

**综合定性**:缺陷代码真实存在(单测能触发)、后果严重、应修;但"它 = 用户这次看到的出错"证据链未闭合。取 **P1**(真实缺陷 + 严重后果,但触发条件苛刻)较为公允。不能排除生产环境边缘情况(service worker 缓存旧 bundle、未来 TV 版本行为变化、`@n`/大小写非法值经其他入口进入)触发该链。

## 与 codex WIP / 生产的关系

- **`tv_stability_fix.diff` 已随 `0c586ed4 fix(chart): stabilize tradingview symbol flow` 落库**,修的是**另一失败模式**(service worker 缓存策略 + ready 看门狗)。它只改变了**症状呈现**:裸 coin 解析失败此前经 12s ready-timeout 显示"出错了/重试",之后呈现为最长 45s 的 "Loading..." 软提示 —— **HIP-3 显示名→裸 coin 的解析缺陷仍在,未修**。本报告的修复与它**互补、无文本/语义冲突**(FIX-1 触及 `tradingview-chart.tsx:297-319`,不在 `0c586ed4` 的看门狗 hunk 内;FIX-2 所在 `datafeed.ts` 该提交完全未动)。
- ⚠️ **`0c586ed4` 还删除了旧的 `symbolToCoin` 恢复映射**(REG-4,displayName→apiTicker 记忆),削弱了这条链的第二道防御。恢复它可作为纵深防御。
- **生产部署 commit `53f6a82` 与 HEAD 同根因**(REG-3):它含相同的 `stripQuoteSuffix` + `apiTicker` 兜底 + `catch-true`。`main` 分支不含此链(仅 `test-pr102`)。修复合入本分支重新部署即覆盖生产。(注:"53f6a82 已部署"来自会话记录,git 无部署标记可交叉验证 —— 建议此后 deploy 成功后打 git tag 使生产 commit 可审计。)

## 修复方案(最小、可测,按优先级)

| # | 修复 | 位置 | 说明 / 风险 |
|---|---|---|---|
| **FIX-2** | `isKnownCoin` 的 catch 改 fail-closed | [datafeed.ts:113](apps/terminal/src/components/trade/chart/datafeed.ts) `catch { return false }` | 单测证明这是裸 coin 到达 candleSnapshot 的必要条件。⚠️ **误伤**:瞬时 meta 故障会让 resolve-miss 的合法标准永续也变 "Unknown symbol",**不能简单翻转** —— 需结合区分错误类型 或 300ms 退避重试;且 codex WIP 也在碰这行,需协调 |
| **FIX-1** | 键表归一化 | `getChartMarketKeys` + `getMarketForChartSymbol` | 补 `${EXCHANGE}:${key}` 变体 + 大小写不敏感查表(map 存大写键、查大写),使 `HYPERLIQUID:CXMT-USDC` / `XYZ:CXMT` 都命中当前 market、返回规范 ticker `xyz:CXMT`。同时收紧 resolve:getSymbolInfo miss 且输入是展示名形态(被剥过 quote 后缀)时直接 onError,不把剥离产物当 API ticker |
| **WS-1** | 订阅入口校验 + 熔断 | `subscribeBars` + `subscribe-with-reconnect.ts` | (1) `subscribeBars` 入口对 coin 做与 resolve 相同的正向校验,不过不调 `store.subscribe`;(2) 同一 streamKey 秒级连续失败 N 次(如 3)即标记永久失败停止重连,防止坏订阅把共享 socket 拖入全应用重连风暴 |
| **F6/FIX-5** | 收紧 `stripExchangePrefix` 启发式 | [symbol.ts:5-17](apps/terminal/src/lib/chart/symbol.ts) | 删除 `beforeColon === beforeColon.toUpperCase() && length > 4` 分支(会误剥合法的大写 dex 名),改为仅剥已知交易所名(`=== "hyperliquid"` 或比对 `CHART_EXCHANGE`);dex 前缀判定交给键表而非字符串猜测 |
| **KNOWN-2** | `dex:coin` / `@n` 正向校验 | `isKnownCoin` | 现在对任何含 `:` 或 `@` 一律免检放行(`@CXMT` 实测也 500)。按 dex 缓存 `meta({dex})` 或复用应用 unified markets 做存在性校验,失败走 onError |
| **REG-2** | 补回归测试(必做) | `chart-datafeed.test.ts` + `chart-symbol.test.ts` | 现有 14 个相关测试**完全没覆盖 getSymbolInfo 未命中的兜底链**,bug 存在时防线全绿。补:createDatafeed 不传 getSymbolInfo + `resolveSymbol("CXMT-USDC")` + `meta.mockRejected`,断言 **candleSnapshot 绝不以裸 CXMT 被调用**;补 `"CXMT-USDC"` 形态的 symbol 层用例 |

**修复后的整体不变量**:`resolveSymbol` 产出的 ticker 要么是规范名(`@…` / `dex:…` / meta universe 成员),要么走 onError —— 裸未知 coin 在任何时序下都不可能到达 candleSnapshot 或 candle WS 订阅。

## 被驳回项(记录以防复提)

- **F2/KNOWN-2 "含 `:` 即无条件信任"定为高危**:降级 —— 需要非法值先进入 resolveSymbol(手输 compare / TV 恢复陈旧 symbol),当前入口禁用,触发概率低,后果限于图表。
- **FIX-1 定为"P0 推荐主修复 / 解释用户冷加载症状"**:两票驳回其**定性**(不是驳回代码事实)—— 键匹配 miss → 裸 coin 是确定性事实且单测复现,但在当前 TV featureset 下无生产者构造该输入,故它是健壮性加固而非已证实的用户症状根因。**修复本身仍应做**。
- **F5 "pairName 同名冲突把展示名解析到错误市场"**:驳回,主 perp 与 HIP-3 pairName 实际不冲突。

## 做得好的 / 现状
- 标准永续(BTC/ETH/HYPE)与正确前缀路径(constructor symbol 恒为规范 `xyz:CXMT`)工作正常,冷加载正常路径 dev 打点确认 candleSnapshot 成功。
- 缺陷仅限图表 datafeed(getBars + subscribeBars 同源),订单/持仓等其他面板无同类裸 coin 风险(REG-5,`coinFromSymbolName` 消费面已核查)。
