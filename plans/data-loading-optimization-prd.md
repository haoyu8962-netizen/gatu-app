# PRD: Trade Page Cold-Start & Cache Optimization

**Status**: Draft
**Author**: Ankit
**Date**: 2026-04-14
**Reference**: Network analysis of `app.hyperliquid.xyz/trade/ETH` (Chrome DevTools MCP)

---

## Background

Users hitting the trade page experience a 4–5 second loading state on every cold start, plus a 1–2s flash where price/volume/24h-change show as "—". This regresses the perceived speed of the entire app — especially noticeable when navigating from external links or hard-refreshing during active trading.

The Hyperliquid official client (`app.hyperliquid.xyz`) handles this differently: a hard reload renders markets and the last seen mark price within ~100ms, with stats hydrating from cache before the live feed connects.

We've inspected their network behavior and storage. Their approach is portable.

## Problem statement

Two visible symptoms, three underlying causes:

| Symptom | User sees | Root cause |
|---|---|---|
| 4–5s blank token selector / coin info bar | "Loading markets…" spinner | React Query has no cross-reload persistence; all 4 metadata APIs (`meta`, `spotMeta`, `perpDexs`, `allPerpMetas`) refetch on every page load |
| Stats flash to "—" for 1–2s | Empty price, volume, OI cells | WebSocket subscription has no first event yet; selected market's mark price is undefined until WS fires |
| Chart renders blank price | "$0.00" or "—" briefly on mount | No localStorage of last-known mark price per coin |

We previously attempted a hand-rolled `localStorage` cache for the 4 metadata queries (`MARKETS_META_CACHE_KEY` in `providers/root.tsx`). That work introduced a circular import between `root.tsx` and `use-markets.tsx` and is not robust enough to ship.

## Goals

1. **Hard reload of the trade page renders markets and last-known mark price within 100ms** when the user has visited within the last 24 hours.
2. **Token selector opens with full data within 100ms** on a warm cache (currently 4–5s).
3. **No cell renders as "—" on cold start** if we have a cached value from a previous session.
4. **Cache implementation is removable, observable, and standard** — uses an off-the-shelf React Query persister, not bespoke save/load code.

## Non-goals

- Replacing WebSocket with HTTP polling (Hyperliquid's choice; not portable to our SDK).
- Pre-fetching with anonymous wallet (`0x0...0`) before connect — separate optimization.
- Service worker caching of static assets — orthogonal.
- Caching the order book L2 data — too volatile, should never be persisted.

## Success metrics

| Metric | Today | Target |
|---|---|---|
| Time to first market list render (warm cache) | 4–5s | <100ms |
| Time to first mark price render (warm cache) | 1–2s | <100ms (last-known value) |
| Network requests on warm hard reload | 4 metadata POSTs | 0 metadata POSTs (within 30 min staleTime) |
| Lighthouse CLS on token selector open | TBD | No regression |
| `localStorage` total footprint | ~50 KB (4 queries) | <250 KB (≤ Hyperliquid's 185 KB + our overhead) |

Validation: DevTools Network panel on second hard reload, manual stopwatch, no automated benchmarks required for v1.

## Requirements

### R1 — Persisted React Query cache
The QueryClient MUST persist a defined subset of queries to `localStorage` and rehydrate them synchronously before the first React render, so `isLoading` is `false` on mount when valid cached data exists.

- Library: `@tanstack/react-query-persist-client` + `@tanstack/query-sync-storage-persister`. Justification: same library Hyperliquid uses, official, throttled writes built in.
- Opt-in per query via a `["persisted", ...]` queryKey prefix (Hyperliquid's convention). Default queries are NOT persisted.
- Storage key: `hl-rq-cache-v1`.
- `buster` value tied to `@hypeterminal/hl-react` major version. Bump on response-shape changes to invalidate all cached data.
- `maxAge: 24h`. Older entries are dropped on read.

### R2 — Last-known mark price cache
The app MUST store the last seen mark (and oracle) price per coin in `localStorage`, and components displaying mark price MUST fall back to this value when the live value is `undefined`.

- Storage key: `hl-last-mark-v1`.
- Shape: `Record<coin, { markPx, oraclePx?, savedAt }>`.
- TTL: 1 hour. Older entries treated as stale and not displayed (we'd rather show "—" than a price more than an hour old).
- Updated whenever the WebSocket delivers a fresh mark for the selected market.
- Read on component mount before any subscription has fired.

### R3 — Last selected coin cache
The app MUST persist the user's last selected coin so the route can hydrate the correct market before zustand restores from its own `persist` middleware.

- Storage key: `hl-last-coin-v1`.
- Used to pre-select the market and pair the cached mark price with it on first paint.

### R4 — Persisted query set (initial scope)
The following queries MUST be marked persisted via R1:

| Query | Reason | Approx size |
|---|---|---|
| `spotMeta` | 120 KB, changes ~weekly | 120 KB |
| `allPerpMetas` | 45 KB, contains `meta` as `[0]` element | 45 KB |
| `perpDexs` | DEX registry, changes ~weekly | 12 KB |
| `userFees` (per user) | Small, low-churn fee schedule | 2.4 KB |
| `outcomeMeta` | Small, rarely changes | <1 KB |

Out of scope for persistence: `webData2`, `allDexsAssetCtxs`, `spotAssetCtxs`, `clearinghouseState`, `openOrders`, anything order-book or fill related.

### R5 — Derive `meta` from `allPerpMetas[0]`
The standalone `useInfo("meta", {})` call SHOULD be removed. `allPerpMetas[0]` returns the same data. This eliminates one parallel network request on cold start without affecting any consumer.

### R6 — Remove the hand-rolled cache
`loadMarketsMetaCache`, `saveMarketsMetaCache`, `MarketsMetaCache` interface, and the `useEffect` saving them in `use-markets.tsx` MUST be deleted. The circular import between `providers/root.tsx` and `lib/hyperliquid/markets/use-markets.tsx` MUST be eliminated.

### R7 — SSR safety
All localStorage access MUST be guarded by `typeof window !== 'undefined'` checks. The persister MUST not run on the server. The QueryClient on the server stays empty (current behavior).

### R8 — Per-query `staleTime` policy
`staleTime` SHOULD reflect actual data churn rather than a single global value:

| Query class | staleTime |
|---|---|
| `spotMeta`, `allPerpMetas` | 30 min |
| `perpDexs` | 5 min |
| `userFees` | 5 min |
| `outcomeMeta` | 30 min |

`isLoading` stays false during background refetch — no UX impact, just controls how aggressively we re-validate.

## User experience

**Cold start (first ever visit, no cache):**
- Identical to today: spinner shown for 3–4s while metadata fetches
- Mark price renders empty until WS fires (~1–2s)
- Cache populates in background

**Warm reload (visited within last 24h):**
- Token selector renders with full market list immediately on mount
- Selected coin's mark price renders from cache within first paint
- Stats columns populate from existing sessionStorage cache (already implemented in `useMarketsInfo.ts`)
- Background refetch updates any stale data silently

**After 30 min idle:**
- Same as warm reload, but a background refetch runs (no spinner shown)

## Risks & open questions

| Risk | Mitigation |
|---|---|
| `PersistQueryClientProvider` restores async — may race with first render | Use synchronous restore in `getRootProviderContext` (current pattern), or accept one-frame delay if measured to be acceptable |
| localStorage quota exceeded | Hyperliquid uses 185 KB; we should stay well under 5 MB browser limit. Add quota-exceeded fallback that no-ops the persister. |
| Stale `userFees` shown after fee tier change | 5min staleTime + background refetch limits exposure. User sees old tier briefly, then it updates. |
| Last-mark-cache shows stale price after long absence | 1h TTL prevents anything older. Better to show "—" than misleading data. |
| `buster` not bumped when response shape changes | Tie buster to `@hypeterminal/hl-react` major version. Add changelog reminder. |

## Out of scope (future work)

- **Anonymous user pre-fetch**: Hyperliquid pre-fetches `userFees` etc. with `0x0...0` so the wallet-connect path is warm. Worth doing later.
- **Service worker offline support**: Beyond the scope of "fast load" — would enable true offline browsing.
- **Persisted L2 book snapshot**: Could show stale book on mount, but volatility makes this risky and confusing.
- **WebSocket-over-service-worker**: Hyperliquid doesn't even use WebSocket on this page. Not relevant.

## Validation plan

Acceptance is binary and visible in DevTools:

1. Visit `/trade/ETH` once. Confirm `localStorage` contains `hl-rq-cache-v1` (≥4 persisted queries) and `hl-last-mark-v1` with an ETH entry.
2. Hard reload. Network panel: zero requests to `info` endpoints for `spotMeta`, `allPerpMetas`, `perpDexs`, `outcomeMeta`. Visual: token selector opens with full data on click. Mark price renders from cache before WS connects.
3. Wait 31 min, hard reload. Same visual behavior, but Network shows background refetches (status 200, not blocking).
4. Clear localStorage, hard reload. Cold-start behavior matches today (no regression).
5. Confirm no circular import warnings in `pnpm build` output.

Manual testing only for v1. No automated perf budget yet.
