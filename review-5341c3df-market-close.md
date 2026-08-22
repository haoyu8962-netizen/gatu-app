# 对抗审查报告:`5341c3df` feat(terminal): align market close confirmation

- 审查对象:`5341c3df`,**名义"平仓确认弹窗",实际 54 文件 / +6534 行** —— 顺带重写了订单/TWAP 对账、pending store,并新增一整套 order-asset-lock 资产锁并发原语
- 方式:8 维度并行对抗审查 → 逐条反驳式核实 → 盲区批判 → 关键项人工实证(Hyperliquid 官方文档 + SDK schema + Web Locks 规范)
- 规模:16 个 agent、约 175 万 token
- confirmed:**0 blocker、0 high、3 medium、3 low**;refuted 1 条
- 结论:**核心资金安全面做得很扎实,可以放心。真正的问题不在平仓本身,而在夹带的隐藏改动——尤其一个 TWAP 资产预留的死代码,会长时间阻塞该资产的平仓。**

---

## 一、先说结论:资金安全面全部通过(我人工逐条验证)

平仓最怕的是"平仓变成反向开仓"或"超量平仓",这条防得很干净:

- **reduce-only 无法绕过**:平仓单唯一构造路径是 `order-intent.ts` 的 `buildMarketClosePlan`,**硬编码 `reduceOnly: true`**;`buildFrontendMarketOrder` 全仓无第二个调用点。不存在任何构造非 reduce-only 平仓单的路径
- **side 从签名持仓量推导**:`szi > 0`(多)→ sell,`szi < 0`(空)→ buy,正确
- **精度安全**:100% 全平用 `maxSize.toString()`(已 floor 到 szDecimals ≤ 真实持仓),叠加 reduce-only,永不超平;`s === "0"` / `p === "0"` 都有拦截
- **提交时用实时快照**:submit 前重新 fetch `clearinghouseState + metaAndAssetCtxs`,并有 `assertExecutionContext` 在签名前再校验一次(与 isolated-margin 同款模式)。确认后到提交前持仓若变化(被 TP/SL 平掉、被强平、反手),会被最新快照 + reduce-only 兜住
- **滑点有上界**:5%(500 bps),方向正确(买 `markPx×(1+slip)`、卖 `markPx×(1-slip)`)
- **SDK 规范**:`FrontendMarket` 在 tif picklist `[Gtc,Ioc,Alo,FrontendMarket]` 中;cloid 格式 `0x`+32hex(34 字符)与 SDK schema 一致;p/s 走 `UnsignedDecimal` 正则兼容。**无废弃字段、无字段错误**

**B1 幂等未被打破**(pending store 重写的最大风险点):`intentKey`(去 cloid 稳定序列化)+ 同资产阻断 + reduce-only 放行 exact-intent 的语义全部保留,另叠加新的独占锁与跨标签 reservation。核实者用改前版本逐条对比确认无损。

**新增的 market-close/asset-lock 测试 82 个全过**,typecheck 通过。

---

## 二、MEDIUM:TWAP 资产预留死代码 → 长时间无法平仓(最需要处理)

**`twap-order-asset-reservation.ts:88`(本提交新引入)** —— 我人工验证死代码属实

TWAP 下单成功后,会在 localStorage 写一条 `active-twap:{twapId}` 资产预留。这条预留**只有两种消失途径**:

1. 用户**显式取消** TWAP(`use-twap-cancel.ts:49` 清理)
2. 到达 `expiresAt` 后被读时**惰性清除**

而专门为"TWAP 完成时释放"写的 `releaseActiveTwapOrderAssetReservation` 函数——我 grep 全仓确认**只有定义、零调用点,是死代码**。所以 TWAP **正常跑完 / 被交易所提前 finished/terminated/error 时,没有任何代码清除这条预留**。

后果:预留残留期间,该资产的:
- **市价平仓**(`exclusiveAssetLock: true`)→ 命中 conflict → 被拒,提示"Another order for this market is still being confirmed."
- **新开仓**(非 reduce-only)→ 同样 conflict → blocked

残留时长:
- 跑满时长的 TWAP:约 2 分钟(轻微)
- **被提前终止的 TWAP**(实际结束远早于用户设定时长,或 minutes 缺失 → durationMs=24h):残留可长达计划时长,**上限 24h+2min**

这期间用户**既不能市价平仓该仓位、也不能在该资产新开仓**,而错误文案指向"有订单待确认"——现象隐蔽,是交易终端里较危险的"无法退出某资产"失败模式。

> 修复方向明显:`use-tracked-twap-order` 在 TWAP 完成/终止事件时调用那个已经写好但没接上的 `releaseActiveTwapOrderAssetReservation`。

---

## 三、MEDIUM:部分成交的平仓在对账路径被误判为"rejected"

**`order-reconciliation.tsx:159`(本提交新引入)** —— 我人工验证

`completeReconciliation` 的判定:只有 `allAccepted && 全部 filled` 才标 "filled",否则一律 "rejected" + 文案"The exchange did not accept the order."。而 `ACCEPTED_ORDER_STATUSES = {"open","filled","triggered"}` **不含 `canceled`**。

平仓是 IOC(FrontendMarket)单,HL 对**部分成交**的 IOC 单,剩余取消后订单最终状态是 `canceled`(带已成交量)→ 不在 accepted 集 → **标 "rejected" + "交易所未接受"**,但持仓其实已部分平掉。

触发条件较窄:只在"含糊失败走对账路径" + "部分成交"叠加时。**直连路径是对的**(submit hook 读 `filled.totalSz`,toast 显示实际成交量)。但对账路径给出的"交易所未接受"会让用户误以为完全没平,可能重复操作(reduce-only 会兜住超量,不至于反手)。

---

## 四、MEDIUM:i18n —— 平仓文案在 es/fr/hi/ar 根本没提取

**本提交新引入** —— 我人工量化验证

各 catalog 总 msgid 数:**en/zh 各 938,es/fr/hi/ar 各 898——差 40 条**,正是本提交新增的平仓相关文案。抽查确认 `Close size exceeds current position` 等错误文案在 es/fr 里 **`msgid` 根本不存在**(不是"存在但空",是从未提取)。

这与之前几轮的空翻译不同:那些是"提取了但没翻译",这次是 **lingui extract 只对 en/zh 跑了、没对 4 个语言跑**。平仓确认弹窗和错误文案对这 4 种语言用户完全是英文——而平仓是资金操作,确认环节看不懂文案风险不小。

(附带:diff 的 stat 里就只有 en/zh 两个 catalog 有改动,es/fr/hi/ar 没出现——这是可以在 CI 层面机械拦截的,但此前审查已确认 i18n-check 只验证 catalog 新鲜度、不验证完整性。)

---

## 五、盲区:commit message 完全没提的夹带改动

一个叫"平仓确认"的提交为什么要改 slider、HIP-3 免责声明、trading-action-button?这些是最容易藏回归的地方。批判者找出三条(均 medium,我复核了最关键的):

### 5.1 HIP-3 法务门从"恒不可关闭"变成"平仓路径下可关闭"(已人工验证)

改前 HIP-3 部署商免责声明恒为 `dismissible={false} showClose={false}`(不可关闭的合规硬门)。本提交给它加了 `onCancel`,使 `dismissible={!!onCancel} showClose={!!onCancel}`——传入 onCancel 时变可关闭。

这是夹带在"平仓确认"里的**合规行为改动**,没有任何维度原本会看它。平仓允许退出本身合理,但"法务门可否关闭"应由法务确认意图,不该藏在一个平仓 feat 里。更关键:`global-modals.tsx` 中 HIP-3 免责声明**前置 return**,会完全抑制平仓弹窗渲染——两个模态的优先级交互也需确认。

### 5.2 并发原语被注入到**所有**下单路径(不只平仓)

本提交把 Web Locks + localStorage reservation 塞进了 `useTrackedOrder` 的公共 `submitOrder`——**开仓/现货 swap/TP-SL/限价平仓/反手全部受影响**,而这些文件根本不在 diff 里。改前该文件零锁代码。副作用:`navigator.locks` 不可用(非 HTTPS 安全上下文或旧浏览器)时,**所有交易 fail-closed 被拒**。生产走 HTTPS 通常没事,但这是把一个隐性硬依赖注入了全部交易路径。

### 5.3 紧急平仓变慢

改前 Market Close 是"用已订阅的 markPx 一次点击即发单"。改后 submit 在持锁回调内先 `await Promise.all([clearinghouseState, metaAndAssetCtxs])` 两个 REST 往返再构单,且 validating 阶段模态不可关闭。行情剧烈时(正是最需要快速平仓的时候)更慢、且更易因陈旧度门控/资产锁被拒。这是"更安全"与"更快"的权衡,方向可以理解,但对交易终端的紧急平仓值得产品明确取舍。

---

## 六、值得知道的 LOW

- **市价平仓以 `exclusiveAssetLock: true` 参与预留判定**:同资产存在任一在途/对账中订单时,即便纯 reduce-only 的紧急平仓也被拒(最长约 2 分钟)。这是 §二 之外的另一个"平仓可被拒"窗口
- **`>2 分钟重开只判 unconfirmed 不查 orderStatus` 的旧缺口在本次重写中被保留**(未修复)
- **平仓确认弹窗未展示预计盈亏、手续费、美元名义额**——用户确认前看不清代价
- **平仓确认按钮在行情价显示 "Unavailable" 时仍可点击提交**
- **平仓构建期错误绕过 i18n**,以原始英文串展示
- **`order-asset-lock.test.ts` 未覆盖并发安全的关键失败路径**:任务抛异常后的锁释放、多资产排序获取的死锁避免、任务挂起/超时持锁、组件卸载中途(不过核实者从代码层面确认这些路径本身是安全的,只是没测)

---

## 七、对抗核实的判断(1 条推翻)

- "平仓确认按钮为受限用户触发 agent+builder fee 授权,无 geo 门控" → **推翻归属**:geo 缺口客观存在(`TradingActionButton → useTradingGuard → authorize` 全链无 `tradeRestricted` 检查),但**非本提交引入**,是贯穿该共享组件的既有系统性缺口。这条应记在 geo 专项,不算这个提交的账

关于 asset-lock 本身,核实者做了很扎实的正面确认(避免我误报):它是**真正的跨标签协调**(Web Locks API + localStorage reservation),不是进程内玩具;多资产用 `normalizeIdentity` 排序获取形成一致锁序避免交叉死锁;Web Locks 在回调 settle/抛异常时自动释放,标签页销毁时浏览器自动释放,**不存在永久死锁**;紧急操作用 `ifAvailable`(快速失败)而非无限等待。所以它的问题是"会被拒"(§二/§六),不是"会卡死"。

---

## 八、方法与置信度

**我亲自实证**:读 `buildMarketClosePlan` 确认 `reduceOnly: true` 硬编码且是唯一构造路径;读 submit hook 确认用 `fresh.signedPositionSize` 实时快照;核对 SDK tif picklist 含 FrontendMarket、cloid 34 字符;grep 确认 `releaseActiveTwapOrderAssetReservation` 是死代码、清理仅在用户主动取消路径;读 `ACCEPTED_ORDER_STATUSES` 确认不含 canceled → 部分成交对账误判;脚本量化 i18n(en/zh 938 vs es/fr/hi/ar 898,差 40)并抽查 msgid 缺失;对比改前确认 HIP-3 免责声明 dismissible 变化;跑新测试 82 个全过。

**未做**:真机多标签页/degraded 环境(无 Web Locks)实测;未实测 HL 对部分成交 IOC 单的确切 orderStatus 返回值(基于官方文档 + SDK schema 推导);测试 flaky 我此前已确认是 5000ms 超时的系统性问题、非本提交主因(核实者也复现了"失败全落在无关文件、单跑即全绿")。
