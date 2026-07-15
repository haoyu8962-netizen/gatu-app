# 对抗式审查报告(第五轮):43ba3f5f `fix(trade): use exchange-reported order availability`

> 方法:5 维独立 finder(API 字段语义 / owner 守卫 / 语义回归 / loading 接线 / 测试判别力)→ 每条发现 2 名独立反驳者多数决。32 agent(1 个 verify 因 ECONNRESET 失败,不影响结论)。验证手段:官方文档 MCP 检索、**mainnet info 端点只读实测(真实持仓地址)**、数值交叉验证、变异实验(实验后工作区已恢复)。

## 评分

| Commit | 评分 | 一句话结论 |
|---|---|---|
| `43ba3f5f` fix(trade): use exchange-reported order availability | **8 / 10** | 方向反转正确(信任 exchange 权威可开仓额、不再用 spot 高估)、**API 字段方向用对了、无资金安全问题**、新增 owner 守卫正确、测试对方向索引有真实判别力。扣分:isStale 耦合把"订阅陈旧"当成"禁止下单"(旧代码保留 last-known-value);核心门控层零测试覆盖;2 个 P3 边界(spot error 屏蔽为永久 Loading、冷启动闪现 $0.00+Deposit) |

## 用户三个核心问题的直接回答

### 1. API 字段是否正确 —— ✅ 正确,无 P0 资金安全问题

`activeAssetData.availableToTrade` 与 `maxTradeSzs` 是 **`[buy/long, sell/short]` 方向元组**(index0=买/多方向,index1=卖/空方向)。项目代码(`derive.ts` 的 `[availableLong, availableShort]`、`size.ts` 的 `maxTradeSzs?.[isBuy ? 0 : 1]`、`use-asset-leverage.ts` 的 `raw[0]/raw[1]→long/short`)一律按此解构,**完全正确**。

⚠️ **SDK 0.33.1 的 d.ts 注释 `[min, max]` 是错误的**(`esm/api/info/_methods/activeAssetData.d.ts` 的 "Maximum trade size range [min, max]" / "Available to trade range [min, max]" 是 nktkas 作者的不准确标注,与上一轮发现的 spotState `isPortfolioMargin` 过时注释同类先例)。四重证据确认项目对、SDK 注释错:

- **官方文档**(perpetuals#retrieve-users-active-asset-data):对无仓位 cross 账户返回两个**相等**值(`["24836370.44","24836370.44"]`)—— 对方向对称天然成立,但对 `[min,max]` 而言 min 恒等于 max 不合理;
- **mainnet 实测**(只读 info 端点,持空头 HYPE 的地址 `0x5b5d...c060`):返回 `maxTradeSzs:["901521","310859"]`,**index0 > index1** —— 空头账户买方向(平空+反手)容量本就大于卖方向;而 index0>index1 对 `[min,max]`(要求 min≤max)**根本不可能**,直接证伪 SDK 注释。SOL/ETH 同为空头亦 index0>index1;
- **数值交叉验证**:`availableToTrade_long(12.24M) ≈ maxTradeSzs_long(901521) × markPx(67.918) / leverage(5)`,证明 availableToTrade≈方向性可用保证金(USD)、maxTradeSzs≈方向性最大 base 张数;字段名为复数 "maxTradeSzs"/"availableToTrade"(每方向一个),非区间;
- **变异实验**:把 `size.ts` 的 `[isBuy?0:1]` 翻转成 `[isBuy?1:0]`,新测试 "uses directional exchange limits" 立即失败 —— 测试对方向索引有判别力。

### 2. builderPerp coin "xyz:MU" 的 owner 守卫是否会永久 mismatch —— ❌ 不会

新增的 `getAssetAvailabilityStatus`(`availability.ts`)用 `data.coin === coin && data.user.toLowerCase() === user.toLowerCase()` 做身份守卫。builderPerp 的 `market.name = "xyz:MU"`(dex:asset 形态),订阅 `coin` 传该值。实测确认 exchange 返回的 `coin` 字段与 `market.name` **同源同形态**,`data.coin === coin` 能匹配,不会永久 mismatch。测试 fixture 也用 "xyz:MU" 同源。

**唯一残留提醒**:`coin` 走大小写敏感比较(`===`),`user` 走大小写不敏感(`.toLowerCase()`)。这个不对称设计本身正确(coin 与 market.name 同源同大小写,user 是地址应不敏感),但若未来交易所回显大小写漂移,coin 守卫会永久 loading → 无法下单。建议补一条大小写敏感的显式用例钉住该契约。

### 3. 错误的编码 / 遗漏的地方

**无功能性错误编码。** 字段方向、owner 守卫、字符串→数字转换(`toNumber`,既有模式非本提交新增)、状态机转换均正确。以下为确认的边界瑕疵与遗漏。

## 确认的问题(按优先级)

### P2 — isStale 耦合:把"订阅陈旧"当成"禁止下单"(反驳者意见分裂,值得关注)
`availability.ts` 对 `isStale` 返回 "loading" → `use-asset-leverage.ts:82` `currentActiveAssetData = normalizedStatus==="success" ? activeAssetData : undefined` → maxSize/availableBalance 清零、表单禁用、Available 显示占位符。**旧代码 staleness 时保留 last-known-value 继续可下单。** staleness 阈值:`activeAssetData` 20s、`spotState` 无专门配置走默认 30s(`reliability.ts`;同类用户流 webData2/webData3 有 60s)。

- 风险场景:**HIP-3 盘后 / 清淡 builderPerp 推送稀疏**,超阈值即把有资金用户的下单表单误禁用(staleness 虽触发 reconnect,但恢复前有空窗);
- 反驳方:worst-case 被夸大,健康连接下 spotState 约每 5s 推送、isStale 极少触发,reconnect 很快恢复;支持方:清淡市场真实可触发。
- **建议**:staleness 降级为软提示(`subscriptionStatus==="active"` 且身份匹配时,即使 isStale 也沿用其 maxTradeSzs/availableToTrade,维持 last-known-value),仅用于"数据可能过期"提示而非禁用下单;spotState 同理,`isSpotStateStale` 不应并入门控;或给 spotState 配一个匹配真实推送节奏的专门阈值。

### P2 — 核心门控机制零测试覆盖
`isAvailabilityLoading` / `isSpotStateLoading` 全仓 grep 命中 0(仅 `getAssetAvailabilityStatus` 有单测)。变异实验证实 order-entry 单测只钉 `deriveOrderEntry` 的数值 0,不触及门控层。建议补 `isAvailabilityLoading` 针对性测试(perp 且 subscriptionStatus!=="success"→true;spot 且 isSpotStateLoading→true;两者就绪→false;isConnected=false→false),或对 `trade-form-fields` 的 `isFormDisabled`/占位符做组件级断言。

### P2 — getAssetAvailabilityStatus 单测遗漏分支
`order-entry.test.ts:179-190` 只测 loading/success,遗漏 `subscriptionStatus:"error"→"error"` 与全部 idle 守卫分支(`isConnected:false` / `isPerpMarket:false` / `coin:undefined` / `user:undefined`→"idle")。补齐即可。可选:补一条 coin 仅大小写不同的用例(见问题 2 的契约)。

### P3 — spot 订阅 error 被屏蔽为永久 "Loading balances..."
`isSpotStateLoading = spotStatus!=="active" || !spotState || isSpotStateStale`,对 `spotStatus==="error"` 也为 true;而 `isLoading` 并入了 `isSpotStateLoading`,`balances-tab.tsx` 的 `renderPlaceholder` 先判 `if (isLoading)`(210) 后判 `if (hasError)`(211)→ **终态 spot 订阅错误(如订阅上限错误,不再回到 subscribing)会永久显示 "Loading balances..." 而 "Failed to load balances." 不可达**;同一 root 也会让 spot 下单表单永久禁用。修:`isSpotStateLoading` 限定真正加载态(排除 error),或让 `spotStatus==="error"` 只走 hasError,或调换 `renderPlaceholder` 判定顺序(先 hasError 后 isLoading)。

### P3 — 冷启动 market 未解析时闪现 "Available $0.00" + Deposit CTA
`market` 尚未解析(kind 未知)时 isSpotMarket/isPerpMarket 都为 false → `isAvailabilityLoading=false` → `deriveOrderEntry(market=undefined)` 得 availableBalance=0 → 已连接用户瞬间看到 "Available $0.00" + Deposit 按钮(旧代码的 `accountBalancesLoading` 掩盖了此窗口)。表单因 `availableBalance<=0` 仍整体禁用,**无下单额度算错、无资金暴露**,纯属亚秒级视觉闪烁(仅在持久会话硬刷新、钱包先于 markets meta 就绪时)。修:`isConnected && (!market || (isSpotMarket && isSpotStateLoading) || (isPerpMarket && subscriptionStatus !== "success"))`。

## 被驳回项(记录以防复提)
- **[long,short] 与 SDK "[min,max]" 注释矛盾**:两票驳回 —— 方向语义已通过官方文档+实测确认项目用法正确,这不是缺陷而是"代码正确"的确认(SDK 注释才是错的)。
- **staleness 禁用下单 = P0**:降级,表单只是禁用而非算错额度,无资金暴露(→ 归入上方 P2 isStale 耦合)。
- **toNumber 偏离 keep-strings 精度约定**:既有模式,本提交未新增,且用于 UI 计算的数字转换在边界处可接受。
- **"uses directional exchange limits" 测试固化错误索引假设**:驳回 —— 该假设经实测证明是**正确**的(index0=buy/index1=sell),测试固化的是正确契约。

## 做得好的(保持)
- 方向反转正确:`activeAssetData.availableToTrade` 是官方权威可开仓额,加载期显示 loading 比用 spot balance 高估更安全 —— 符合此前账户对账结论(unified 账户资金全在 spot、官方 app 对开仓占满显示 withdrawable=0)。
- 新增 owner 身份守卫(coin/user 匹配 + active + !isStale + data 存在才算 success),是正确的防串台模式(切市场/切账户时旧 coin 的 stale data 不会被误用)。
- 移除 `usesSharedQuoteBalance`/`sharedQuoteAvailable`/`accountAbstraction` 入参彻底,无遗漏消费者。
- 测试对方向索引有真实判别力(翻转索引即红)。
- **API 字段用对了,SDK 自己的注释反而是错的** —— 这次是项目正确、上游文档有误的少见情形。
