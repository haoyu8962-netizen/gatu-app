# ADR 0003: Isolate public order-book grouping at the transport boundary

- Status: Accepted; retrospective record of the implemented decision
- Recorded and checked against repository code: 2026-09-12
- Implementation history: `98a23d08` (`fix(terminal): resolve audited terminal regressions`)

The recording date is not the original decision date. The alternatives below
explain the current tradeoffs; they do not reconstruct an earlier meeting.

## Context and constraints

Public `l2Book` requests contain grouping parameters, but their book frames do
not carry that grouping identity. The pinned SDK's `l2Book` callback filters by
coin; a new listener on a reused physical connection can therefore accept a
different grouping for the same coin. A subscription key or generation counter
identifies a consumer, not the origin of the frame delivered to it.

Incorrect data must be excluded before entering the shared store, cache, price
selection or animation baseline. Simultaneously, grouping switches and multiple
consumers must not create unbounded WebSocket connections. The protocol, SDK
0.33.3 and upstream-limit evidence checked on 2026-09-09 is retained in
[terminal review remediation](../terminal-review-remediation.md).

## Decision

Route public `l2Book` subscriptions through one bounded transport pool. Each
physical stream has an immutable identity:

```text
network + nSigFigs + mantissa + fast
```

Normalize absent grouping values to `null` and `fast` to a boolean. Coin is
intentionally outside this transport key: different coins with the same grouping
share a transport and retain SDK coin filtering. Consumers with the same request
continue to share the SDK subscription. Different grouping, network or fast/full
identities never share a physical stream.

| Pool rule | Purpose / cost |
| --- | --- |
| At most 4 transports across both networks | Bounds page-local connection use; a fifth active identity must wait or retry. |
| Retain an idle transport for 60 seconds | Allows A → B → A reuse; temporarily retains otherwise unused sockets. |
| Reclaim only idle entries | A new identity cannot evict another active consumer. |
| At most 24 new connection attempts per rolling 60 seconds | Leaves room for other application connections; measured with `performance.now()` so wall-clock changes do not reset the budget. |
| Disable SDK auto-reconnect and resubscribe for pooled transports | Failed streams close and application retries reacquire through the same budget. |

Lease release is idempotent. Subscription failure or failed unsubscribe disposes
the failed transport, suppresses later frames and lets SDK failure notifications
reach affected consumers. Ordinary cancellation releases its own lease without
discarding a healthy shared stream. Pending confirmation, active cancellation,
idle cleanup and repeated error callbacks must follow the same ownership rules.
Capacity or rate-limit failure remains an unavailable subscription until recovery;
another grouping's snapshot cannot serve as current data.

### Warm-up and freshest-frame replay (2026-09-14)

The first order-book frame used to arrive 240–370 ms after the terminal grid
on a healthy network: the panel's subscription was the pool's first lease, so
it paid for a new socket handshake and a subscribe round trip after mounting
(task record checkpoint 26). Two additions remove that wait without changing
stream identity:

- The trade entry routes warm the full-book stream for the market the URL
  names from `beforeLoad`, through the same `SubscriptionClient` and pool,
  with a no-op listener that ends after 15 seconds or when a later navigation
  warms another market. Perp, builder-perp and `@index` spot names are API
  coins; a spot pair name waits for the catalog and keeps the old timing.
- The pool remembers the freshest frame per physical transport and payload
  with its monotonic receipt time, and replays it once to a subscriber that
  joins an already confirmed subscription without having received a live
  frame, provided the frame is at most 5 seconds old. The memory is dropped
  when the payload's last lease releases or the transport closes.

The replay is the current state of a live stream on the same transport
(network + grouping + fast) for the same payload, never another grouping's or
network's snapshot; consumers see the same status transitions as before and
only skip the wait for the next server push. Two rules keep that true (added
after the 2026-09-14 adversarial review, task record checkpoint 28):

- The SDK dispatches every `l2Book` frame on a socket to every `l2Book`
  listener and filters by coin only in its method wrapper, so the pool checks
  the frame's coin before it counts as a payload's live frame or overwrites its
  remembered snapshot. Otherwise another coin sharing the grouping transport
  would poison the memory and suppress the replay.
- The remembered frame keeps its wall-clock and monotonic receipt times and
  hands both to the consumer through `markFrameReceivedAt`; `useSub` stamps
  `lastMessageAt` with the wall-clock time and the staleness watchdog with both,
  instead of the delivery time. A replayed frame is therefore exactly as fresh
  as it would have been for a subscriber that had been listening all along, and
  never extends a staleness deadline. (Until 2026-09-28 only the wall-clock time
  travelled; [ADR 0022](0022-subscription-staleness-monotonic-clock.md) added
  the monotonic time so a clock set back between receipt and replay cannot
  re-grant freshness.)
- The store keeps those receipt times through the subscription confirmation
  (added after the 2026-09-15 review, task record checkpoint 29): a resolving
  `subscribe` arms the watchdog with the runtime's last receipt instead of the
  present, and `setSubscriptionData` reads the watchdog's verdict after marking
  the receipt, so a warmed stream whose last frame is already old is stale from
  its first commit instead of gaining up to five seconds.

## Alternatives and tradeoffs

| Alternative | Benefit | Reason not selected |
| --- | --- | --- |
| Shared socket with UI keys or generation counters | Lowest socket count; simple component lifecycle | Cannot establish frame origin when grouping is absent from the event. |
| Wait for unsubscribe ACK, delay or discard an initial frame | Reduces obvious overlap with little infrastructure | No established protocol guarantee makes ACK or elapsed time a drained-frame boundary; a later wrong-group frame can still pass. |
| Infer grouping from price divisibility | Avoids additional connections | Valid prices can overlap across groups; data values cannot prove subscription identity. |
| New socket per consumer or every switch | Strong stream isolation | Loses sharing and can exhaust connection/rate limits during ordinary use. |
| Keep SDK automatic reconnection for isolated streams | Less application recovery logic | Reconnection attempts would bypass the pool's new-connection budget. |

## Consequences and boundaries

Isolation adds sockets and may delay recovery when the bounded pool is saturated.
The budget is local to this module/page instance; it does not coordinate other
tabs, browsers or clients sharing an IP and cannot guarantee upstream capacity.
The application relies on the pinned SDK's cancellation, close and failure
notifications, which must be revalidated during upgrades.

Only public `l2Book` takes this route. Account/other subscriptions and the compact
twenty-level incremental `l2` feed keep their existing transport and lifecycle.
The confusingly named `useL2BookSubscription` hook implements that incremental
`l2` path; its per-coin gate is not the public pool. Compact books retain the
feature-gated incremental primary and public fast fallback; full books use public
full depth. See [feed selection](../../apps/terminal/src/hooks/trade/use-orderbook-feed.ts).

Transport isolation does not replace downstream freshness, market/grouping/feed
identity, complete-snapshot or interaction checks. Prices and sizes stay decimal
strings, cached/unavailable rows stay non-interactive, and initial or recovered
snapshots establish a quiet animation baseline. Geometry and feedback remain in
[order-book layout](../orderbook-layout.md) and
[new-level animation](../orderbook-new-level-animation.md).

The downstream snapshot cache therefore keys on `network + coin + grouping +
actual feed source`, so a cached fast frame can never serve an incremental or
full-depth view. Its expiry compares a `performance.now()` receipt time against
a ten-second budget over at most twelve keys: the user's wall clock is never
compared with exchange timestamps, and a live frame at or newer than the cached
one supersedes it. Because the pinned SDK's `l2Book` callback filters only by
coin, same-coin fast and full frames must also be matched against the requested
feed source before they reach subscription state — a grouping-correct transport
does not make an unrequested depth mode current data.

## Evidence and verification limits

- [Pool implementation](../../packages/hl-react/src/subscriptions/l2-book-transport-pool.ts)
  defines the identity, budgets and lease lifecycle;
  [client routing](../../packages/hl-react/src/clients.ts) applies it only to
  `l2Book` and disables pooled automatic reconnection.
- [Pool regression tests](../../apps/terminal/src/lib/tests/l2-book-transport-pool.test.ts)
  exercise real SDK `l2Book` listeners with controlled transports: simultaneous
  groupings, A → B → A, shared coins, network/fast/mantissa separation, pending
  cancellation, failures, repeated callbacks, idle reclamation and budgets.
- [Mobile subscription tests](../../apps/terminal/src/lib/tests/mobile-orderbook-subscription.test.tsx)
  and [mode tests](../../apps/terminal/src/lib/tests/mobile-orderbook-mode.test.tsx)
  cover downstream grouping/cache behavior. The separate
  [incremental subscription tests](../../apps/terminal/src/lib/tests/use-l2-book-subscription.test.tsx)
  protect its first-snapshot timeout and disconnect gate, and the gate's
  five-second wait, which setting the system clock back cannot stretch
  ([ADR 0022](0022-subscription-staleness-monotonic-clock.md)).

The deterministic harness proves the application isolation rules, not an
upstream ACK guarantee or sustained network reliability. Earlier browser and
test results remain dated in [review remediation](../terminal-review-remediation.md);
that record explicitly separates short browser observation from the opt-in
WebSocket soak test. This retrospective review does not claim a fresh production
connection, long-duration run or renewed verification of external SDK documents.
