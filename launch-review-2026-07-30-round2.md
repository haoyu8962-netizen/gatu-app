# Sairn 交易终端上线审查报告(第二轮)

- 审查对象:`test-pr102` @ `270731b5`(比第一轮 `14f4368a` 多 23 个 commit)
- 上一轮报告:`launch-review-2026-07-21.md`
- 本轮方式:12 维度并行只读审查 → 每条 high/medium 逐条对抗性核实(含查官方文档 + 查 SDK d.ts)→ 文档/字段一致性批判 → 关键项人工复核
- 本轮规模:35 个 agent、约 340 万 token
- 本轮两个硬性动作:核对官方 Hyperliquid 开发文档(`hyperliquid-docs` MCP)、核对当前 SDK 字段(`@nktkas/hyperliquid@0.33.1` valibot schema)

---

## 一、结论:基线明显变好,但拦截项修复很不均衡

**好消息 —— 基线健康度大幅提升:**
- 测试 **628 → 821 全通过**(新增大量 reconciliation / tracking 单测)
- `pnpm typecheck` **从失败变为通过**(上一轮的 viem 五重解析问题已解决)
- 新增了一批本该有的机制:cloid 幂等下单、order/twap 对账、request-scheduler、exclusive-browser-lock(多标签互斥)、query-retry(429 处理)、`/build-meta.json` 版本端点、`/risk` 风险披露页、sitemap.xml、og 图、production-build CI

**坏消息 —— 上一轮 7 项拦截只修好了 2 项半:**

| 拦截项 | 状态 | 说明 |
|---|---|---|
| B1 下单超时+无幂等 | ✅ **已修复**(留一个回归缺口) | cloid 幂等 + 对账已上线,SDK 字段核对一致;但 >2 分钟重开场景对账退化(见 §三.1) |
| B4 Transfer/Send 余额算法 | ✅ **已修复** | 已改用 `withdrawable`,与 Balances 表口径一致;spot 侧残留一处小不一致(low) |
| B3 可观测性+kill switch | ⚠️ **部分** | 新增 `/build-meta.json`;仍无错误监控、无 kill switch |
| B2 错误边界+错误上报 | ❌ **未修复** | 全仓仍零 ErrorBoundary/errorComponent、零上报 |
| B5 手机同步明文凭据 | ❌ **未修复** | QR 仍是明文 bearer 凭据,UI 仍称 "secure";仅加了一句 "cannot withdraw" |
| B6 geo 合规 | ❌ **基本未修复** | 4 个子缺口全在:positions 入口无门控、embedded 入金无 geo、缅甸/占领区未封、isResolving 无人用 |
| B7 agent 私钥登出不清 | ❌ **未修复** | `disconnectWallet` 仍不调用 `clearAgent` |

**SDK 字段核对结果:总体一致,质量很好。** exchange 侧 order/cancel/batchModify/twapOrder/twapCancel/updateLeverage/approveAgent/approveBuilderFee/usdClassTransfer/spotSend/withdraw3 全部字段名、枚举值、必填性、cloid 长度(34)、builder fee 上限(1000)、TWAP 时长(5-1440)逐条命中 SDK 0.33.1 定义。**只发现一个字段级瑕疵**(见 §四)。

**官方文档核对结果:发现两处费率展示与官方规则不符**(现货买单 builder fee、AQA 折扣),见 §三.2 / §四。

---

## 二、结论:本轮不新增资金损失级 blocker,但合规与运维两块的旧账仍在

本轮 confirmed 18 条:**0 blocker、3 high、9 medium、6 low**(另 3 条被对抗核实推翻、1 条 uncertain)。

没有新的资金直接损失路径 —— 上一轮那几条(下单重复开仓、余额算法错)已经修好。但 §一表格里 ❌ 的四项(B2/B5/B6/B7)仍然是上线前应该拍板的东西,尤其 **B6 合规**(条款声称阻断、实现未阻断)和 **B7 私钥登出不清**。

---

## 三、本轮最值得看的两条(均已人工验证)

### 三.1 [回归] 新对账机制在"重开超过 2 分钟"时不查订单状态就判未确认

`apps/terminal/src/components/trade/order-reconciliation.tsx:39`

这是 B1 修复本身引入的缺口。持久化恢复(刷新/重开标签页)是这次修复的核心目标之一,但恢复路径有洞:

- 第 34-55 行的 effect 在**任何轮询之前**先跑 `markExpiredSubmissions(eligible, now)`:只要 `now - createdAt >= 2 分钟`,该挂起单立刻被标记 `unconfirmed` 并弹出"交易所未返回最终订单状态"警告
- 而唯一调用 `info.orderStatus` 的轮询(第 80-89 行)过滤条件是 `now - createdAt < 2 分钟`,**恰好把这些超期单排除**

所以:用户下市价单收到含糊响应(超时/5xx),订单其实已在链上成交;用户 2 分钟后才重开 App —— 恢复逻辑**一次 orderStatus 都不查**,直接报 unconfirmed。而 `orderStatus` 明明能用 cloid 直接查到真实状态(SDK `orderStatus.d.ts` 的 oid 字段接受 cloid)。

影响:恢复路径给出误导性"未确认"提示(实际已成交),文案虽提示先看持仓再重试,仍可能诱导重复下单。属 medium —— B1 主路径修好了,只是持久化恢复在 >2 分钟场景退化。

> 我已核对源码确认:line 39 的 `markExpiredSubmissions` 在 line 80-89 轮询之前执行,line 86 的窗口过滤把超期单排除。

### 三.2 [官方文档核对] 现货买单摘要仍展示 0.01% Builder Fee,但 HL 现货买方不收该费

`apps/terminal/src/components/trade/tradebox/order-summary.tsx:91`、`scale-order-summary.tsx:77`

官方 builder-codes 文档明确:**"builder codes do not apply to the buying side of spot trades but apply to both sides of perp trades"**。

`OrderSummary` / `ScaleOrderSummary` 都只凭 `DEFAULT_BUILDER_CONFIG?.f`(恒为 10)无条件渲染 `Builder Fee 0.01%` 行,组件既不接 `side` 也不按 `marketKind` 区分。因此现货买单(限价/市价/scale 买)实际不收 builder 费,面板却仍显示 0.01%。

同一个团队在 swap 路径**已经正确处理了这一点**(`swap.ts:208` `isBuying ? grossReceive.times(0) : ...`),订单面板却漏了 —— 内部不一致。方向偏保守(展示了实际不收的费),但对所有现货买单系统性高估。

---

## 四、SDK / 官方文档核对的其余发现

- **[medium|balances] 统一账户跨非 USDC 抵押的 builder dex 时,保证金率/杠杆公式与官方不符** — `domain/trade/balances.ts:142`。`getPerpRiskSummary` 把各 dex 的 `totalNtlPos` 与 `crossMaintenanceMarginUsed` 直接相加,不按抵押币折算美元;而官方 `account-abstraction-modes` 的 `computeUnifiedAccountRatio` 是按 `collateralToken` 分组、逐抵押币算再取 MAX。仅当统一账户在非 USDC 抵押的 HIP-3 dex 有持仓时失真,USDC-only 账户不受影响,是展示型风险指标。
- **[low|fee] 未实现官方 aligned quote asset(AQA)费率折扣** — `domain/trade/fees.ts:26`。AQA 计价市场手续费显示偏高约 20%。
- **[low|SDK] 本地 `OrderTimeInForce` 枚举含 SDK 不存在的 `"LiquidationMarket"`** — `lib/trade/types.ts:40`。SDK order schema 的 tif picklist 只有 `Gtc/Ioc/Alo/FrontendMarket`。目前该值未用于实际下单路径,是死枚举,但会误导。
- **[low|fee] HIP-3 `deployerFeeScale` 缺省取 `"1"` 会把费率翻倍** — `use-markets.tsx:129` + `fees.ts:20-23`。`getHip3DeployerFeeScale` 对 `>=1` 的值返回 `×2`,所以字段缺失回落到 `"1"` 时费率 ×2;安全缺省应为 `"0"`(→ ×1)。**我已人工验证这条逻辑**。只影响 HIP-3 builder 市场且仅在该字段缺失时,属费率展示估算,故 low —— 但正好落在你关注的费率区,建议确认 HL 对"未设置 deployerFeeScale"的真实语义。
- **[low|文档耦合] 全站约 13 处订阅/信息请求依赖未文档化的 `dex: "ALL_DEXS"` 魔法值** — `config/app.ts:25`。当前实测可用,但不在官方 WS 订阅文档定义内,属隐性后端耦合;若 HL 改动该约定,positions/twap 列表会静默变空。

---

## 五、旧问题仍未修(按拦截项归类,均已人工或对抗核实)

### B2 [high] 全仓仍无错误边界 + 零错误上报
`routes/__root.tsx:33`、`router.tsx`。`ErrorBoundary/errorComponent/componentDidCatch/defaultErrorComponent` 在 `apps/terminal/src` + `packages/*/src` **零命中**(连测试都没有)。TanStack 内置的路由级默认边界兜不住 `Wrap` 里的 RootProvider(Privy/Wagmi/QueryClient/HyperliquidProvider)抛错 —— provider 崩仍整页白屏,且任何崩溃无上报。

### B6 [high] geo 封锁在产品层面基本形同虚设
`positions/balances-tab.tsx:201` 等。整个 `components/trade/positions/` 目录对 geo 零命中:Balances 行的 **Swap(真实下单)、Send(等效提现)、To Spot/To Perp 转账、TP/SL、Reverse(实质新开反向仓)** 全部无门控;`hooks/trade` 与 `lib/hyperliquid` 的低层 hook 也没有拦截。geo 目前只在 `trade-panel.tsx` 主买卖按钮一处生效。

配套三条 geo 子缺口(均 confirmed):
- **[medium] 缅甸/克里米亚/顿涅茨克/卢甘斯克未封** — `config/geo.ts:9`。`TRADE_RESTRICTED_COUNTRIES` 无 `MM`,`TRADE_RESTRICTED_REGIONS` 只有 `CA:["ON"]`。而 `terms.md:96` §2.2(b) 明列这四个,`geo.ts:3` 注释还自称"Keep this in sync with Terms §2.2"。这是"条款声称阻断、实现未阻断"这种最难辩解的形态。
- **[medium] 邮箱用户 embedded 钱包自动入金完全不检查 geo** — `embedded-deposit-auto-bridge.tsx:18`。组件在 `providers/root.tsx:98` 无条件挂载,余额 ≥5 USDC 就自动签 permit 存入 bridge2,而普通钱包用户入金入口是被封的。
- **[low] geo 仍 fail-open,`isResolving` 返回但无人消费** — `use-geo-restriction.ts:23`。首屏解析窗口内 `tradeRestricted` 恒 false,存在放行窗口;`grep isResolving` 除 hook 自身外零消费。

### B7 [high] 登出/断开连接从不清除 agent 交易私钥
`hooks/wallet/use-wallet-session.ts:113`。`disconnectWallet` 仍只调 `clearActiveAgentOwner()`(只清"活跃 agent 指针"这个独立 key)和 Privy `logout()`,从不调 `clearAgent()`/`removeAgentFromStorage()`。明文私钥 `hyperliquid_agent_<env>_<address>` 断开后依然在 localStorage;桌面注册路径 `setAgent` 不传 metadata → `agentValidUntilMs` 恒 undefined → 本地过期检查永不触发 → 永久留存。共享/二手电脑或一次 XSS 即可取走可下单/撤单/改杠杆的钥匙。

> 附:对抗核实把上一轮"writeAgentToStorage 静默吞异常导致签名成功却无法交易的死循环"从 high **降为 low** —— 事实成立(`catch {}` 吞异常)但死循环被其它代码阻止,后果被夸大。

### B5 [medium] 手机同步 QR/链接仍是明文 bearer 凭据
`lib/mobile-sync/sync-core.ts:426`。AES 密钥(`k=`)与密文(`ht-mobile-sync=`)仍在同一 URL fragment,AES-GCM 在此只提供完整性、零机密性,整串就是 30 天交易凭据。UI 仍是 "Create secure phone access";"Copy phone link" 仍把含密钥整串写进系统剪贴板(会同步到 iCloud/Windows 云剪贴板),弹窗无"任何人拿到即可交易、勿投屏/截图/转发"警示。仅新增一句 "It cannot withdraw funds" 作为局部缓解 —— 故本轮从 high 降为 medium。

### B3 [low] 部分修复:有版本端点,仍无 kill switch / 无错误监控
`routes/build-meta[.]json.ts`。新增 `/build-meta.json` 解决了"线上跑哪个 commit 无从判断";但 feature flag / kill switch / maintenance mode 全仓仍零命中,sentry/datadog/posthog 仍零命中。出事仍是发现不了也停不下来。

### 其余旧问题仍在
- **[medium] /docs 仍展示占位说明 + 22 个 `(#)` 死链** — `legal/docs.md:72`。上一轮点名,本轮未动,`/docs` 经 top-nav "More" 对所有用户可达。
- **[medium|回归] 移动端账户页余额硬失败时仍显示 $0.00** — `mobile-account-view.tsx:196`。`9fdeb2f0` 只把组合页改成占位符"—",移动端账户页没同步;`hasError` 时 Equity/PNL/Balance 卡片全渲染 `$0.00`(旁边有红色失败横幅,故 medium 不是 blocker)。旧"$0.00 误认资金丢失"问题在移动端残留。
- **[low] `i18n-check.yml` 仍只校验 catalog 新鲜度,不检测空翻译** — `.github/workflows/i18n-check.yml:29`。防不住未来漏译上线。
- **[low] CI 仍不跑 vitest** — `production-build.yml:32` 现在真跑 build+typecheck(旧问题已改善),但 821 个测试仍不在 PR 门禁内;且所有 workflow 只在 `pull_request` 触发,直接 push 到分支仍无门禁。

---

## 六、被对抗核实推翻/降级的项(供参考,不计入问题)

- **[refuted] "调度器不抢占在途请求→紧急撤单被阻塞"** — request-scheduler 已把 cancel/reduce-only/twapCancel 设为优先队列,残留的"urgent 仍需等当前 in-flight 普通请求走完"是 SDK 自身每钱包串行锁决定的,app 层改不了,属可接受取舍。
- **[refuted→low] "多个现货资产共用同一社交链接"** — 事实成立(`spot-asset-socials.generated.ts` 里 7 个条目共用同一 Telegram、3 个共用同一 X),但严重级别是 low:属生成数据质量问题,非钓鱼漏洞。**注意**:这些 generated 文件 + `spot-market-social-links.tsx`/`mobile-market-bar.tsx` 有未提交的工作区改动,社交链接渲染目前无运行时 href 协议白名单(low,纵深防御缺口),上线前值得顺手确认数据来源与转义。
- **[uncertain] 组合页 dexAbstraction 模式下 HIP-3 builder dex 权益漏算** — 代码形态与描述一致,但只在特定账户模式 + 有 builder dex 持仓时触发,未能确证,留作观察。

---

## 七、本轮确认"已验证修复/做得好"的部分(不要动)

- **B1 幂等下单**:`createClientOrderId` 生成 `0x`+32hex=34 字符,正则与 SDK `Cloid` LengthAction(34)完全一致;含糊错误分类(`isAmbiguousOrderRequestError`:超时/5xx→对账,4xx/429→确定失败)正确;批量部分成功用 `resolveOrderBatchResponse` 正确区分 partial/rejected;竞态用 active-guard 让 WS 在 HTTP 在途时不解析,remove-on-complete 保证幂等。**这套修复质量很高。**
- **B4 余额算法**:transfer/send 已改用 `withdrawable`,与 `balances-tab` 口径一致。
- **TWAP 撤单/订阅**:`use-twap-cancel` 现在成功/失败/超时都有 toast;`getTwapViewState` 在 `!hasData && status==='error'` 返回 error 视图(不再无限转圈);TWAP 下单也用了单资产幂等 + 对账。commit `6f139ac4` 的窗口边界 `>=`/`<` 互补,无 off-by-one,`Math.min(...空)=Infinity` 有 `Number.isFinite` 拦截,不会无限循环。
- **exchange SDK 字段**:全量核对一致(见 §一)。
- **request-scheduler / exclusive-browser-lock / query-retry**:机制方向正确,解决了旧的阻塞/多标签/429 问题(各留一个 low 级余量:429 重试无抖动惊群、Web Locks 不可用时退化直跑、urgent 仍受 SDK 串行锁约束)。
- **TradingView 覆盖线**:`use-tradingview-overlay-lines.ts` 已被 `tradingview-chart.tsx` 消费,旧的 KLine 死代码覆盖线已接入(但目前是只读标记,不支持拖拽改单 —— low)。
- **risk 页 / sitemap / og 图**:均已上线并被正确挂载。

---

## 八、方法与置信度

- confirmed 18 条中,3 high + 关键 medium 我已**人工复核**(order-reconciliation 窗口缺口、现货 builder fee、geo.ts 缅甸缺失、错误边界零命中、agent 私钥登出、HIP-3 deployerFeeScale ×2 逻辑),均属实
- 官方文档经 `hyperliquid-docs` MCP 核对(builder-codes 现货买方规则、account-abstraction per-collateral 公式、费率公式);SDK 字段经直接 Read `@nktkas/hyperliquid@0.33.1` 的 `.d.ts` valibot schema 核对
- 我独立跑了 `pnpm test`(821 通过)与 `pnpm typecheck`(通过)
- **未做**:真机/浏览器 E2E、未在真实 WS 下验证 `dex:"ALL_DEXS"` 与 orderStatus 对"部分成交 IOC/已拒绝"的确切返回值(相关发现已按低置信标注)
