# @sairn/hl-react

React bindings for the Hyperliquid API. Wraps [`@nktkas/hyperliquid`](https://github.com/nktkas/hyperliquid) with hooks for info queries, WebSocket subscriptions, signed exchange mutations, and owner/Agent signer lifecycles.

Source-shipped workspace package — `"main": "./src/index.ts"`, no build step. Consumers import TypeScript directly.

## What it owns

Everything about talking to Hyperliquid from React:

- **Transports** — `HttpTransport` (REST) and `WebSocketTransport` (streaming), cached per environment.
- **Clients** — `InfoClient`, `SubscriptionClient`, `ExchangeClient`, assembled per-wallet.
- **Hooks** — `useInfo` (REST), `useSubscription` (WS), `useExchange` (signed mutation), plus higher-level conveniences.
- **Signing** — a host-provided exact owner signer or a verified Agent/API wallet; the terminal uses its Privy embedded owner for ordinary email trading and Agents for external-wallet/Agent-only trading.
- **Reliability** — reconnect/backoff, batch updates, payload-size guards, ring-buffer accumulation for high-frequency streams.

Anything above this layer (e.g. market metadata caches, order validation, UI state) lives in the consuming app.

## Directory layout

```
packages/hl-react/src/
├── index.ts                       public exports (also: /store, /markets/types, /registries/*, /internal/*)
├── provider.tsx                   HyperliquidProvider composes transport/session providers
├── provider-context.ts            transport, session and combined contexts
├── session-provider.tsx           owner/session identity and exchange lifecycle
├── transport-provider.tsx         environment-scoped clients and subscription store
├── store.ts                       Zustand store — subscriptions, WS status, reconnect/cooldown timers
├── clients.ts                     Cached client factories (per env, per wallet)
├── wallet.ts                      wagmi WalletClient → Hyperliquid AbstractWallet adapter
├── create-config.ts               config builder
├── capabilities.ts · asset-id.ts  asset/market helpers
├── errors.ts · explorer.ts
├── hooks/
│   ├── useClients.ts              composes info / subscription / trading / user clients
│   ├── useInfo.ts                 REST queries via TanStack Query
│   ├── useSubscription.ts         WS subscriptions with ring-buffer accumulation
│   ├── useExchange.ts             signed mutations (agent or user wallet)
│   ├── useTransport.ts            raw transport access
│   ├── useTradingGuard.ts         pre-submit validation
│   └── useApiStatus.ts
├── signing/                       owner signer and agent-wallet lifecycle
│   ├── agent-storage.ts           owner/env-scoped sessionStorage or localStorage, Zod-validated
│   ├── owner-signer-provider.tsx  host owner strategy and current-session assertions
│   ├── owner-signer-client.ts     session-bound guarded owner clients
│   ├── use-trading-status.ts      signer readiness separate from real Agent approval
│   ├── use-agent-wallet.ts        cached PrivateKeyAccount signer
│   ├── use-agent-registration.ts  multi-step registration mutation
│   └── use-agent-status.ts        queries registration requirements
├── account/                       useUserPositions (clearinghouse state)
├── query/keys.ts                  query/subscription key serialization
├── registries/                    per-method metadata
│   ├── subscription.ts            accumulator config (trades, fills, fundings, orders)
│   └── exchange.ts                exchange method metadata
├── types/
│   ├── clients.ts                 re-exported SDK method/param/response types
│   └── markets.ts                 perp/spot market types
└── internal/
    ├── websocket/
    │   ├── reliability.ts         exponential backoff, cooldown, limits
    │   ├── batch-updater.ts       rAF batching + throttling
    │   └── payload-guard.ts       size estimation + per-method limits
    └── circular-buffer/
        ├── ring-buffer.ts
        └── use-ring-buffer.ts
```

## Setup

Minimal disconnected data example, inside the host's `WagmiProvider` and
`QueryClientProvider`:

```tsx
import { HyperliquidProvider } from "@sairn/hl-react";

<HyperliquidProvider
  env="Mainnet"
  userAddress={undefined}
  allowAgentOnlySession={false}
  builderConfig={undefined}
>
  <MarketData />
</HyperliquidProvider>
```

This is not the terminal's trading setup. The [application host](../../apps/terminal/src/providers/client-root.tsx)
supplies resolved session identity, exchange policy, legal enforcement, builder
configuration and explicit Agent approval. Its [owner signer bridge](../../apps/terminal/src/providers/hyperliquid-owner-signer-bridge.tsx)
supplies the exact Privy embedded owner strategy. Preserve this composition and
the [SSR/client runtime boundary](../../apps/terminal/README.md#provider-and-data-flow)
when integrating signed actions.

## Hook taxonomy

All hooks are strongly typed against the SDK's method signatures — if a method exists on the underlying SDK, a typed hook path exists for it.

Endpoint coverage is intentionally generic rather than one-hook-per-endpoint:

| SDK client | React hook | Example |
|---|---|---|
| `InfoClient` | `useInfo(method, params, options)` | `useInfo("perpDexs", undefined)` |
| `SubscriptionClient` | `useSubscription(method, params, options)` | `useSubscription("allDexsAssetCtxs", undefined)` |
| compact market contexts (`pac`, `sac`; not in the SDK) | the same `useSubscription` | `useSubscription("pac", undefined)` — a complete base64 + raw DEFLATE snapshot followed by changed-field deltas, decoded and merged by `subscriptions/compact-asset-ctxs.ts`; consumers receive the accumulated view |
| `ExchangeClient` | `useExchange(method, options)` | `useExchange("sendToEvmWithData")` |

The workspace and this package's peer dependency pin `@nktkas/hyperliquid` to
`0.33.3`; see [package.json](package.json). Generic hook method names and request
types come from that installed SDK. An upstream branch or another SDK version
does not establish endpoint support or validation for this checkout.

### `useInfo` — REST one-shot queries

Thin wrapper around `InfoClient` methods (`meta`, `userFills`, `clearinghouseState`, `l2Book`, etc.), cached by TanStack Query via `infoKey` / `infoQueryOptions`.

```ts
const { data } = useInfo("userFills", { user: address });
```

#### `persist: true` — cross-reload caching

Pass `persist: true` to route the query through a `["persisted", ...]` key prefix. Consuming apps wire up `@tanstack/react-query-persist-client` with `shouldDehydrateQuery: (q) => q.queryKey[0] === "persisted"` so only explicitly opted-in queries survive a reload. Low-churn metadata (`spotMeta`, `allPerpMetas`, `userFees`) benefits; volatile streams (order books, fills) never should.

```ts
const { data } = useInfo("spotMeta", undefined, { persist: true, staleTime: 30 * 60_000 });
```

Key helpers: `infoKey(method, params, env)` (default) and `infoPersistedKey(method, params, env)` (prefixed). The required environment scopes both in-memory and persisted data to Mainnet or Testnet. Constant: `PERSISTED_QUERY_PREFIX`.

### `useSubscription` — WebSocket streams

Wraps `SubscriptionClient` methods. The `registries/subscription.ts` config decides whether a stream accumulates into a ring buffer (e.g. `trades`, `userFills`, `userFundings`, `orderUpdates`) or replaces state (`l2Book`, `allMids`).

```ts
const { data, status } = useSubscription("trades", { coin: "BTC" });
```

Backing store tracks `status` (`idle | subscribing | active | error`) per key, refcounts subscribers, and handles reconnect automatically.

### `useExchange` — signed mutations

Wraps `ExchangeClient` methods (`order`, `cancel`, `modify`, `approveAgent`, `approveBuilderFee`, `withdraw3`, `sendToEvmWithData`, …). Returns a TanStack Query mutation. `registries/exchange.ts` selects the trading or user client; [useClients.ts](src/hooks/useClients.ts) resolves the actual signer. A host-provided owner strategy supplies both clients for ordinary email trading. Without that strategy, trading actions require a verified Agent and user-signed methods require a connected wallet matching the selected owner, case-insensitively. When owner mode is selected, a missing wallet or invalid owner fails closed without falling back to an Agent or another wallet.

When `HyperliquidProvider` enables `enforceLegalActions`, every method checks
the exact master owner through the short-lived `legalCheck` cache immediately
before entering the signing/SDK boundary. Missing terms, restrictions, stale
failed queries, offline state, and unknown response contracts fail closed.

User-wallet routed methods currently include:

```text
approveAgent
approveBuilderFee
cDeposit
cWithdraw
convertToMultiSigUser
linkStakingUser
sendAsset
sendToEvmWithData
spotSend
tokenDelegate
usdClassTransfer
usdSend
userDexAbstraction
userPortfolioMargin
userSetAbstraction
withdraw3
```

### `useAgent*` — agent wallet lifecycle

| Hook | Role |
|---|---|
| `useTradingStatus` | Reports owner/Agent signer mode and readiness separately from builder-fee readiness; ordinary email readiness is not evidence of Agent approval. |
| `useAgentStatus` | Independently reports Agent approval, builder-fee approval, the registered Agent address, a definitive missing reason, and typed status-check failures that preserve their cause. |
| `useAgentRegistration` | Generates an Agent key, persists it as unverified approval-pending before signing, and requires a host `HyperliquidAgentApprovalProvider` to request `approveAgent`; there is no generic signing fallback. The host atomically records the exact signed transport boundary before the exchange request starts, then the hook verifies the freshly approved address. States: `idle -> approving_agent -> verifying -> idle/error`; failures expose the phase and automatic mutation retry is disabled. Lost responses, timeouts, and verification failures remain durably bound to the exact owner, environment, epoch, and stored key across remounts. Cross-tab coordination contains only the public key and timestamps; the private key remains in the selected Agent storage scope. Another tab can resume only the exact same candidate and otherwise fails closed. A pre-submission failure removes the candidate without classifying error text; a submitted candidate is never replaced merely because a later status check misses it. Retries reconcile the latest cross-tab record and may move the same key and markers between storage scopes. The optional application-review marker is forwarded only to the host approval path. It does not approve the builder fee. |
| `useAgentWallet` | Returns `{ data, signer, address, isReady }` — the cached `PrivateKeyAccount` used for trading signatures. |
| `useBuilderFeeApproval` | Requests and verifies `approveBuilderFee` independently from Agent registration. |
| `useTradingAuthorization` | Confirms the selected trading signer, registers an Agent only when required, and separately approves a builder fee only when the requested action requires it. Owner-mode authorization does not generate an Agent. |
| `useLegalStatus` / `useTermsAcceptance` | Reads the strictly validated `legalCheck` contract and signs/submits `acceptTerms2` with the matching owner wallet. These frontend endpoints are not part of Hyperliquid's currently documented public API and remain version-locked. |

Agent keys use `hyperliquid_agent_{env}_{userAddress}` with Zod validation.
Session-only records live in `sessionStorage`; persistent records live in
`localStorage`. `hyperliquid.persist_trading_connection` selects the scope and
defaults to `false`. A session record takes precedence over a persistent record
for the same owner and environment. `StorageEvent` listeners synchronize
persistent records across tabs; session records intentionally remain tab-local.

See [trading onboarding](../../docs/trading-onboarding.md) and
[email trading signing](../../docs/email-trading-signing.md) for the required
first-time flow and the separation between legal acceptance, signer setup,
funding classification, deposit guidance and builder-fee approval. Login,
refresh and status checks never sign.

### `useClients`, `useTransport`, `useTradingGuard`, `useApiStatus`

Composition and utility hooks — direct transport access, pre-submit validation, health checks.

## Clients & caching

`clients.ts` keeps a module-level `Map` keyed by environment + (for trading clients) wallet address:

```
http:{testnet}                   → HttpTransport
ws:{testnet}                     → WebSocketTransport
info:{testnet}                   → InfoClient
subscription:{testnet}           → SubscriptionClient
trading:{address}:{testnet}      → ExchangeClient(agent signer)
```

`createExchangeClient(wallet, isTestnet)` produces a fresh client for user-wallet signing (approvals, withdrawals) without polluting the cache.

[owner-signer-client.ts](src/signing/owner-signer-client.ts) separately caches
owner clients by live signer-strategy object and environment in a `WeakMap`.
These clients revalidate the exact owner before/after signing and at transport
submission; they do not use the address-keyed Agent client cache.

## WebSocket reliability

Lives in `src/internal/websocket/`:

| File | Role |
|---|---|
| `reliability.ts` | Reconnect: exponential backoff (250 ms → 5 s, ±20% jitter). After 20 failed attempts → 30 s cooldown. Subscription ceiling: 800 keys. |
| `payload-guard.ts` | Estimates payload size (UTF-16, capped traversal depth 20). Per-method limits: 256 KB default, `l2Book` 1 MB, `allMids`/`assetCtxs` 512 KB, `trades` 384 KB. Oversized payloads emit a warning signal. |
| `batch-updater.ts` | `createBatchedUpdater` flushes via `requestAnimationFrame` (16 ms fallback on Node). `createThrottledUpdater` caps update rate per key. |

The Zustand store (`store.ts`) drives the lifecycle: `acquireSubscription` bumps refcount + schedules subscribe; on failure, attaches a failure listener and schedules reconnect; `releaseSubscription` tears down at refcount 0.

## Peer dependencies

```json
"@nktkas/hyperliquid":   "0.33.3",
"@tanstack/react-query": ">=5.90.16 <6",
"react":                 ">=19.0.0 <20",
"viem":                  ">=2.42.1 <3",
"wagmi":                 ">=3.1.0 <4",
"zod":                   ">=4.3.4 <5",
"zustand":               ">=5.0.9 <6"
```

No runtime dependencies — everything is peer, so the consuming app controls versions.

## Subpath exports

Fine-grained entry points for consumers that want only part of the surface:

```ts
import { useHyperliquidStore } from "@sairn/hl-react/store";
import { useExchange } from "@sairn/hl-react/hooks/useExchange";
import type { PerpMarket } from "@sairn/hl-react/markets/types";
import { getAccumulateConfig } from "@sairn/hl-react/registries/subscription";
import { estimatePayloadSizeBytes } from "@sairn/hl-react/internal/websocket/payload-guard";
import { RingBuffer } from "@sairn/hl-react/internal/circular-buffer/ring-buffer";
```

## Conventions

Per `.claude/rules/hyperliquid.md`:

- **Keep strings.** The API returns exact-decimal strings; pass them through. Don't cast to `number` unless you must.
- **Use `big.js` inline** where math is needed: `Big(size).times(price).toString()`.
- **No wrapper types.** Use SDK types directly (`Meta`, `L2Book`, `OrderRequest`, …).
- **`Big.cmp()` for comparison/sorting** to preserve precision.
- Before adding a helper, ask: does the SDK already do this?
