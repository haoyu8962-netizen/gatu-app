# ADR 0022：订阅过期判断以单调时钟计龄

- 状态：已接受并实施，2026-09-28；尚未发布。初版的验证包括单元与集成测试，以及在本地开发服务器上用页面脚本把 `Date.now` 往回拨一小时、观察真实 WebSocket 流。同日经 Codex 只读对抗审查后修订：节流器改为两个时钟取大（决策 4），并收窄了下文三处表述。[补充决策 5–8](#补充socket-静默检测l2-订阅闸门与交易动作对账) 也在同日实施，只有单元与组件测试。以上都没有改动系统时间，也没有核对设备休眠。 2026-10-08 补记：之后随 p24 发布（main `3ced842e`，2026-10-02）。
- 归属 Reference：[运行时护栏 §6](../runtime-guardrails.md#6-websocket-and-account-data)。关联：[ADR 0003](0003-orderbook-transport-isolation.md)（订单簿回放帧携带接收时间）、[移动端数据展示](../mobile-data-presentation.md)。

## 背景与目标

hl-react 的订阅新鲜度巡检（`internal/websocket/staleness.ts`）服务所有周期订阅：价格、订单簿、资产上下文与账户流，阈值见 `internal/websocket/reliability.ts`。它原先用 `Date.now() - lastMessageAt > thresholdMs` 判断过期，接收时间默认也是 `Date.now()`。系统时间在一帧到达后被往回调，之后停止更新的流算出的年龄是负数或很小，一直不被判为过期。2026-09-28 对资金费率对比页的只读 Codex 审查（分支 `claude/sdk-api-review-51a3ea`）在内存里复现：`pac` 与 `allDexsAssetCtxs` 回拨一小时后静默 10 分钟，`isStale` 仍为 false，页面继续按旧持仓量显示并排序。所有以 `isStale` 为基础的过期守卫都继承这个缺口。

同一类问题还在两处：隐藏页面缓冲值在回到前台时用墙钟判断是否过期，前台恢复时的「保留快照已过期」检查也用墙钟；节流投递（`createThrottledUpdater`）用墙钟计间隔：回拨发生时若没有挂起的节流定时器，下一帧算出的间隔为负，投递被推迟约一小时。订单簿 `l2Book`/`bbo` 默认 16 毫秒节流而帧间隔更长，几乎总是命中；`useMarketsInfo` 的 `pac`/`sac`/`allDexsAssetCtxs`/`spotAssetCtxs` 为 5 秒节流，只有回拨恰在两次投递之间没有新帧时命中。开发服务器上的对照（原版节流器加新巡检，页面内回拨一小时）：`l2Book` 与 `bbo` 停止更新，巡检在约 15 秒把 `l2Book` 判为过期并重订阅，但重订阅后的帧仍被同一个定时器压住；`bbo` 没有过期阈值，静默冻结。只修巡检而不修节流，回拨后的订单簿会持续一小时处于过期状态。

目标是让过期判断不受系统时间回拨影响，其余行为不变。

## 约束

- 不改阈值、巡检间隔、订阅键、恢复路径（单流重订阅、多流同时过期时重连共享 socket、前台恢复重取快照）。
- `lastMessageAt` 对外保持墙钟语义。显示层与执行守卫（`domain/trade/market-price.ts` 的 `isLiveMarkPriceReady`、`funds-execution-guard.ts`、`order/reduce-only.ts`、`order/liquidation.ts`、逆向与逐仓保证金提交）用它与 `Date.now()` 比较，且已把负年龄当作不新鲜。
- 前跳与休眠现有的处理不能变弱。`performance.now()` 在设备休眠期间是否计时因浏览器与操作系统而异，本次没有核对。
- 订单簿回放帧不能因为交付晚于接收而显得更新鲜（ADR 0003 第 28、29 检查点）。

## 决策

1. **每帧两个接收时间。** `FrameReceipt = { receivedAt, monotonicReceivedAt }`：前者是墙钟，存入 `lastMessageAt`；后者是 `performance.now()`，初版只在 hl-react 内部使用，补充决策 6 起经 `monotonicLastMessageAt` 交给需要判断先后的消费方。`useSub` 在收到帧时取两者（`receiveFrameNow()`），经节流器原样交给 `setSubscriptionData(key, data, receivedAt, monotonicReceivedAt)`；运行时记录 `monotonicLastMessageAt`，隐藏页面缓冲值也携带两者。订单簿传输池已有单调接收时间，回放时经 `markFrameReceivedAt(frame, receivedAt, monotonicReceivedAt)` 一并交出。
2. **年龄取两个时钟中较大者。** `getReceiptAgeMs(receivedAt, monotonicReceivedAt, now, monotonicNow)` 返回墙钟年龄与单调年龄的较大值。巡检、`arm`/`markFresh` 的即时判定、隐藏缓冲提交、前台恢复过期检查与恢复事件诊断的 `staleForMs` 都用它。单调年龄保证回拨后静默的流照常在阈值加一个巡检间隔内过期；墙钟年龄只会让判断更严格，保留前跳与休眠时的原有行为。
3. **负的墙钟年龄单独不算过期。** 回拨后仍在推送的流，下一帧用回拨后的时钟重新盖章即恢复正常。
4. **节流间隔同样取两个时钟中较大者。** `createThrottledUpdater` 记录上次投递的墙钟与单调时刻，用 `getReceiptAgeMs` 计算间隔，首条仍立即投递。回拨时单调间隔决定投递时刻，不再推迟约一小时；前跳，或休眠期间单调时钟没走而墙钟已越过间隔时，与改前一样立即投递。首版只用单调时钟，审查指出它在前跳与休眠后会多等最多一个节流窗口，与「其余行为不变」矛盾。

## 备选方案与代价

| 方案 | 取舍 |
| --- | --- |
| 墙钟年龄为负即判过期 | 回拨后第一次巡检会把在那之前还没收到新帧的周期流都判过期；有多条同时过期时触发共享 socket 重连（改变恢复行为）；部分回拨（例如回拨 10 秒而流已静默 15 秒）年龄仍为正，过期检测照样被推迟回拨量。Codex 复现的场景也只有在回拨量大于已静默时间时才被覆盖。未采用 |
| 只用单调年龄 | 前跳与可能不计休眠时间的单调时钟会让唤醒后的旧数据在阈值内继续显示为实时；现有「前台恢复时保留快照已过期」的两条测试依赖墙钟前跳，会失败。未采用 |
| 只在巡检内部把墙钟接收时间换算成单调时间（`performance.now() - (Date.now() - at)`） | 改动最小，但接收到交付之间（节流窗口、订单簿回放最多 5 秒）发生回拨时仍按交付时间计新鲜。传输池本来就有单调接收时间，直接传递更准确。未采用 |
| `lastMessageAt` 改成单调时间 | 下游显示与执行守卫都与 `Date.now()` 比较，改语义会同时改动十余处并混淆两种时钟。未采用 |

## 后果与边界

- 回拨后静默的流在阈值加巡检间隔内过期（`pac`/`allDexsAssetCtxs` 最多约 25 秒；巡检依赖 `setInterval`，页面在后台或被冻结时回调可能延后，这个上界只在巡检按时运行时成立），走与未回拨时相同的恢复路径；回拨后仍在推送的节流流保持实时。
- 回拨到新帧到达之间，与 `Date.now()` 比较 `lastMessageAt` 的消费方会看到负年龄并按不新鲜处理（执行守卫失败关闭）；这是既有行为，本次不改。
- 初版把 `transport-monitor.ts` 的 socket 静默检测、`l2-subscription-gate.ts` 的截止时间与订单/TWAP 对账列为后续事项，已由下面的补充处理。开发用的 chaos 冻结仍用墙钟。
- `markFrameReceivedAt` 多了一个必填参数（仓库内调用方：订单簿传输池与测试），`takeFrameReceivedAt` 改为返回 `FrameReceipt`（调用方：`useSub` 的节流与直接两条接收路径，以及测试）。`setSubscriptionData` 的两个时间参数都可省略，只传墙钟时间时单调时间取当前时刻，墙钟年龄照常生效。

## 补充：socket 静默检测、l2 订阅闸门与交易动作对账

2026-09-28 同日补充，处理初版留下的三处墙钟计时。

### 背景

- **socket 静默检测**（`internal/websocket/transport-monitor.ts`）：`Date.now() - lastMessageAt < inactivityThresholdMs` 在回拨后一直成立，socket 静默也不重连，直到墙钟追上；期间只能靠巡检的多流过期重连兜底。
- **增量 `l2` 订阅闸门**（`subscriptions/l2-subscription-gate.ts`）：同一币种换分组时，新订阅最多等旧订阅退订 5 秒。截止时间是 `Date.now() + 5_000`，再次等待时剩余时间按 `deadlineAt - Date.now()` 计算。第一次等待的定时器是相对时间，不受回拨影响；闸门释放后又被第三个分组抢先占用、需要再等一次时，回拨量会原样加到剩余等待上。
- **撤单、改单与 TWAP 撤单对账**（`components/trade/order-reconciliation.tsx`、`twap-reconciliation.tsx`）：用墙钟 `lastMessageAt <= requestStartedAt / unconfirmedAt / confirmationStartedAt` 判断快照是否晚于本地事件，15 秒确认超时也按墙钟计算。请求发出后回拨时，新快照被当作早于请求而不采用；超时定时器到点时墙钟年龄为负，动作不转为未确认，也不再重新安排。结果是撤单一直停在等待确认，同一订单不能再撤，直到墙钟追上。反方向也有缺口：快照在回拨前到达、请求在回拨后发起时，墙钟把请求前的快照当作请求之后的，可能据此确认撤单，这是失败开放的方向。

### 决策

5. **静默检测与闸门等待按两个时钟中较大的经过时间计算**，与巡检同用 `getReceiptAgeMs`。`transport-monitor` 在连接打开、收到消息和挂载时记录 `FrameReceipt`；闸门在开始获取时记录两个时钟的起点，每次等待都用 5 秒减去较大的经过时间。阈值、检查间隔与恢复路径不变。
6. **帧与本地事件的先后只看单调时钟。** `SubscriptionResult` 新增 `monotonicLastMessageAt`，即与 `lastMessageAt` 同一帧的 `performance.now()` 接收时间（节流、隐藏缓冲与订单簿回放都保留真实接收时间）。待确认交易动作 store 记录 `requestStartedAt`、`confirmationStartedAt`、`unconfirmedAt` 时，同时记录 `monotonicRequestStartedAt`、`monotonicConfirmationStartedAt`、`monotonicUnconfirmedAt`；对账用 `wasReceivedAfter(monotonicLastMessageAt, monotonic*)` 判断快照是否晚于请求开始、确认开始或未确认，任一读数缺失都不算晚于。墙钟字段保留为可读记录，不再参与先后判断。
7. **15 秒确认超时按两个时钟中较大的年龄计算**（`getTradingActionConfirmationRemainingMs`）。定时器按剩余时间向上取整安排（`getNextTradingActionExpiryDelayMs`）；到点后若仍有动作未满 15 秒（`performance.now()` 的精度被浏览器降低，读数可能比计时器时钟略小），按新的剩余时间再安排一次，而不是像以前那样只安排一次。
8. **写入存储、跨标签页共享的时间保持墙钟。** 待确认下单与 TWAP 提交的 `createdAt`（两分钟确认窗口与 24 小时清理）、`nextCheckAt` 轮询退避，以及跨标签页资产预留的 `expiresAt`，由其他标签页和刷新后的页面读取；`performance.now()` 以各自文档为起点，不能跨文档比较。

### 备选方案与代价

| 方案 | 取舍 |
| --- | --- |
| 先后判断也用「取大」，即任一时钟说在后就算在后 | 取大是年龄的保守方向，用在先后上却是宽松方向：回拨前到达的快照在墙钟上仍晚于回拨后的请求，会被当作请求结果，保留上面的失败开放缺口。变异检查中「回拨前快照不当作新快照」的用例失败。未采用 |
| 两个时钟都说在后才算在后 | 回拨后墙钟一直说早于，等同原行为，撤单照样等到墙钟追上。未采用 |
| 先后判断只看单调时钟（采用） | 同一文档内的两个事件在单调时钟上先后始终正确；前跳与休眠不改变两个事件在任一时钟上的先后，所以这两种情况下结果与原来相同。代价是 `SubscriptionResult` 多一个必填字段，消费方必须遵守「只与同一文档的 `performance.now()` 比较」 |
| 静默检测与闸门只用单调时钟 | 前跳与可能不计休眠的单调时钟会让唤醒后已静默的 socket 继续等满阈值，前跳后闸门等待也不再立即结束。变异检查中两条前跳用例失败。未采用 |
| 持久化的提交窗口与资产预留也改单调时间（例如记录本文档首次看到时的两个时钟） | 只能覆盖本文档内的回拨，跨标签页与刷新仍回到墙钟，还要改动持久化结构与跨标签页合并。收益集中在「待确认提交期间恰好回拨」这一少见组合，本次未做，列为剩余限制 |

### 后果与剩余限制

- 回拨后静默的 socket 在阈值加一个检查间隔内重连；仍在收消息的 socket 不重连（负的墙钟年龄单独不算静默）；前跳后下一次检查照旧重连。
- 闸门再次等待时仍在原 5 秒预算内以 `subscription_conflict` 结束；前跳后立即结束，与原行为相同。
- 回拨后的新快照照常确认撤单、改单与 TWAP 撤单；无结果的动作在 15 秒后转为未确认；回拨前到达的快照不再被当作请求之后的。
- `SubscriptionResult.monotonicLastMessageAt` 是必填字段；仓库内产生它的只有 `useSub` 与 `useOrderbookFeed` 的透传。它只能与同一文档内的 `performance.now()` 读数比较，不能写入存储或跨标签页传递。
- 剩余限制：待确认提交期间回拨时，轮询暂停，两分钟确认窗口与资产预留都顺延回拨量，直到 WebSocket（`orderUpdates`、`twapStates`、`userTwapHistory`）给出结果或墙钟追上。这些路径不会误确认，只会推迟「未确认」结论和资产释放。执行守卫把 `lastMessageAt` 与 `Date.now()` 比较、负年龄按不新鲜处理，原样不变。

### 补充的证据

- 代码：`packages/hl-react/src/internal/websocket/transport-monitor.ts`、`packages/hl-react/src/subscriptions/l2-subscription-gate.ts`、`packages/hl-react/src/{store,types}.ts`、`packages/hl-react/src/hooks/utils/useSub.ts`、`apps/terminal/src/hooks/trade/use-orderbook-feed.ts`、`apps/terminal/src/stores/use-pending-trading-action-store.ts`、`apps/terminal/src/components/trade/{order,twap}-reconciliation.tsx`。
- 测试（`apps/terminal/src/lib/tests/`）：`ws-transport-monitor.test.ts`（回拨后静默照常重连、回拨后仍收消息不重连、前跳后下一次检查重连）、`use-l2-book-subscription.test.tsx`（闸门再次等待时回拨不延长 5 秒预算、前跳立即结束）、`use-sub.test.tsx`（`monotonicLastMessageAt` 保留真实接收时间）、`pending-trading-action-store.test.ts`（回拨后按单调时间超时、只有墙钟前跳时照样超时、先后只看单调读数）、`order-reconciliation.test.tsx` 与 `twap-reconciliation.test.tsx`（回拨后新快照确认撤单、回拨后 15 秒转为未确认、回拨前快照不当作新快照、定时器早到时重新安排）。
- 执行结果与变异检查见[补充的任务记录](../work-memory/sessions/2026-09-28-wall-clock-timers-follow-up.md)。

## 证据

- 代码：`packages/hl-react/src/internal/websocket/{staleness,frame-receipt,batch-updater}.ts`、`packages/hl-react/src/store.ts`、`packages/hl-react/src/hooks/utils/useSub.ts`、`packages/hl-react/src/subscriptions/l2-book-transport-pool.ts`。
- 测试（`apps/terminal/src/lib/tests/`）：`staleness.test.ts`（回拨后静默过期、回拨后持续推送保持新鲜、前跳仍过期、晚交付接收按单调时间判断）、`store-staleness.test.ts`（`pac`/`sac`/`allDexsAssetCtxs`/`spotAssetCtxs` 回拨一小时静默：20 秒未过期、25 秒过期并重订阅、恢复事件 `staleForMs` 为 25 秒、10 分钟后仍过期；原始 `l2` 回拨后静默过期且不走通用恢复；隐藏期间回拨后恢复前台不把缓冲值当新鲜；账户快照前台恢复）、`use-sub.test.tsx`（真实 `useSubscription` 以 `throttleMs: 5_000` 订阅 `pac`/`allDexsAssetCtxs`：回拨后持续推送时上下文保持实时，静默 10 分钟后不再实时；回拨前接收的回放帧在节流与直接两条路径上都按单调接收时间过期）、`throttled-updater.test.ts`（回拨后与前跳后连续几轮的投递时刻；墙钟越过间隔而单调时钟未越过时立即投递）、`l2-book-transport-pool.test.ts`。
- 本次执行结果、变异检查与浏览器对照见[任务记录](../work-memory/sessions/2026-09-28-subscription-staleness-monotonic-clock.md)。
