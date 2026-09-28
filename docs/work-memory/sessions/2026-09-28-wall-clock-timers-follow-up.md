<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-28-wall-clock-timers-follow-up",
  "date": "2026-09-28",
  "title": "ADR 0022 后续：socket 静默检测、l2 闸门与撤单对账的墙钟计时",
  "kind": "task",
  "status": "verified",
  "topics": ["market-recovery"],
  "summary": "处理 ADR 0022 初版留下的三处墙钟计时：socket 静默检测与增量 l2 闸门的 5 秒等待按墙钟与单调两种经过时间取大；SubscriptionResult 新增 monotonicLastMessageAt，撤单、改单与 TWAP 撤单对账的快照先后只看单调时间，15 秒确认超时按两种年龄取大并在定时器早到时重新安排。先后判断不用取大，因为取大会把回拨前到达的快照当作请求之后的结果。写入存储、跨标签页共享的提交窗口、轮询退避与资产预留仍用墙钟，列为剩余限制。typecheck、Biome、相关回归组与完整单测见正文；未做浏览器或真实系统时间验证。",
  "thread": null,
  "baseCommit": "6aa715d7",
  "commits": [],
  "sources": [
    { "path": "packages/hl-react/src/internal/websocket/transport-monitor.ts" },
    { "path": "packages/hl-react/src/subscriptions/l2-subscription-gate.ts" },
    { "path": "packages/hl-react/src/store.ts" },
    { "path": "packages/hl-react/src/types.ts" },
    { "path": "packages/hl-react/src/hooks/utils/useSub.ts" },
    { "path": "apps/terminal/src/hooks/trade/use-orderbook-feed.ts" },
    { "path": "apps/terminal/src/stores/use-pending-trading-action-store.ts" },
    { "path": "apps/terminal/src/components/trade/order-reconciliation.tsx" },
    { "path": "apps/terminal/src/components/trade/twap-reconciliation.tsx" },
    { "path": "apps/terminal/src/lib/tests/ws-transport-monitor.test.ts" },
    { "path": "apps/terminal/src/lib/tests/use-l2-book-subscription.test.tsx" },
    { "path": "apps/terminal/src/lib/tests/use-sub.test.tsx" },
    { "path": "apps/terminal/src/lib/tests/pending-trading-action-store.test.ts" },
    { "path": "apps/terminal/src/lib/tests/order-reconciliation.test.tsx" },
    { "path": "apps/terminal/src/lib/tests/twap-reconciliation.test.tsx" },
    { "path": "docs/adr/0022-subscription-staleness-monotonic-clock.md" },
    { "path": "docs/runtime-guardrails.md" },
    { "path": "docs/adr/0003-orderbook-transport-isolation.md" }
  ],
  "supersedes": []
}
-->
# ADR 0022 后续：socket 静默检测、l2 闸门与撤单对账的墙钟计时

## 背景与范围

同步记录。用户要求处理[上一条记录](2026-09-28-subscription-staleness-monotonic-clock.md)与 ADR 0022 列为范围外的三处墙钟计时：`transport-monitor.ts` 的 socket 静默检测、`l2-subscription-gate.ts` 的截止时间，以及 `order-reconciliation.tsx` / `twap-reconciliation.tsx` 用墙钟 `lastMessageAt` 与 `requestStartedAt` / `unconfirmedAt` 比较、用 `Date.now()` 安排超时。要求沿用「单调年龄与墙钟年龄结合」的做法，阈值、订阅键与恢复路径不变，`lastMessageAt` 保持墙钟；用 vitest 4 假计时器把 `Date` 回拨一小时测试；更新 ADR 0022 与运行时护栏 §6，提交不推送。

未取得任务标识（`thread: null`），也没有本地证据快照。基线：worktree 分支 `claude/determined-bell-c34334` 原在 `e3b5dd82`，先 `git merge --ff-only 602df7d6` 快进到上一条记录的提交（分支 `claude/eloquent-swartz-534241`），在其上完成改动并提交 `4bd996bc`。之后发现另一会话在快进后向源分支提交了 `6aa715d7`（Codex 审查修订：节流间隔改为两个时钟取大，另有文档收窄），用户要求 rebase 到它上面：冲突只在 ADR 0022 的状态行与「范围外」一条（两边合并保留）以及生成的 INDEX.md（重新生成），代码无冲突。

## 结论与依据

### 三处缺口（改前）

| 位置 | 改前 | 回拨一小时后 |
| --- | --- | --- |
| socket 静默检测 | `Date.now() - lastMessageAt < inactivityThresholdMs` | 年龄为负，socket 静默也不重连，直到墙钟追上；只剩巡检多流过期重连兜底 |
| 增量 `l2` 闸门 | 截止 `Date.now() + 5_000`，再次等待时剩余 `deadlineAt - Date.now()` | 第一次等待的定时器是相对时间，不受影响；闸门释放后被第三个分组抢先占用、需要再次等待时，剩余等待变成约一小时加 5 秒 |
| 撤单、改单、TWAP 撤单对账 | 墙钟 `lastMessageAt <= requestStartedAt / unconfirmedAt / confirmationStartedAt`；15 秒超时 `now - confirmationStartedAt`，定时器只安排一次 | 新快照被当作早于请求，不确认；超时定时器到点时年龄为负、不转未确认也不再安排；同一订单不能再撤，直到墙钟追上。反方向：回拨前到达的快照在墙钟上晚于回拨后的请求，会被当作请求结果（失败开放） |

### 采用的方案

- 静默检测与闸门：记录两种时钟的起点，经过时间取 `getReceiptAgeMs`（两者较大值），阈值不变。
- 对账：`SubscriptionResult` 新增 `monotonicLastMessageAt`；待确认交易动作 store 为三个时刻各加一个 `monotonic*` 伴随字段，墙钟字段保留；快照先后用 `wasReceivedAfter`，只比较单调读数；15 秒超时用 `getTradingActionConfirmationRemainingMs`（两种年龄取大），组件按 `getNextTradingActionExpiryDelayMs`（向上取整）安排定时器，到点仍未满时重新安排。
- 先后判断不用「取大」：取大对年龄是保守方向，对先后却等于「任一时钟说在后就算在后」，保留回拨前快照被当作新快照的缺口；「两个时钟都说在后」则等于原行为。前跳与休眠不改变两个事件在任一时钟上的先后，只看单调时间在这两种情况下与原结果相同。
- 未改：待确认下单与 TWAP 提交的 `createdAt` 两分钟窗口、`nextCheckAt` 轮询退避、24 小时清理，以及跨标签页资产预留 `expiresAt`。它们写入 localStorage 供其他标签页与刷新后读取，`performance.now()` 不能跨文档比较。回拨发生在待确认提交期间时，这些窗口顺延回拨量，直到 WebSocket 给出结果或墙钟追上；不会误确认。
- 完整取舍与剩余限制见 [ADR 0022 补充](../../adr/0022-subscription-staleness-monotonic-clock.md#补充socket-静默检测l2-订阅闸门与交易动作对账)。

## 验证与限制

2026-09-28，依赖由 `pnpm install --frozen-lockfile --prefer-offline` 装在本 worktree。以下前五项是首轮结果，基线 `602df7d6`（提交 `4bd996bc`）；A/B 对照与变异检查只在首轮做过，rebase 未改动本次的源码与测试逻辑，没有重做。


- 新用例先在原实现上运行（9 个源文件取 `HEAD` 版本，测试文件保持新版，运行后从备份还原并用 `cmp` 核对）：`ws-transport-monitor`、`use-l2-book-subscription`、`order-reconciliation`、`twap-reconciliation`、`use-sub` 五个文件共 10 项失败，即全部回拨用例与 `monotonicLastMessageAt` 断言；「回拨后仍收消息不重连」「socket 前跳后重连」「闸门前跳立即结束」三项在原实现上通过，用于钉住既有行为。后加的「定时器早到时重新安排」在第二次对照中同样失败（对照共 6 项失败）。`pending-trading-action-store.test.ts` 引用新导出，未在原实现上运行。
- 变异检查（逐个改动后运行相关测试文件，再还原核对）：静默检测只用单调年龄 1 项失败（前跳）；负墙钟年龄即判静默 2 项失败；闸门只用单调经过时间 1 项失败（前跳）；确认超时只用单调年龄 3 项失败（含既有的「前跳后捕获定时器」用例）；确认超时只用墙钟年龄 3 项失败；撤单先后改为「任一时钟说在后」1 项失败（回拨前快照）；订单与 TWAP 对账改用墙钟 `lastMessageAt` 各 5 项与 1 项失败；请求开始的单调标记取墙钟值 12 项失败；超时定时器只安排一次、不重新安排 1 项失败。
- `pnpm typecheck`（hl-react、ui、terminal）通过；`pnpm exec biome check` 对 15 个改动的 TS/TSX 文件通过。
- AGENTS.md 订单簿回归组 11 个文件 183 项通过；移动端数据展示回归组 4 个文件 74 项通过；订阅、WebSocket 与对账相关 23 个文件（`store-*`、`staleness`、`use-sub`、`ws-transport-monitor`、`transport-reconnect`、`websocket-*`、`pending-*`、`order-reconciliation*`、`twap-*` 等）294 项通过、1 个文件跳过（`websocket-soak` 默认跳过）。
- 完整单测 `pnpm --filter @gatu/terminal test`：601 个文件通过、1 个跳过，6890 项通过、1 项跳过（比上一条记录多 14 项，即本次新增用例）。确认面回归组的文件都在其中，没有单独再跑。
- rebase 到 `6aa715d7` 之后重跑：`pnpm typecheck` 通过；Biome 对 15 个改动的 TS/TSX 文件通过；订单簿回归组 11 个文件 183 项、移动端数据展示组 4 个文件 74 项通过；订阅、WebSocket 与对账相关 23 个文件 300 项通过、1 个文件跳过（比首轮多 6 项，来自 `6aa715d7` 新增的用例）；完整单测 601 个文件通过、1 个跳过，6896 项通过、1 项跳过。
- 未覆盖：浏览器中真实订阅的回拨对照、修改系统时间、设备休眠与唤醒；`performance.now()` 精度降低导致定时器早到只用测试替身模拟（`performance.now` 读数比计时器时钟慢 0.25 毫秒）。没有运行 `pnpm build` 与浏览器回归套件。

## 后续与替代关系

- 不替代任何记录；上一条记录「仍用墙钟、本次未改」的三项由本记录处理，其余后续事项（资金费率对比文档与 `perpContextsLive` 回拨用例）不变。
- 剩余限制：持久化、跨标签页的提交窗口与资产预留仍用墙钟（见上）；开发用 chaos 冻结仍用墙钟；执行守卫把 `lastMessageAt` 与 `Date.now()` 比较、负年龄按不新鲜处理，原样。
- 未做：浏览器中真实订阅的回拨对照、修改系统时间、设备休眠与唤醒。
- 下一次先查：ADR 0022「补充」一节、`docs/runtime-guardrails.md` §6、`apps/terminal/src/stores/use-pending-trading-action-store.ts`。
