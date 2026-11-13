# ADR 0053：动作从入队到签名最多等 15 秒，执行前的法律复核不可暂停

- 状态：已接受并实施（2026-11-12）；分支 `claude/fix-order-submit-deadline`（基于 `dev` `810a45db`），经集成分支 `claude/integration-2026-11-12` 汇总，未合入 `dev`、未发布。在原分支上编号为 0051，集成时改为 0053。同日按三路对抗审查修订（第二个提交）：决策 3 的上限检查移到签名器之前，新增决策 6（离线提交立即失败）与决策 7（截止后放开会话锁与资金锁）。同日按 Codex 复审再修订（第三个提交）：写明签名器之后不受时限约束的边界，新增决策 8（授权流程在签名前检查年龄），决策 7 补上执行前守卫的取消。第四个提交新增决策 9（授权完成时已超时，串联的动作交还给用户）。第五个提交让授权子流程共用总流程的时刻，在调用 `approveAgent` 前再复核一次，并新增「未覆盖的范围」一节。第六次修订（集成分支）新增决策 10：应用层工作流在点击处另记一个 15 秒，在提交前复核，「未覆盖的范围」改写为「应用层入口的点击时限」。真实网络、真实钱包与真机未验收。
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
- 改动集中在 `hl-react` 的调度器、法律复核与 client 创建处，外加应用 `QueryClient` 的 mutation 默认值；包体余量很小，代码尽量紧凑，不新增界面文案。

## 决策

1. **复核只发一次请求，整体 10 秒**（`legal-execution.ts`）。`verifyLegalActionAllowed` 用 `retry: false`、`networkMode: "always"` 调 `fetchQuery`，再与 `LEGAL_STATUS_HTTP_TIMEOUT_MS`（10 秒）的计时器竞速；计时器先到就抛 `LegalActionNotAllowedError("status_unavailable", { statusReason: "timeout" })`。缓存命中规则不变（普通动作 30 秒内复用成功结果，资金动作强制取新）。竞速也覆盖一种会继承暂停的情形：查询已有在途请求时，TanStack 让 `fetchQuery` 加入那个请求（`query.fetch` 的 `continueRetry`），被动查询的重试器若已暂停，复核会跟着挂起。资金锁内的复核同样落在这 10 秒内，复核抛错后 `runWithFundsActionLock` 的回调结束，锁随之释放。
2. **入队到签名的上限为 15 秒**（`request-scheduler.ts` 的 `EXCHANGE_ACTION_START_DEADLINE_MS`），与 ADR 0045 的窗口一致：动作在本地最多再等一个链上窗口，超过就不签。时刻在调度器收到动作时记下（`useExchange` 的 `mutationFn` 同步调用，即点击确认、通过前置校验之后），同时记墙钟与单调时钟，年龄取两者较大者（ADR 0022 的 `getReceiptAgeMs`）：往回调系统时间不会延长上限，设备休眠时单调时钟可能停走，墙钟仍会计入。
3. **上限的终点是调用签名器之前**。起点是入队（决策 2），终点是 SDK 调用钱包的 `signTypedData` 之前；钱包自己的确认弹窗（外部钱包）发生在调用之内，不计入。
   - 调度器为每个有上限的动作设一个计时器：到时动作仍未开始，就以 `ExchangeActionDeadlineError` 拒绝；若它正占着调度器（停在启动闸门里），同时让出位置，排在后面的动作接着执行。仍在闸门里的旧流程之后调用 `start()` 只会得到 `invalidated`，不会签名。后台标签页的计时器会被节流，页面冻结时完全不走，计时器只负责尽早释放。
   - 调度器在调用 SDK 之前（`start()`，会话锁内、`preExecutionGuard` 之后）按年龄检查一次。
   - SDK 从被调用到签名之间还有异步等待：`defaultExpiresAfter()` 的服务器时钟同步（ADR 0045，最多 2 秒，冻结时更久）、SDK 内部的信号量、跨标签页 nonce 锁、owner signer 的 `getAddresses()` / `getChainId()`（`@nktkas/hyperliquid` 0.33.3：`executeL1Action` 先等 `defaultExpiresAfter`，再进 `executeWithShell` 取地址、取锁、取 nonce，最后在 `build` 里签名；用户签名动作在 `build` 里先取链 ID 再签名）。第一轮实现只在 `start()` 检查，审查用真实 SDK 复现了入队 60 秒后才签名、`expiresAfter` 是入队后 75 秒。现在 `clients.ts` 为每个 `ExchangeClient` 建一个「当前动作」槽位：调度器在 `start()` 时写入、执行结束时清空（每个 client 的执行是串行的，让出位置的旧流程永远不会 `run()`），交给 SDK 的钱包包一层 `Proxy`，`signTypedData`（及 ethers 的 `_signTypedData`）调用内层签名器之前按「墙钟与单调钟取大」检查年龄，超过就抛 `ExchangeActionDeadlineError`，内层签名器不被调用。`defaultExpiresAfter` 等完时钟同步后也检查一次，过期的动作不会再拿到新的有效期，也不进 nonce 锁。
   - SDK 把钱包抛出的错误包进 `AbstractWalletError` 的 `cause`；`useExchange` 在 SDK 调用处把它解开成 `ExchangeActionDeadlineError`，所以 `classifyActionError` 与金库失败分类看到的是这个错误本身。
   - 槽位为空时包装层不改变任何行为：Agent 授权（`use-explicit-agent-approval` 每次新建 client）、API 钱包页等不经调度器直接调用 client 的地方，以及无上限的撤单，都照常签名。这些直接调用另由调用方传入的点击时刻约束（决策 8、10）：`createExchangeClient` 的第五个参数把调用方的时刻用作这个 client 的槽位，包装层照常在 `signTypedData` 前检查，于是 SDK 自己在签名器之前的等待（信号量、跨标签页 nonce 锁、取链 ID）也计入。带 `cacheKey` 的 client 不接受这个参数：缓存的 client 比创建它的那次点击活得久。
4. **撤单不受上限约束**：`cancel`、`cancelByCloid`、`twapCancel` 不设上限（`getExchangeStartDeadlineMs`）。撤单只减少敞口；它们已是 `urgent` 优先级，但仍可能排在一个正在等待交易所应答的请求后面，这时让撤单失败，用户想撤掉的单就继续挂在簿上。这与官方文档在地址限额打满时仍允许撤单的思路一致。撤单的法律复核同样只发一次、10 秒封顶（决策 1），所以不会再被无限期暂停。只减仓的下单、改单和 `scheduleCancel` 仍受上限约束：它们会成交或改变挂单。
5. **结果是「没有发出」**。`ExchangeActionDeadlineError` 在 `action-error.ts` 中按名称分类，复用已有译文「The checks before this request took too long. Nothing was signed or sent. Try again.」（与 `AgentRegistrationPreExecutionGuardTimeoutError` 相同，七种语言已有），不是未知结果；金库的失败分类把它列为确定失败（`deterministic`），不会显示为状态未知。通知仍走 ADR 0019 的既有路由：订单通知是失败状态（标题与其他签名前失败相同），正文说明没有签名也没有发出。
6. **离线提交立即失败，联网后不补发**。`useMutation` 默认 `networkMode: "online"`：`onlineManager` 认为离线时，mutation 在进入 `mutationFn` 之前暂停，调度器的计时器还没创建；联网后 `resumePausedMutations` 用旧参数自动继续，没有新的确认（审查复现：离线 `paused: true`，120 秒后联网即 `success`）。`useExchange` 的 mutation 固定 `networkMode: "always"`，放在调用方选项之后，调用方不能覆盖；应用的 `QueryClient`（`providers/root.tsx`，仓库里唯一创建它的地方）把 mutation 默认值设为 `"always"`。离线时动作立即进入 `mutationFn`，在法律复核或请求处按现有路径失败关闭。仓库里其他 `useMutation`（Agent 注册、交易授权、builder fee 授权）没有显式写 `networkMode`，此前都会离线暂停、联网后自动继续，现在改为立即执行并在各自的请求处失败；没有哪一个依赖离线暂停。显式写 `networkMode: "online"` 的只有被动查询 `use-legal-status.ts`（查询，不是 mutation），保持不变。
7. **截止后放开会话锁与资金锁**。资金动作先拿资金锁，再在会话锁上等待（`withSessionLock` 的 `navigator.locks.request` 原来没有 `signal`）。第一轮实现在 15 秒时只拒绝了调用方、让出调度器，旧流程仍卡在会话锁上并持有资金锁，用户按提示重试会在 10 秒后得到「资金操作繁忙」。现在调度器给每个条目一个 `AbortController`，在截止或被作废时 abort；signal 作为启动闸门（`ExchangeRequestStartGate`）的第二个参数传进 `useExchange`，再传给 `startAgentRegistrationExecution` 与会话锁的 `navigator.locks.request`，并在资金锁回调开头与法律复核里检查。尚未开始签名的流程在截止时退出，资金锁回调随之结束。已经 `started` 的动作不受影响，原有锁语义不变。第三个提交补上守卫：已经拿到会话锁、正在跑执行前守卫（`preExecutionGuard`）的流程，原来只听守卫自己 10 秒超时的 controller，调度器截止时收不到取消，两把锁会占到守卫超时为止。现在 `runPreExecutionGuard` 同时监听调度器传下来的 signal，任一中止就结束等待；拿到会话锁后、进入守卫之前，以及法律复核开头（`verifyLegalActionAllowed` 原来只监听之后的 abort），都先检查 signal 是否已经中止，已中止就不进守卫、不发复核请求。`start()` 里的失效检查保持不变。
8. **授权流程在签名前检查年龄**。`useTradingGuard.runExplicitAction` 把动作串在 `authorize()` 之后；授权流程内部的状态查询用的是查询默认的 `networkMode: "online"`，离线时会暂停，联网后继续并签名，授权签名就可能在点击很久之后发生（嵌入式 owner 的 builder fee 授权是静默签名）。现在两个会签名的授权流程各自在流程开始时记下时刻（`startExchangeActionDeadline`，同一个 15 秒常量、墙钟与单调钟取大），在可暂停的查询之后、签名之前检查，超过就抛 `ExchangeActionDeadlineError`，不发起签名：`use-builder-fee-approval.ts` 在 `refetchBuilderFee()` 之后、`approveBuilderFee.mutateAsync` 之前；`use-agent-registration.ts` 在最后一次 `refetchAgent` 预检之后、生成并保存新 Agent 密钥、调用 `approveAgent` 之前（外部钱包的确认弹窗在那次调用之内，不计入）。`approveBuilderFee` 本身经 `useExchange` 排队，另有决策 2、3 的上限。授权之前不需要签名、流程直接结束的情形不受这条检查约束，由决策 9 处理。第五个提交修订：时限从显式授权入口开始算，`useTradingAuthorization.authorize()` 进入时创建截止时刻，传给 builder fee 授权（`approve(deadline)`）与 Agent 注册（`register({ deadline })`），子流程在各自签名步骤之前用这同一个时刻复核，不再各自重新计时；原先总流程第一次 requirements 查询离线暂停 120 秒、恢复后子流程才开始计自己的 15 秒，静默签名仍会发生。子流程被单独调用、没有传入时刻时保持原来的行为（自己开始计时）。授权 mutation 自身也设为 `networkMode: "always"`，不会在进入流程之前离线暂停。Agent 注册在生成密钥之前检查一次，又在真正调用 `approveAgent` 之前紧挨着复核一次（保存待批密钥、`verifyStoredAgent` 都要等会话锁，可能等很久）；这时过期就走已有的失败清理 `cancelAgentRegistrationEpochAndRemove(epoch, publicKey, { preserveIfSubmissionStarted: true })`：尚未开始提交授权的待批密钥按精确的 epoch 与公钥删除，已经开始提交的注册仍按未知结果保留。截止时刻也随 `AgentApprovalOptions.deadline` 传给宿主的授权实现，`use-explicit-agent-approval.ts` 在拿到会话锁、创建签名器之前再检查一次。外部钱包确认弹窗打开之后的时间仍不计入。集成复审后的修订：一次 `authorize()` 同时需要 Agent 与 builder fee 时（外部钱包、带着持仓第一次来、直接在 `TradingActionButton` 上点 `Enable`），第一步的钱包确认常常超过 15 秒（手机上经 WalletConnect 跳转几乎必然），原先第二步沿用总流程的时刻，会被拒绝并显示「没有签名也没有发出」，而 Agent 授权其实已经签名上链。现在 Agent 注册返回后给 builder fee 步骤换一个新的时刻（从注册返回那一刻起算，其后的 requirements 查询仍计入）；这条路径上的 builder fee 授权本身是一次钱包弹窗。没有 Agent 步骤时（嵌入式 owner 的静默签名）仍用总流程的时刻。Agent 已在这次授权里完成、builder fee 步骤仍因超时被拒时（Agent 返回后的 requirements 查询、builder fee 自己的查询或调度器任一处超过 15 秒），总流程抛 `TradingAuthorizationIncompleteError`（原因挂在 `cause`），界面显示已有的「Failed to enable trading」，不再显示「没有签名也没有发出」：Agent 授权其实已经签名上链，按钮仍是 `Enable`，再点一次只请求 builder fee。第六次修订：金库的 Agent 注册、API 钱包页的授权与撤销、Link mobile device 的 Mobile Agent 授权现在都把各自点击的时刻传进来（决策 10），不再属于「没有传入时刻、自己计时」的情形；这一句对其他单独调用仍然成立。
9. **授权完成时离点击已超过 15 秒，串联的动作不再自动执行，由用户重新确认**。`useTradingGuard.runExplicitAction` 在点击时记下时刻（`startExchangeActionDeadline`）；需要授权时，`await authorize()` 返回后若已超过同一个 15 秒上限（墙钟与单调钟取大），就不再调用动作，直接结束，不报错：授权本身已经完成，按钮从 `Enable` 变回正常的确认按钮，弹窗还开着，再点一次就是带着当前数值的新确认。理由：授权内部的查询离线时可能暂停，联网后发现不需要签名、流程直接结束，此时决策 8 拦不到，动作若自动入队会拿到自己全新的 15 秒；外部钱包的授权弹窗本来也可能超过 15 秒，订单的价格界限是点击那一刻算的，隔了半分钟再自动发出不合适。嵌入式钱包的授权是一两秒的静默签名，正常路径仍然自动执行。规则对所有经 `runExplicitAction` 串联的动作一视同仁，不区分是否降风险；不需要授权（`requireAuthorization` 为 false）的调用不受影响。
10. **在调用 `useExchange` 之前自己有等待的工作流，在点击处另记一个 15 秒，提交前复核**（第六次修订）。决策 2 的时刻从入队算起，管不到入队之前：工作流自己等待的预检查询（TanStack `refetch`，默认 `networkMode: "online"`）离线时暂停、第一次失败后的退避期间失焦也暂停，恢复后一路走到提交。做法是「未覆盖的范围」原先列的第一种候选：确认处理函数的第一条语句同步调用 `startExchangeActionDeadline()`，在每次提交调用（`mutateAsync`、`submitOrder`、授权实现）之前用 `assertExchangeSigningDeadline` 或 `hasExchangeActionDeadlinePassed` 复核，超过就不提交，沿用该工作流已有的「未发出」反馈，不新增文案。这个时刻不带进调度器：动作入队后仍按入队时刻另计 15 秒（决策 2、3）。各入口见「应用层入口的点击时限」。

## 备选方案

| 方案 | 取舍 |
| --- | --- |
| 复核保留重试，但改在总时限内自己重试 | 能多扛一次瞬时失败，但要自己实现退避、要处理加入被动请求时的重试策略，代码更多；而 10 秒内单次请求失败，用户重试一次即可。未采用 |
| 只给复核加超时、不设入队上限 | 复核以外的等待（排在一个长请求后面、资金锁等待、会话锁等待、冻结页面里节流的计时器）仍可能让动作很久之后才签名。未采用 |
| 只在 `start()` 检查年龄、不设计时器 | 能保证不签过期的动作，但失败要等到闸门自己结束才报告，调度器与资产锁一直被占着。未采用 |
| 把签名后的 `expiresAfter` 提前到入队时计算 | `expiresAfter` 写进签名哈希，不能脱离签名单独计算；且过期被拒按 5 倍消耗限额。未采用 |
| 撤单也设上限 | 用户要撤的单会因为队列忙而留在簿上，风险方向相反。未采用 |
| 复核前取消在途的被动请求再重新请求 | `cancelQueries` 的 revert 会让并发的复核把旧缓存当作新结果（ADR 0038 审查的教训），不 revert 又会把取消错误写进被动查询的状态。竞速已能封顶，未采用 |
| 在传输层再加一道发送前检查，并区分交互式与非交互式签名器 | 能把签名往返与签名后复核也纳入时限，但要在签名路径上再加一层包装和一个签名器类型标记；剩余窗口只影响金额固定、不涉及价格的用户签名动作，L1 动作已有 `expiresAfter` 兜底。未采用 |
| 为「未发出」新增一种通知状态与标题 | 涉及订单队列、通知文案与七种语言，包体余量不允许；现有失败状态加明确正文已表达结果。留作后续，需运营方决定 |

## 后果与边界

- 页面失焦期间重试的复核不再存在：一次请求失败就立即失败关闭，用户回来后重新提交。偶发的网络抖动会比以前多一次「未发出」提示。
- 被动查询正在暂停时点下单，复核最多等 10 秒，然后失败关闭；页面重新聚焦后被动查询恢复，下一次提交通常命中新结果。
- 资金锁等待（最多 10 秒）、复核（最多 10 秒）、`preExecutionGuard`（最多 10 秒）加起来可以超过 15 秒；这时动作按上限失败，不签名。正常情况下三者合计远低于 15 秒。
- 外部钱包的用户签名动作，钱包确认发生在 `start()` 之后，不计入上限；但同一个用户签名调度器里排在一个等待钱包确认的动作后面的第二个动作，超过 15 秒会失败。
- 会话锁上的等待在截止时被 abort（决策 7）；资金锁的获取等待仍是自己的 10 秒上限，截止后拿到锁的旧流程立即返回。
- 时限的终点是调用签名器之前，签名器之后的步骤不在时限内。对 owner 签名的 client，检查通过之后 `owner-signer-client.ts` 还要 `await verifyOwner()`、走一次嵌入式钱包的异步签名往返、签名后再复核身份，最后才发送；外部钱包则还有确认弹窗。对 L1 动作，`expiresAfter` 在签名前已经算好，迟到的发送会被交易所按过期拒绝，前提是「交易延迟保护」开着、而且服务器时间估计可靠。对用户签名动作（提款、划转、授权等，金额固定、不涉及价格）没有后续保护：页面恰好在签名往返的几百毫秒里被冻结时，仍会在恢复后迟到发出。
- 与 ADR 0045 叠加后的最坏时间：只有在三个条件同时成立时——L1 动作、「交易延迟保护」开启、已有可靠的服务器时间样本——入队到交易所接受才最多约 30 秒（入队到调用签名器最多 15 秒，签名时取的 `expiresAfter` 是估计的交易所时间加 15 秒）。从点击算起还要加上入队之前的时间：串在授权之后的动作（决策 9）和带点击时限的工作流（决策 10）在点击后最多 15 秒才入队，所以点击到交易所接受最多约 45 秒；普通下单在点击和入队之间没有等待，仍是约 30 秒。TP/SL 的替换单不在这个上界内：撤单豁免时限，撤单完成后替换单才入队（见「应用层入口的点击时限」），它离点击多久取决于撤单用了多久。用户签名动作、关闭保护或没有可靠样本时没有这个上限。限价单被接受后何时成交不受这两个时限约束。
- 经 `runExplicitAction` 串在 `authorize()` 之后的动作：第三个提交时记为后续，第四个提交已处理（决策 9）：授权完成时离点击已超过 15 秒，串联的动作不再自动执行，由用户重新确认。原先的情形是：授权不需要签名、但内部查询曾被离线暂停时，决策 8 不拦截，动作会在查询恢复后入队，再拿到自己的 15 秒上限。第三个提交时核对到，确认弹窗里的 `TradingActionButton` 在未就绪（显示 `Enable`）时调用 `guardAction(onClick)`：下单确认、Swap、TP/SL、逐仓保证金、杠杆、保证金模式这六个弹窗没有传 `requireReadyConfirmation`，点击会先授权、成功后自动执行动作本身；市价平仓、全部平仓、限价平仓、反手和 Earn 传了，只授权不执行。这六个弹窗的按钮在跳过之后的状态：`runExplicitAction` 的 `finally` 清掉在途标记，`isEnabling` 由授权状态派生、授权结束后复位，`localError` 不设置；弹窗自己的 `disabled` 只取决于弹窗状态（是否打开、能否提交、是否正在提交），跳过的动作没有调用 `onClick`，不会改动这些状态。所以按钮回到可点的确认按钮；若就绪状态尚未刷新，按钮仍显示 `Enable`，再点一次授权是空操作，随后在时限内执行动作。
- 离线时提交、已经调用到 `useExchange` 的动作立即以「未签名未发送」类错误结束，联网后不会自动补发（决策 6）。入队之前的应用层查询仍可能离线暂停，但列在「应用层入口的点击时限」里的工作流在查询恢复后、调用 `useExchange` 之前按点击时刻复核，超过 15 秒就不提交；没有列出的工作流没有这项检查。
- 每个 `ExchangeClient` 只有一个槽位：若有代码在调度器执行动作的同时直接调用同一个 client，那次直接调用的签名会按正在执行的动作的上限检查。仓库里没有这样的调用（直接调用的 Agent 授权每次新建 client）。
- 调度器的上限从它收到动作时算起，不含调用 `useExchange` 之前的应用层等待（例如首次交易前的 builder fee 授权在钱包里确认的时间）；那段等待由决策 9、10 的点击时刻另行约束，两段各 15 秒，不合并。
- 订单通知标题仍是「订单失败」一类，与其他签名前失败一致；正文写明没有签名或发出。

## 应用层入口的点击时限

第五个提交时这一节叫「未覆盖的范围」，列出在调用 `useExchange` 之前还有无上限等待的入口（2026-11-12 Codex 入口追踪表）。第六次修订按决策 10 逐个处理；另做了一次全量入口审计（`apps/terminal/src` 与 `packages/hl-react/src` 的全部 `useExchange` 调用、唯一不经 `useExchange` 的 `approveAgent`、链上存款与全部 `useMutation`，共 34 处），补上了追踪表之外的三处（API 钱包页、Link mobile device、嵌入式钱包的手动充值）。

| 入口 | 时刻在哪里创建 | 在哪里复核 | 超时后的结果 |
| --- | --- | --- | --- |
| 质押（`use-staking-actions.ts`） | `submit()` 开头 | 写入资金占位之前；调用 `executeStakingMutation` 之前 | `StakingActionPreflightError`，按已有的预检失败报告，不写占位 |
| 金库存取（`use-vault-action-controller.ts`） | `confirm()` 开头 | `vaultTransfer.mutateAsync` 之前 | `ExchangeActionDeadlineError`，金库分类为确定失败 |
| 金库触发的 Agent 注册（同一文件） | `requestAction()` 开头 | 调用 `agentRegistration.register` 之前，并把时刻传给它（决策 8 的复核照常生效） | 不生成密钥、不请求签名 |
| 提款（`deposit-modal.tsx`） | `handleWithdrawSubmit()` 开头 | CCTP 与旧桥两条路径各自的 `mutateAsync` 之前 | 沿用「提款条件已变化」的反馈，不提交 |
| 手动充值（`deposit-modal.tsx` 与 `use-deposit.ts`） | `handleDepositSubmit()` 开头 | 调用 `deposit()` 之前（所有钱包）；`deposit()` 内 EIP-3009 `signTypedData` 之前（仅嵌入式钱包） | 不签名、不提交 |
| Send（`send-modal.tsx`） | `handleSendClick()` 开头 | 目的地址预检之后、`submitSend()` 之前 | 沿用「无法检查目的地址，未发送」的提示 |
| 推荐（`use-referral-actions.ts`） | `submit()` 开头 | 三个 `mutateAsync` 之前 | `ExchangeActionDeadlineError`，「未签名或发送」 |
| TP/SL（`position-tpsl-modal.tsx`） | `handleSubmit()` 开头 | 快照复核之后、撤单之前（此时什么都没发出）。撤单一旦完成，不再按点击时刻拒绝替换单 | 撤单之前超时：什么都没发出。撤单完成后替换单照常入队，只受调度器自己的入队上限约束；调度器拒绝时报失败并说明旧 TP/SL 已撤、新 TP/SL 未下达，不写资产占位 |
| 市价平仓（`position-market-close-submitter.ts`、`use-position-market-close-submit.ts`） | `beginPositionMarketCloseAttempt()`，即确认点击内、写入订单队列之前 | HTTP 快照与平仓计划之后、提交之前 | 「未签名或发送」 |
| 限价平仓、全部平仓、反手（各自的 `use-position-*-submit.ts`） | `submit()` 开头 | 快照与计划之后、进入 `submitting` 之前；限价平仓不自己持有资产锁，把时刻交给 `useTrackedOrder`，在资产锁回调里再复核一次 | 「未签名或发送」 |
| 普通下单、Swap、TWAP（`use-tracked-order.ts`、`use-tracked-twap-order.ts`） | 包装器被调用时（调用方传入时刻则用调用方的） | 资产锁回调的第一条语句，之后到入队全是同步代码 | `ExchangeActionDeadlineError`，「未签名或发送」，不写待确认记录 |
| 逐仓保证金（`position-isolated-margin-modal.tsx`） | `handleSubmit()` 的同步校验之后、任何 `await` 之前 | 资产锁回调的第一条语句 | 「未签名或发送」 |
| API 钱包页的授权与撤销（`use-api-wallet-controller.ts`） | `confirmAction()` 开头 | 随 `AgentApprovalOptions.deadline` 传入：`use-explicit-agent-approval` 在创建签名器前复核一次，并把它绑到授权 client 上，在 `signTypedData` 前再复核 | 按确定失败报告（`isDeterministicApprovalError`），不是结果未知 |
| Link mobile device（`mobile-agent-sync-modal.tsx`） | `handleApprove()` 开头 | 同上 | `approval_failed` |

说明与边界：

- 市价平仓的时刻在点击里创建而不是在提交宿主的 `execute()` 里：页面层的 `PositionMarketCloseSubmitHost` 还没挂载时，`execute()` 要先等它最多 5 秒，这段等待必须计入。
- 手动充值：外部钱包在 `deposit()` 里不按这个时刻拦截，因为切链和签名都要在钱包里再确认一次，等于用户重新同意；嵌入式钱包是静默签名，所以在签名前复核。自动存款（ADR 0040）不是点击触发的，不传时刻，沿用它自己在锁内重读余额、路由与法律状态的规则。
- 签名之后的等待不在这个时限内：充值在签名之后还有链上交易与确认；Agent 授权的两个签名器在拿到签名之后才调用 `beforeSubmit`（法律复核最多 10 秒、会话锁复核），然后发送。授权是用户签名动作，没有 `expiresAfter`，所以签名之后被拖后的授权仍会发出，是已知的剩余窗口（与「后果与边界」里用户签名动作的那一条相同）。
- TP/SL 在撤单完成后不按点击时刻拒绝替换单（集成复审后的修订）。撤单豁免入队上限，可以排在别的请求后面，自己还有法律复核与一次 HTTP 往返，点击 15 秒之后才返回并不罕见，网络越慢越容易发生；这时放弃替换，仓位就失去原有的止盈止损，比晚几秒下一张只减仓的触发单风险更大。替换单的触发价是用户输入的绝对价格，不是点击时算出的价格界限，执行守卫还会在 SDK 边界按实时标记价、仓位方向与数量重新校验。
- 质押把签名器处抛出的 `ExchangeActionDeadlineError`（SDK 边界之后、签名之前）也归为未提交：清掉资金占位，报「请求未提交」，不进入对账（集成复审后的修订；金库与 API 钱包页原本就按名称这样处理）。
- Send 需要二次核对时，第二次点击直接提交，中间没有等待，不另带时刻。金库的 `requestAction` 只在需要 Agent 签名的分支复核；不需要签名时，慢查询之后照常打开金额步骤，`confirm()` 另起自己的时刻。
- 时刻不一定是处理函数字面上的第一条语句：TP/SL、Link mobile device、市价平仓与逐仓保证金在它之前有同步的有效性判断，没有 `await`。
- 资产锁请求带 `ifAvailable`，不排队，但回调仍是异步执行的：页面恰好在请求与回调之间被冻结时，回调会在恢复后才跑。所以凡是在资产锁回调里入队的路径，都在回调里复核（上表的包装器、逐仓保证金，以及自己持锁的市价平仓、全部平仓、反手与 TP/SL）。
- 复核只发生在提交之前。提交之后的结果核对、对账与通知不受影响。
- 审计确认不需要这项检查的入口：撤单与改单、TWAP 撤单（撤单本来就豁免）、杠杆与保证金模式、账户类型、划转、Earn 的借贷（提交前没有 `await`，状态复核在 `useExchange` 的执行守卫里）；授权链由决策 8 覆盖，串联动作由决策 9 覆盖；`UnifiedAccountAutoSetup` 没有前置等待。
- 这是逐个工作流的显式做法，新工作流容易漏：在调用 `useExchange` 或授权实现之前有等待（查询 `refetch`、HTTP 快照、Web Lock、宿主挂载）的新工作流必须照做。没有契约测试能自动发现漏掉的入口，靠本节与评审把关。
- 没有采用的另一种做法：在 `useExchange` 入口判断「最近一次用户操作之后是否发生过切后台或断网」。它要先把自动流程（ADR 0040、ADR 0041）排除在外，否则会误拒。

## 验证

- 新增 `apps/terminal/src/lib/tests/exchange-start-deadline.test.tsx`（8 项）：失焦重试复现（第一次 `legalCheck` 网络失败、退避期间 `focusManager.setFocused(false)`，15 秒内被拒，重新聚焦后不签名、不再请求）；复核从不应答时 10 秒失败并让出调度器；排在挂起请求后的下单在 15 秒被拒而撤单之后照常发出；资金动作的复核加入一个已暂停的被动请求时 10 秒失败、资金锁被释放、之后的资金动作能执行；墙钟或单调时钟任一显示超时都拒绝启动；闸门卡住时调度器让出位置；无上限的请求不过期。
- 修复前（只导出常量与错误类）跑这组测试：8 项中 6 项失败（复核从不应答一项因 SDK 自带 10 秒 HTTP 超时已有上限、对照项无上限两项通过）。
- 变异：复核恢复重试、去掉复核竞速、去掉 `start()` 年龄检查、年龄只用墙钟、去掉计时器、计时器不让出调度器、撤单也设上限、`useExchange` 不传上限，各自让对应测试失败，均已还原。`networkMode` 改回 `online` 没有测试区分（两者都失败关闭，只差等待时长）。以上是第一个提交的读数；第二个提交补了区分用例（见下）。
- `action-error.test.ts`、`vault-action-domain.test.ts` 新增断言：`ExchangeActionDeadlineError` 显示「未签名或发送」文案、金库分类为确定失败；修复前两项失败。
- 2026-11-12 修订（第二个提交）：新增 `apps/terminal/src/lib/tests/exchange-signing-deadline.test.tsx`，用真实的 SDK `ExchangeClient`（`createExchangeClient` 与 `createOwnerSignerClient`）、假的传输层与假的签名器，owner 签名与 Agent 签名两个分支各跑一遍；服务器时钟模块被替换为可控的 `getExpiresAfter`（其余 SDK 路径真实）。用例：时钟同步在入队 60 秒后才返回时下单与资金动作都不签名、不进 nonce 锁；第 14 秒进 SDK、同步再等 2 秒时不签名；nonce 锁等待跨过上限时在钱包处拒绝，错误经 SDK 后仍被 `classifyActionError` 与金库分类认作 `ExchangeActionDeadlineError`；用户签名的提款同样不签名；正常路径签名一次；撤单在同样的等待之后照常签名；执行结束后槽位清空，之后对同一 client 的直接调用照常签名；会话锁被占时截止后资金锁立即被下一个资金动作拿到；`onlineManager` 置离线时 mutation 不暂停、立即失败，120 秒后联网也不发送；`onlineManager` 离线时法律复核不等待；`providers/root.tsx` 的默认值与不经调度器的 client 不受影响。`exchange-start-deadline.test.tsx` 补了 15 秒字面值与豁免名单（三种撤单豁免，`order`、`modify`、`batchModify`、`twapOrder`、`scheduleCancel` 等不豁免）以及「旧流程在第二个动作执行时结束、第三个在排队」的交错用例。
- 审查指出的六个变异（上限按 `requiresAgent` 豁免、`finally` 改成 `finishEntry(this.current ?? entry)`、资金动作豁免、常量改为 150 秒、豁免名单增删、复核改回 `online`）与本次新逻辑的十二个变异（去掉钱包处检查、去掉 `defaultExpiresAfter` 处检查、不写槽位、不清槽位、不解开 `cause`、mutation 不设 `always`、调用方可覆盖、`root.tsx` 无默认值、会话锁不带 signal、拒绝时不 abort、闸门拿不到 signal）各自让测试失败，均已还原。
- 2026-11-12 再修订（第三个提交）：`builder-fee-approval.test.tsx` 新增：真实 `onlineManager` 置离线时，费率状态查询（`networkMode: "online"`）暂停，120 秒后联网，`approveBuilderFee` 没有被调用、调用方拿到 `ExchangeActionDeadlineError`；14 秒内返回时照常授权。`use-agent-registration-race.test.tsx` 新增：预检查询 60 秒后才返回时不调用 `approveAgent`、不保存新密钥。`exchange-signing-deadline.test.tsx` 新增：会话锁在第 14 秒放开、执行前守卫挂起时，第 15 秒截止后两把锁立即释放，下一个带守卫的提款能执行（owner 与 Agent 两个分支）；会话锁授予前已中止时不进守卫、不执行；已中止的 signal 让法律复核不发请求。变异：授权不检查年龄、检查放到签名之后（builder fee 与 Agent 各一）、守卫不监听父 signal、法律复核不检查已中止的 signal、进入守卫前不检查 signal，各自让测试失败，均已还原。`server-clock.ts` 的三个变异（单调钟年龄换成墙钟、`await sync()` 换成 `void sync()`、有效期常量改为 150 秒）在 `exchange-action-expiry.test.ts` 里分别有 6、7、6 项失败，已被既有测试钉住。
- 2026-11-12 第四个提交：`trading-guard-session.test.tsx` 新增：授权 14 秒内完成时动作执行一次；16 秒后完成时动作不执行、没有错误，再次触发时正常执行；真实 `onlineManager` 置离线、授权内部查询暂停 120 秒、联网后不需要签名时动作不执行、没有错误，之后再次触发时正常执行；不需要授权的调用即使在点击后时钟跳过 20 秒也照常执行。变异：去掉这处检查、检查放到动作之后、对不需要授权的调用也生效，各自让测试失败，均已还原。六个弹窗的表现由读代码核对，没有逐个渲染真实弹窗验证。
- 2026-11-12 第五个提交：`trading-authorization.test.tsx` 新增：总流程第一次 requirements 查询（真实 `onlineManager` 离线、查询暂停）120 秒后恢复、仍需 builder fee 或 Agent 签名时，子流程收到总流程的时刻并拒绝签名，调用方拿到 `ExchangeActionDeadlineError`；查询在时限内返回时两项都照常授权；未经 mock 的 `useTradingGuard` 加真实 `useTradingAuthorization`：查询等待期间 `isEnabling` 为真，结束后复位。`builder-fee-approval.test.tsx` 与 `use-agent-registration-race.test.tsx` 各新增：传入的时刻已过期时不签名（子流程不再自己计时）；Agent 注册在生成密钥的检查之后、调用授权之前等待跨过时限时不调用 `approveAgent`，刚保存的待批密钥被删除。`use-explicit-agent-approval.test.tsx` 新增：传入已过期的时刻时不创建签名器、不发请求。`trading-guard-session.test.tsx` 新增：嵌入式 owner 会话同样把超时的动作交还给用户。变异：builder fee 子流程自己计时、Agent 子流程自己计时、总流程不把时刻传给 builder fee、不传给 Agent 注册、调用 `approveAgent` 前不复核、复核移到 `try` 之外（过期后不清理待批密钥）、宿主授权实现不检查时刻、守卫的检查只对没有 owner signer 的会话生效、`verifying` 不计入 `isEnabling`，各自让测试失败，均已还原。
- 2026-11-12 第六次修订（集成分支）：每个入口各有「预检在点击 16 秒后才结束时不提交、不签名，并给出该入口的未发出反馈」与「14 秒时照常提交一次」两类用例，真实 `onlineManager` 或假计时器推进，落在 `use-staking-actions.test.tsx`、`use-vault-action-controller.test.tsx`、`deposit-modal-withdrawal-routing-guard.test.tsx`、`use-deposit-routing-guard.test.tsx`、`funds-action-balances.test.tsx`、`use-referral-actions.test.tsx`、`referral-action-modal.test.tsx`、`position-tpsl-modal.test.tsx`、`position-market-close-submit.test.tsx`、`position-market-close-display-commit.test.tsx`、`position-limit-close-submit.test.tsx`、`position-close-all-submit.test.tsx`、`position-reverse-submit.test.tsx`、`use-api-wallet-controller.test.tsx`、`mobile-agent-sync-modal.test.tsx`。市价平仓另有「提交宿主晚挂载 4.9 秒、快照再等 11 秒时不发送」与「合计 14 秒时发送一次」，用真实弹窗与真实提交路径；把时刻移回 `execute()` 的变异让前者失败。TP/SL 有「撤单完成后超时报旧单已撤、新单未下达」。各入口的变异（去掉复核、时刻改在等待之后创建）由实现与复核两轮代理分别跑过，读数记在任务记录里。Codex 复审后补的两处：`exchange-signing-deadline.test.tsx` 用真实 SDK 的 `approveAgent`，nonce 锁在点击 60 秒后才放开时不签名、不发送，14 秒时签名一次，带 `cacheKey` 的 client 不受传入时刻约束；`tracked-order-hook.test.tsx`、`tracked-twap-hook.test.tsx`、`position-isolated-margin-modal.test.tsx` 用延迟授予的资产锁，16 秒时不入队、14 秒时入队一次，`position-limit-close-submit.test.tsx` 断言限价平仓把点击时刻交给包装器。九个变异（去掉三处锁内复核、包装器不用调用方的时刻、限价平仓不传、client 忽略时刻、缓存的 client 也绑定、授权实现不传、不解开 SDK 包装的错误）各自让对应测试失败，均已还原。仍抓不到的变异（Codex 的覆盖分析，未实际跑）：把 `use-deposit.ts` 的复核挪到最后一组余额与路由请求之前；把金库的复核挪到写入资金占位之前。
- 未做：真实网络、真实钱包、真机与后台冻结页面的验收；没有逐个渲染六个串联授权的弹窗；签名之后的等待（见上一节）没有覆盖。
