# ADR 0022：订阅过期判断以单调时钟计龄

- 状态：已接受并实施，2026-09-28；尚未发布。验证包括单元与集成测试，以及在本地开发服务器上用页面脚本把 `Date.now` 往回拨一小时、观察真实 WebSocket 流；没有改动系统时间，也没有核对设备休眠。
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

1. **每帧两个接收时间。** `FrameReceipt = { receivedAt, monotonicReceivedAt }`：前者是墙钟，存入 `lastMessageAt`；后者是 `performance.now()`，只在 hl-react 内部使用。`useSub` 在收到帧时取两者（`receiveFrameNow()`），经节流器原样交给 `setSubscriptionData(key, data, receivedAt, monotonicReceivedAt)`；运行时记录 `monotonicLastMessageAt`，隐藏页面缓冲值也携带两者。订单簿传输池已有单调接收时间，回放时经 `markFrameReceivedAt(frame, receivedAt, monotonicReceivedAt)` 一并交出。
2. **年龄取两个时钟中较大者。** `getReceiptAgeMs(receivedAt, monotonicReceivedAt, now, monotonicNow)` 返回墙钟年龄与单调年龄的较大值。巡检、`arm`/`markFresh` 的即时判定、隐藏缓冲提交、前台恢复过期检查与恢复事件诊断的 `staleForMs` 都用它。单调年龄保证回拨后静默的流照常在阈值加一个巡检间隔内过期；墙钟年龄只会让判断更严格，保留前跳与休眠时的原有行为。
3. **负的墙钟年龄单独不算过期。** 回拨后仍在推送的流，下一帧用回拨后的时钟重新盖章即恢复正常。
4. **节流以单调时钟计间隔。** `createThrottledUpdater` 用 `performance.now()` 计算距上次投递的时间，首条仍立即投递。

## 备选方案与代价

| 方案 | 取舍 |
| --- | --- |
| 墙钟年龄为负即判过期 | 回拨后第一次巡检会把所有周期流同时判过期，触发共享 socket 重连（改变恢复行为）；部分回拨（例如回拨 10 秒而流已静默 15 秒）年龄仍为正，过期检测照样被推迟回拨量。Codex 复现的场景也只有在回拨量大于已静默时间时才被覆盖。未采用 |
| 只用单调年龄 | 前跳与可能不计休眠时间的单调时钟会让唤醒后的旧数据在阈值内继续显示为实时；现有「前台恢复时保留快照已过期」的两条测试依赖墙钟前跳，会失败。未采用 |
| 只在巡检内部把墙钟接收时间换算成单调时间（`performance.now() - (Date.now() - at)`） | 改动最小，但接收到交付之间（节流窗口、订单簿回放最多 5 秒）发生回拨时仍按交付时间计新鲜。传输池本来就有单调接收时间，直接传递更准确。未采用 |
| `lastMessageAt` 改成单调时间 | 下游显示与执行守卫都与 `Date.now()` 比较，改语义会同时改动十余处并混淆两种时钟。未采用 |

## 后果与边界

- 回拨后静默的流在阈值加巡检间隔内过期（`pac`/`allDexsAssetCtxs` 最多约 25 秒），走与未回拨时相同的恢复路径；回拨后仍在推送的节流流保持实时。
- 回拨到新帧到达之间，与 `Date.now()` 比较 `lastMessageAt` 的消费方会看到负年龄并按不新鲜处理（执行守卫失败关闭）；这是既有行为，本次不改。
- `transport-monitor.ts` 的 socket 静默检测、`l2-subscription-gate.ts` 的截止时间、开发用的 chaos 冻结仍用墙钟。回拨后 socket 静默检测会失效到墙钟追上为止；巡检过期后的多流重连仍会恢复连接。它们不在本次范围内，列为后续事项。
- `markFrameReceivedAt` 多了一个必填参数，`takeFrameReceivedAt` 改为返回 `FrameReceipt`；仓库内调用方只有订单簿传输池与测试。`setSubscriptionData` 的两个时间参数都可省略，只传墙钟时间时单调时间取当前时刻，墙钟年龄照常生效。

## 证据

- 代码：`packages/hl-react/src/internal/websocket/{staleness,frame-receipt,batch-updater}.ts`、`packages/hl-react/src/store.ts`、`packages/hl-react/src/hooks/utils/useSub.ts`、`packages/hl-react/src/subscriptions/l2-book-transport-pool.ts`。
- 测试（`apps/terminal/src/lib/tests/`）：`staleness.test.ts`（回拨后静默过期、回拨后持续推送保持新鲜、前跳仍过期、晚交付接收按单调时间判断）、`store-staleness.test.ts`（`pac`/`allDexsAssetCtxs` 回拨一小时静默：20 秒未过期、25 秒过期并重订阅、10 分钟后仍过期；隐藏期间回拨后恢复前台不把缓冲值当新鲜；账户快照前台恢复）、`use-sub.test.tsx`（真实 `useSubscription` 以 `throttleMs: 5_000` 订阅 `pac`/`allDexsAssetCtxs`：回拨后持续推送时上下文保持实时，静默 10 分钟后不再实时；回拨前接收的回放帧按单调接收时间过期）、`throttled-updater.test.ts`、`l2-book-transport-pool.test.ts`。
- 本次执行结果、变异检查与浏览器对照见[任务记录](../work-memory/sessions/2026-09-28-subscription-staleness-monotonic-clock.md)。
