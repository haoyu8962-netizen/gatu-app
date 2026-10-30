# ADR 0045：L1 动作带 15 秒过期时间

- 状态：已接受并实施（2026-10-30；分支 `claude/p1-order-safety`，基于 `dev` `d99c2bc9`）；未合入 `dev`、未发布。是否提供关闭开关待运营方决定（见「后果与边界」）。
- 关联：`packages/hl-react/src/internal/exchange/server-clock.ts`、`packages/hl-react/src/clients.ts`；[签名模型](../hyperliquid-signing.md)；[ADR 0022](0022-subscription-staleness-monotonic-clock.md)（两个时钟取大）；[全功能审查记录](../work-memory/sessions/2026-10-30-full-feature-audit.md) M1。

## 背景

- Hyperliquid 的 L1 动作（下单、撤单、改单、杠杆、逐仓保证金、TWAP、金库划转等）可以带 `expiresAfter`：交易所到这个时间还没接受动作，就拒绝它并返回 `Action already expired`。用户签名动作（转账、提款、授权）不支持这个字段。[交易所接口文档](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint)另写明：因过期被拒的动作按 5 倍消耗地址限额。
- 官方终端默认开启「交易延迟保护」：每个 L1 动作的 `expiresAfter` 为交易所时间加 15 秒，设置里有 `Disable Transaction Delay Protection` 关闭（[官方 FAQ](https://hyperliquid.gitbook.io/hyperliquid-docs/support/faq/trade-outcome-looks-incorrect/what-does-action-already-expired-mean)）。2026-10-30 读官方前端包：`expiresAfter()` 为 `serverTime + Date.now() - localTimeSet + 15000`，`serverTime` 取自账户快照 `userState.serverTime`，收到快照前用本机时间。
- 本终端此前没有设置任何 `expiresAfter`（2026-10-30 审查 M1，Codex 二审 P1）：网络中断或拥堵时，已经签好的下单、撤单可能在用户以为失败、甚至重新下单之后才上链。

## 约束

- 只给 L1 动作加；用户签名动作不变。签名身份、nonce、请求排队、法律与资金锁、执行守卫都不变。
- `expiresAfter` 写进签名的动作哈希，必须在签名前算好。签名方必须是不需要人工确认的 Agent 或邮箱内嵌钱包（`showWalletUIs: false`），否则人工确认的时间会被算进 15 秒；L1 动作按注册表只走交易客户端（`registries/exchange.ts`），满足这一点。
- 本机时钟可能比交易所慢或快几十秒。慢超过 15 秒时，只用本机时间会让所有动作一发出就过期。
- 系统时间可能被往回调，设备也可能休眠（ADR 0022）。

## 决策

1. `createExchangeClient` 与 `getTradingClient` 创建的每个 `ExchangeClient` 都设置 SDK 的 `defaultExpiresAfter`。SDK 只在 `executeL1Action` 里读它，用户签名动作照旧不带该字段。
2. 过期时间为「估计的交易所时间 + 15 秒」，与官方默认一致。
3. 交易所时间来自公开的 `info` 请求 `exchangeStatus`（返回服务器时间 `time`，2026-10-30 实测主网与测试网可用、与本机相差约 0.1 秒）：取样时记下墙钟与单调时钟，估计值为「响应时间 + 往返时间的一半 + 取样后经过的时间」，经过时间取墙钟与单调时钟两者中较大者（复用 ADR 0022 的 `getReceiptAgeMs`），往回调系统时间不会缩短它，休眠时间仍然计入。
4. 取样按网络各一份，惰性进行：第一次 L1 动作前等待取样（最多 2 秒），之后样本超过 60 秒就在后台刷新、不阻塞动作。2 秒内没有拿到可用的服务器时间（失败、超时或往返超过 2 秒）时用本机时间，并在 30 秒内不再重试，与官方收到快照前的做法相同。
5. 交易所返回的 `Action already expired` 已有翻译规则（`exchange-error-text.ts`）：「The request expired before the exchange processed it. Try again.」，本次不改。

## 备选方案

| 方案 | 取舍 |
| --- | --- |
| 只用本机时间（`Date.now() + 15000`） | 最简单；本机时钟慢超过 15 秒的设备上每个动作都会过期。未采用 |
| 像官方一样从账户快照取 `serverTime` | 本终端订阅的是 `clearinghouseState` / `allDexsClearinghouseState`，没有 `webData2`/`webData3` 的 `userState.serverTime`；从 WebSocket 帧里取时间要穿过 SDK 传输层，改动面更大。未采用 |
| 每个动作前都请求一次服务器时间 | 每个动作多一次往返，拥堵时正好拖慢下单。未采用 |
| 同时加「关闭交易延迟保护」开关 | 与官方一致，但涉及新设置项、持久化与七种语言文案，是否需要由运营方决定；本次先按官方默认开启 |

## 后果与边界

- 网络或交易所拥堵超过 15 秒时，下单、撤单会被拒绝并提示过期，用户需要重试；这正是保护的目的。被拒的动作按 5 倍消耗地址限额。
- 没有关闭开关：连接长期很慢的用户无法像在官方终端那样关闭保护。待运营方决定是否加开关（审查记录「需要运营方决定」第 1 项）。
- 本机时钟往前调、或设备在取样后休眠，估计的交易所时间会偏大，保护窗口相应变长，动作不会因此误判过期；往回调由单调时钟兜住。
- 第一次 L1 动作最多多等 2 秒（通常约 0.1–0.3 秒）。
- 金库存取（`vaultTransfer`）、杠杆与保证金调整、ADR 0041 的 `agentSetAbstraction` 等 L1 动作同样带过期时间。

## 验证

- `apps/terminal/src/lib/tests/exchange-action-expiry.test.ts`：本机慢 60 秒时按交易所时间加 15 秒；取样后系统时间往回调一小时仍按单调时间计；服务器时间不可用时回落本机时间且 30 秒内不重试；2 秒超时；超过 2 秒才到的样本不用；超过 60 秒在后台刷新且不阻塞；真实 SDK 交易客户端的 `order` 与 `cancel` 请求体带 `expiresAfter`、只发一次 `exchangeStatus`；用户签名的 `approveBuilderFee` 不带 `expiresAfter`、不请求服务器时间。
- 变异：删去两处 `defaultExpiresAfter` 后，交易客户端的测试失败；已还原。
- 未做：真实网络下的过期拒绝、真实钱包与真机验收。
