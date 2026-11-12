# ADR 0051：动作从入队到签名最多等 15 秒，执行前的法律复核不可暂停

- 状态：已接受并实施（2026-11-12）；分支 `claude/fix-order-submit-deadline`（基于 `dev` `810a45db`），未合入 `dev`、未发布。真实网络、真实钱包与真机未验收。
- 关联：[ADR 0045](0045-l1-action-expiry.md)（L1 动作带 15 秒 `expiresAfter`）；[ADR 0022](0022-subscription-staleness-monotonic-clock.md)（年龄取单调时钟与墙钟较大者）；[ADR 0019](0019-global-trading-notifications.md)、[ADR 0024](0024-translate-action-errors-at-render.md)（结果通知与错误文案）；[签名模型](../hyperliquid-signing.md)；[运行时守则](../runtime-guardrails.md) §1；2026-11-12 全局缺陷审查 P1-1（提交 `9395acca` 的 `docs/work-memory/sessions/2026-11-12-global-defect-review.md`）。

## 背景

`useExchange` 把每个动作交给按 `ExchangeClient` 排队的调度器（`request-scheduler.ts`）。轮到它时，启动闸门先复核法律状态：普通动作 `verifyLegalAccess(false)`，交易签名器的资金动作在跨标签页资金锁内 `verifyLegalAccess(true)`，然后在会话锁下调用 SDK，SDK 才签名。

复核用 `queryClient.fetchQuery`，带被动查询同样的重试策略（网络错误、超时、5xx 重试 2 次，429 重试 1 次，退避 1–10 秒）和 `networkMode: "online"`。`@tanstack/query-core` 5.90.16 的重试器在每次退避结束时检查 `focusManager.isFocused()`，页面不在前台就暂停，直到重新聚焦，没有上限（`retryer.js` 的 `canContinue` 与 `pause`）；`networkMode: "always"` 也不能避免这种失焦暂停。用户签名的资金动作把复核放在有 10 秒超时的 `preExecutionGuard` 里，交易签名器的资金动作和普通动作没有任何总超时。

于是：页面停留超过 30 秒（法律状态的新鲜期）后点下单，第一次 `legalCheck` 失败；用户在退避的 1–10 秒内切走标签页、锁屏或切到别的应用；几分钟或几小时后回来，重试成功，限价单直接签名发出，市价单只要价格没越过滑点界也会发出。暂停期间调度器被占用，`use-tracked-order.ts` 持有的该资产 Web Lock 也不释放，其他标签页在这个资产上的下单与平仓被判为 blocked。

ADR 0045 的 `expiresAfter` 在 SDK 签名时才计算，管不到签名之前的等待。官方终端也在签名时计算（`expiresAfter()` 为估计的服务器时间加 15 秒，HTTP 请求 15 秒中止），但它在点击和签名之间没有可暂停的等待；官方 FAQ 的语义是动作 15 秒内没被接受就过期。官方文档还写明，因 `expiresAfter` 过期被拒的动作按 5 倍消耗地址限额，所以已经等太久的动作应在本地失败关闭，而不是签出去让链拒绝。

## 目标与约束

- 从动作入队到开始签名有上限；超过上限的动作在签名前失败关闭，用户被告知「没有签名也没有发出」。
- 执行路径上的法律复核不再可暂停，整体有超时，超时按现有的 `status_unavailable` 失败关闭。界面显示用的被动法律状态查询（`use-legal-status.ts`）保留原有重试策略。
- 失败时释放调度器的位置、资金锁和资产锁。
- 不改变签名身份、`expiresAfter`、nonce、执行守卫、确认面板与通知路由的既有规则。
- 只在 `hl-react` 调度器与法律复核处改动；包体余量很小，代码尽量紧凑，不新增界面文案。

## 决策

1. **复核只发一次请求，整体 10 秒**（`legal-execution.ts`）。`verifyLegalActionAllowed` 用 `retry: false`、`networkMode: "always"` 调 `fetchQuery`，再与 `LEGAL_STATUS_HTTP_TIMEOUT_MS`（10 秒）的计时器竞速；计时器先到就抛 `LegalActionNotAllowedError("status_unavailable", { statusReason: "timeout" })`。缓存命中规则不变（普通动作 30 秒内复用成功结果，资金动作强制取新）。竞速也覆盖一种会继承暂停的情形：查询已有在途请求时，TanStack 让 `fetchQuery` 加入那个请求（`query.fetch` 的 `continueRetry`），被动查询的重试器若已暂停，复核会跟着挂起。资金锁内的复核同样落在这 10 秒内，复核抛错后 `runWithFundsActionLock` 的回调结束，锁随之释放。
2. **入队到签名的上限为 15 秒**（`request-scheduler.ts` 的 `EXCHANGE_ACTION_START_DEADLINE_MS`），与 ADR 0045 的窗口一致：动作在本地最多再等一个链上窗口，超过就不签。时刻在调度器收到动作时记下（`useExchange` 的 `mutationFn` 同步调用，即点击确认、通过前置校验之后），同时记墙钟与单调时钟，年龄取两者较大者（ADR 0022 的 `getReceiptAgeMs`）：往回调系统时间不会延长上限，设备休眠时单调时钟可能停走，墙钟仍会计入。
3. **两处执行上限**。
   - 调度器为每个有上限的动作设一个计时器：到时动作仍未开始，就以 `ExchangeActionDeadlineError` 拒绝；若它正占着调度器（停在启动闸门里），同时让出位置，排在后面的动作接着执行。仍在闸门里的旧流程之后调用 `start()` 只会得到 `invalidated`，不会签名。
   - 后台标签页的计时器会被节流，页面被冻结时完全不走，所以调度器在调用 SDK 之前（`start()`，即会话锁内、`preExecutionGuard` 之后）再按年龄检查一次，超过上限同样拒绝。这一步是最终保证，计时器只负责尽早释放。
4. **撤单不受上限约束**：`cancel`、`cancelByCloid`、`twapCancel` 不设上限（`getExchangeStartDeadlineMs`）。撤单只减少敞口；它们已是 `urgent` 优先级，但仍可能排在一个正在等待交易所应答的请求后面，这时让撤单失败，用户想撤掉的单就继续挂在簿上。这与官方文档在地址限额打满时仍允许撤单的思路一致。撤单的法律复核同样只发一次、10 秒封顶（决策 1），所以不会再被无限期暂停。只减仓的下单、改单和 `scheduleCancel` 仍受上限约束：它们会成交或改变挂单。
5. **结果是「没有发出」**。`ExchangeActionDeadlineError` 在 `action-error.ts` 中按名称分类，复用已有译文「The checks before this request took too long. Nothing was signed or sent. Try again.」（与 `AgentRegistrationPreExecutionGuardTimeoutError` 相同，七种语言已有），不是未知结果；金库的失败分类把它列为确定失败（`deterministic`），不会显示为状态未知。通知仍走 ADR 0019 的既有路由：订单通知是失败状态（标题与其他签名前失败相同），正文说明没有签名也没有发出。

## 备选方案

| 方案 | 取舍 |
| --- | --- |
| 复核保留重试，但改在总时限内自己重试 | 能多扛一次瞬时失败，但要自己实现退避、要处理加入被动请求时的重试策略，代码更多；而 10 秒内单次请求失败，用户重试一次即可。未采用 |
| 只给复核加超时、不设入队上限 | 复核以外的等待（排在一个长请求后面、资金锁等待、会话锁等待、冻结页面里节流的计时器）仍可能让动作很久之后才签名。未采用 |
| 只在 `start()` 检查年龄、不设计时器 | 能保证不签过期的动作，但失败要等到闸门自己结束才报告，调度器与资产锁一直被占着。未采用 |
| 把签名后的 `expiresAfter` 提前到入队时计算 | `expiresAfter` 写进签名哈希，不能脱离签名单独计算；且过期被拒按 5 倍消耗限额。未采用 |
| 撤单也设上限 | 用户要撤的单会因为队列忙而留在簿上，风险方向相反。未采用 |
| 复核前取消在途的被动请求再重新请求 | `cancelQueries` 的 revert 会让并发的复核把旧缓存当作新结果（ADR 0038 审查的教训），不 revert 又会把取消错误写进被动查询的状态。竞速已能封顶，未采用 |
| 为「未发出」新增一种通知状态与标题 | 涉及订单队列、通知文案与七种语言，包体余量不允许；现有失败状态加明确正文已表达结果。留作后续，需运营方决定 |

## 后果与边界

- 页面失焦期间重试的复核不再存在：一次请求失败就立即失败关闭，用户回来后重新提交。偶发的网络抖动会比以前多一次「未发出」提示。
- 被动查询正在暂停时点下单，复核最多等 10 秒，然后失败关闭；页面重新聚焦后被动查询恢复，下一次提交通常命中新结果。
- 资金锁等待（最多 10 秒）、复核（最多 10 秒）、`preExecutionGuard`（最多 10 秒）加起来可以超过 15 秒；这时动作按上限失败，不签名。正常情况下三者合计远低于 15 秒。
- 外部钱包的用户签名动作，钱包确认发生在 `start()` 之后，不计入上限；但同一个用户签名调度器里排在一个等待钱包确认的动作后面的第二个动作，超过 15 秒会失败。
- 会话锁（`withSessionLock`）的等待本身仍没有上限；上限到时调度器让出位置、调用方收到失败，停在锁上的旧流程拿到锁后不会签名。
- 上限从调度器收到动作时算起，不含调用 `useExchange` 之前的应用层等待（例如首次交易前的 builder fee 授权在钱包里确认的时间）。
- 订单通知标题仍是「订单失败」一类，与其他签名前失败一致；正文写明没有签名或发出。

## 验证

- 新增 `apps/terminal/src/lib/tests/exchange-start-deadline.test.tsx`（8 项）：失焦重试复现（第一次 `legalCheck` 网络失败、退避期间 `focusManager.setFocused(false)`，15 秒内被拒，重新聚焦后不签名、不再请求）；复核从不应答时 10 秒失败并让出调度器；排在挂起请求后的下单在 15 秒被拒而撤单之后照常发出；资金动作的复核加入一个已暂停的被动请求时 10 秒失败、资金锁被释放、之后的资金动作能执行；墙钟或单调时钟任一显示超时都拒绝启动；闸门卡住时调度器让出位置；无上限的请求不过期。
- 修复前（只导出常量与错误类）跑这组测试：8 项中 6 项失败（复核从不应答一项因 SDK 自带 10 秒 HTTP 超时已有上限、对照项无上限两项通过）。
- 变异：复核恢复重试、去掉复核竞速、去掉 `start()` 年龄检查、年龄只用墙钟、去掉计时器、计时器不让出调度器、撤单也设上限、`useExchange` 不传上限，各自让对应测试失败，均已还原。`networkMode` 改回 `online` 没有测试区分（两者都失败关闭，只差等待时长）。
- `action-error.test.ts`、`vault-action-domain.test.ts` 新增断言：`ExchangeActionDeadlineError` 显示「未签名或发送」文案、金库分类为确定失败；修复前两项失败。
- 未做：真实网络、真实钱包、真机与后台冻结页面的验收；全量终端 Vitest 与生产构建（包体）由主会话之后统一运行。
