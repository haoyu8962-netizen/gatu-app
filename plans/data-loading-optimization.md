# Data Loading & Cache Optimization Plan

**Goal**: Eliminate the 4–5s cold-start delay and the "—" stat flash on the trade page and token selector.

**Reference**: Network analysis of `app.hyperliquid.xyz/trade/ETH` performed 2026-04-14 via Chrome DevTools MCP. Their app uses `@tanstack/react-query-persist-client` with localStorage, plus a `last-coin + last-price` cache for instant chart render.

---

## Problems we're solving

1. **Cold-start spinner (4–5s)** — On every hard reload, all 4 market metadata queries (`meta`, `spotMeta`, `perpDexs`, `allPerpMetas`) refetch from scratch. `markets.isLoading = true` blocks the whole token selector.
2. **Stats flash to "—" (1–2s)** — Even when markets render, `allDexsCtxs` / `spotCtxs` come from the WebSocket subscription, which has no first-event until the connection establishes.
3. **Empty mark price on chart mount** — The selected coin's price renders blank until `webData2` / mark px streams arrive.
4. **Hand-rolled `localStorage` cache in `providers/root.tsx`** — The current `MARKETS_META_CACHE_KEY` implementation creates a circular import with `use-markets.tsx`, has no version-aware buster, and only covers 4 queries.

## Non-goals (this plan)

- Replacing the WebSocket transport (their decision to poll over CloudFront is interesting but not portable to our SDK).
- Pre-fetching with anonymous wallet (`0x0...0`) — separate optimization, defer.
- Service worker caching of static assets — separate concern.

---

## Phase 1 — Replace hand-rolled cache with `react-query-persist-client`

**Why**: Removes the circular import, throttles writes automatically, hydrates synchronously into the QueryClient before React mounts, and is the industry-standard solution Hyperliquid uses.

**Changes**:

1. Add dependencies:
   ```
   pnpm add @tanstack/react-query-persist-client @tanstack/query-sync-storage-persister
   ```

2. Adopt the **`["persisted", ...]` queryKey prefix convention** for any query we want to survive reloads. Inside `@hypeterminal/hl-react`, add a new `infoKeyPersisted()` helper alongside `infoKey()`:
   ```ts
   export function infoKeyPersisted<M>(method: M, params?) {
     return ["persisted", "info", method, stableValue(params ?? {})];
   }
   ```
   Or simpler: add a `persist?: boolean` option to `useInfo` that swaps the prefix internally.

3. Replace `getRootProviderContext()` in `providers/root.tsx` with:
   ```tsx
   const persister = createSyncStoragePersister({
     storage: window.localStorage,
     key: 'hl-rq-cache-v1',
     throttleTime: 1000,
   });

   <PersistQueryClientProvider
     client={queryClient}
     persistOptions={{
       persister,
       maxAge: 24 * 60 * 60 * 1000,
       buster: 'v1', // bump to invalidate all
       dehydrateOptions: {
         shouldDehydrateQuery: (q) => q.queryKey[0] === 'persisted',
       },
     }}
   >
   ```

4. Migrate `MarketsProvider` queries to use the persisted prefix:
   - `useInfo("meta", {}, { persist: true, staleTime: 30 * 60_000 })`
   - Same for `spotMeta`, `perpDexs`, `allPerpMetas`

5. **Delete** `loadMarketsMetaCache`, `saveMarketsMetaCache`, `MarketsMetaCache` interface, the `useEffect` in `use-markets.tsx`, and the `import { saveMarketsMetaCache } from '@/providers/root'` (kills the circular import).

**Acceptance**:
- `localStorage.getItem('hl-rq-cache-v1')` exists after first load with at least 4 queries
- Hard reload → DevTools Network shows zero requests for `meta` / `spotMeta` / `perpDexs` / `allPerpMetas` (within 30 min staleTime)
- Token selector opens with markets visible in <100ms on second load
- No circular import warnings in the build

---

## Phase 2 — Last-coin / last-price localStorage for instant chart render

**Why**: Even with persisted React Query data, the `mark price` and `24h change` stats come from the live WebSocket and flash empty on cold start. Hyperliquid stores `["ETH", 2373.45]` in localStorage and renders it immediately — replaced when the WS fires.

**Changes**:

1. Add a tiny module `apps/terminal/src/lib/last-mark-cache.ts`:
   ```ts
   const KEY = 'hl-last-mark-v1';
   const TTL = 60 * 60_000; // 1 hour

   type Entry = { coin: string; markPx: string; oraclePx?: string; savedAt: number };

   export function loadLastMark(coin: string): Entry | null { /* ... */ }
   export function saveLastMark(coin: string, markPx: string, oraclePx?: string) { /* ... */ }
   ```
   Guard `typeof window === 'undefined'` (SSR).

2. In `MarketsInfoProvider` (or wherever the selected market's `markPx` arrives), call `saveLastMark` whenever the WebSocket delivers a fresh value.

3. In the components that display mark price (`coin-info-bar`, chart price overlay, order form mid-price), fall back to `loadLastMark(selectedCoin)?.markPx` when the live value is undefined.

4. Same pattern for `tv_coin_and_px` — store the last selected coin under `hl-last-coin-v1` so the route can hydrate the selected market before zustand restores from its `persist` middleware.

**Acceptance**:
- After visiting ETH once, hard reload of `/trade/ETH` shows the last-known mark price within ~16ms (first paint), not after the WS connects
- Switching coins updates `hl-last-mark-v1` for each coin individually (don't clobber)

---

## Phase 3 — Persist `userFees` and similar low-churn user queries

**Why**: Hyperliquid persists `userFees` per-user (and a `null`-user variant). It's small (~2.4 KB) and rarely changes — perfect for cache.

**Changes**:

1. Identify low-churn user queries (`userFees`, `userRole`, possibly `subAccounts`).
2. Mark them as persisted via the `["persisted", ...]` prefix.
3. Set `staleTime` to ~5 min, `gcTime` (cache time) to 24h.

**Acceptance**:
- Reload while logged in → no `userFees` request fires
- Disconnect/reconnect different wallet → fresh fetch (different key)

---

## Phase 4 — Derive `meta` from `allPerpMetas[0]`

**Why**: The `meta` query and `allPerpMetas[0]` return the same data structure. Hyperliquid only persists `allPerpMetas` and never calls `meta` separately — they derive it. We currently fire both in parallel.

**Changes**:

1. In `use-markets.tsx`, drop the standalone `useInfo("meta", {})` call.
2. Compute `perpMeta = allPerpMetas?.[0]` inside `createMarkets`.
3. Update consumers that read `meta` directly to read `allPerpMetas[0]` (or keep a derived selector for compatibility).

**Acceptance**:
- DevTools Network on cold start shows 3 metadata requests, not 4
- All existing market data renders correctly (perp universe, asset IDs, decimals)

---

## Phase 5 — Verify and tune `staleTime` per query class

**Why**: Currently every market query uses `STALE_TIME = 30 * 60_000`. Some data changes more often than that.

**Plan**:

| Query | Suggested staleTime | Reason |
|---|---|---|
| `spotMeta` | 30 min | Universe changes rarely |
| `allPerpMetas` | 30 min | New listings only every few days |
| `perpDexs` | 5 min | New builder DEXes appear weekly |
| `userFees` | 5 min | Volume tier can change intraday |
| `meta` (if kept) | 30 min | Same as `allPerpMetas` |

Refetch happens silently via `stale-while-revalidate`; `isLoading` stays false. No user-facing impact.

---

## Sequencing & risk

| Phase | Risk | Effort | Dependencies |
|---|---|---|---|
| 1 | Medium — touches root provider, requires SSR-safe persister | 1–2 days | None |
| 2 | Low — additive cache, falls back to live data | half day | None |
| 3 | Low — same pattern as Phase 1 | half day | Phase 1 |
| 4 | Medium — must verify all `meta` consumers | half day | None (orthogonal) |
| 5 | Trivial — one-line config changes | 1 hour | Phase 1 |

**Recommended order**: Phase 1 → Phase 2 (parallel-shippable) → Phase 4 → Phase 3 → Phase 5.

---

## Open questions

1. **SSR hydration** — `PersistQueryClientProvider` runs `persistQueryClientRestore` async on mount. Does this race with our `setupRouterSsrQueryIntegration` flow? We should verify the queryClient is restored before the first `useInfo` call, otherwise we still get a loading flash. Alternative: pre-restore synchronously in `getRootProviderContext` like we do today.
2. **Persister storage size** — Hyperliquid's cache is 185 KB. We need to confirm browser quota isn't an issue across all our persisted queries combined, and that `throttleTime` doesn't drop writes during rapid navigation.
3. **`buster` strategy** — When we ship a backend change that alters response shape, who bumps the buster? Recommend: tied to `hl-react` package version.

---

## How to validate the whole thing

After Phase 1+2 ship, with browser DevTools open:

1. Hard reload `/trade/ETH` (cold cache):
   - Should see network requests for the 4 metadata queries
   - Spinner shown for ~3–4s (unavoidable on first ever load)

2. Hard reload `/trade/ETH` again (warm cache):
   - DevTools Network: zero requests for `spotMeta`, `allPerpMetas`, `meta`, `outcomeMeta`
   - Token selector opens instantly with full market list
   - Mark price renders from `hl-last-mark-v1` within first paint
   - Stats columns populate from cached `allDexsCtxs` / `spotCtxs` (already implemented in `useMarketsInfo.ts` via sessionStorage)

3. Open `localStorage` in DevTools → confirm `hl-rq-cache-v1` and `hl-last-mark-v1` exist with recent timestamps.

If steps 2–3 show the expected behavior, the optimization is working.
