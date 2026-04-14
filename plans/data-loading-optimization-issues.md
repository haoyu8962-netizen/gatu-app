# Data Loading Optimization — Issue Breakdown

> Parent PRD: [`plans/data-loading-optimization-prd.md`](./data-loading-optimization-prd.md)

Four sequential issues. Each is independently demoable. Grab them top-to-bottom — issue 3 is orthogonal to issues 1–2 and can run in parallel if desired.

---

## Issue 1 — Wire up `react-query-persist-client` with `spotMeta` as proof

**Type**: AFK
**Blocked by**: None
**Estimated effort**: 1 day

### What to build

Introduce the official React Query persistence library, wrap the app with `PersistQueryClientProvider`, establish the `["persisted", ...]` queryKey prefix convention, and migrate **only `spotMeta`** to the persisted prefix. The existing `hl-markets-meta-v1` hand-rolled cache stays in place for now (parallel-running), so this issue de-risks the plumbing without touching the rest.

### Why separate from issue 2?

`spotMeta` is the biggest query (120 KB) and is used in the most visible place (token selector spot tab). If the plumbing has any issues — SSR hydration races, storage quota quirks, stale key mismatches — we'll see them here before migrating the other 3 queries.

### Files to modify

1. **`apps/terminal/package.json`** — add dependencies:
   ```
   "@tanstack/react-query-persist-client": "^5.x",
   "@tanstack/query-sync-storage-persister": "^5.x"
   ```

2. **`packages/hl-react/src/hooks/useInfo.ts`** — add a `persist?: boolean` option:
   ```ts
   export function useInfo<M extends InfoMethod, TData = InfoResponse<M>>(
     method: M,
     params: InfoParams<M>,
     options: QueryParameter<InfoResponse<M>, TData> & { persist?: boolean } = {},
   )
   ```
   When `persist: true`, prefix the queryKey with `"persisted"`:
   ```ts
   const baseKey = createKey("info", method, params);
   const queryKey = options.persist ? ["persisted", ...baseKey] : baseKey;
   ```
   Export a matching `infoPersistedKey()` helper alongside `infoKey()` for manual cache access.

3. **`packages/hl-react/src/index.ts`** — export `infoPersistedKey` so `root.tsx` can reference it if needed.

4. **`apps/terminal/src/providers/root.tsx`** — wrap with `PersistQueryClientProvider`:
   ```tsx
   import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
   import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';

   const persister = isServer ? undefined : createSyncStoragePersister({
     storage: window.localStorage,
     key: 'hl-rq-cache-v1',
     throttleTime: 1000,
   });

   // In RootProvider, replace QueryClientProvider with:
   <PersistQueryClientProvider
     client={queryClient}
     persistOptions={{
       persister: persister!,
       maxAge: 24 * 60 * 60 * 1000,
       buster: 'v1',
       dehydrateOptions: {
         shouldDehydrateQuery: (q) => q.queryKey[0] === 'persisted',
       },
     }}
   >
   ```
   On server, fall back to the plain `QueryClientProvider`.

   **Leave `getRootProviderContext()` and the hand-rolled cache untouched for this issue.**

5. **`apps/terminal/src/lib/hyperliquid/markets/use-markets.tsx`** — change *only* the `spotMeta` call:
   ```ts
   const { data: spotMeta, ... } = useInfo("spotMeta", undefined, {
     refetchInterval: Infinity,
     staleTime: 30 * 60_000,
     persist: true,
   });
   ```
   Leave the other 3 `useInfo` calls alone.

### Acceptance criteria

- [ ] `pnpm install` adds both new dependencies without conflicts
- [ ] `localStorage.getItem('hl-rq-cache-v1')` contains `spotMeta` keyed as `["persisted", "hl", "info", "spotMeta", {}]` after one page visit
- [ ] Hard reload → DevTools Network panel shows **zero** `spotMeta` POSTs (other 3 metadata queries still fire — expected for this issue)
- [ ] Token selector Spot tab renders full market list within first paint on warm reload
- [ ] `typeof window === 'undefined'` guards prevent any server-side storage access (verified by running `pnpm build` and inspecting SSR output)
- [ ] Old `hl-markets-meta-v1` key still exists and is still being written to (temporary dual-write — cleaned up in issue 2)
- [ ] No circular import warnings in build output
- [ ] No hydration mismatch errors in console

### Validation steps

1. `pnpm dev`, open `/trade/ETH`, confirm it still loads
2. Open Application → Local Storage → confirm `hl-rq-cache-v1` exists with `spotMeta` inside
3. Hard reload, open Network → Fetch/XHR, filter by `spotMeta` → should be zero
4. Clear `hl-rq-cache-v1` only, reload → `spotMeta` refetches and repopulates
5. Clear all localStorage, reload → cold-start behavior unchanged

### Risks

- **SSR hydration race**: If the persister's async restore finishes after React mounts, `isLoading` could still flash true for one frame. If this happens, use `persistQueryClientRestore` synchronously inside `getRootProviderContext()` before React renders.
- **Storage quota**: Single 120KB write is well under 5MB browser limit. Unlikely.

---

## Issue 2 — Migrate remaining metadata queries, delete hand-rolled cache, derive `meta` from `allPerpMetas[0]`

**Type**: AFK
**Blocked by**: Issue 1
**Estimated effort**: 1 day

### What to build

Complete the React Query persistence migration. Move `allPerpMetas`, `perpDexs`, `outcomeMeta` to the persisted prefix. Drop the standalone `meta` query (derive from `allPerpMetas[0]`). Delete the entire hand-rolled `MARKETS_META_CACHE_KEY` implementation — this resolves the circular import flagged in the PRD.

### Files to modify

1. **`apps/terminal/src/lib/hyperliquid/markets/use-markets.tsx`**:
   - Delete the `useInfo("meta", {})` call entirely
   - Add `persist: true` to `allPerpMetas`, `perpDexs` calls
   - Add a new persisted `useInfo("outcomeMeta", ...)` call if not already present (matching Hyperliquid's cached set)
   - Compute `const perpMeta = allPerpMetas?.[0]` and pass to `createMarkets`
   - Delete the `useEffect` that calls `saveMarketsMetaCache`
   - Delete `import { saveMarketsMetaCache } from '@/providers/root'`
   - Verify `isLoading` derivation still handles the now-reduced set of queries (3 instead of 4)

2. **`apps/terminal/src/providers/root.tsx`**:
   - Delete `MARKETS_META_CACHE_KEY`, `MARKETS_META_CACHE_TTL`, `MarketsMetaCache` interface
   - Delete `loadMarketsMetaCache()`, `saveMarketsMetaCache()` functions
   - Delete the `setQueryData` block inside `getRootProviderContext()` — the function now just returns `{ queryClient }` with an empty client
   - Delete `import { infoKey } from '@hypeterminal/hl-react'` (no longer needed)
   - Add a one-shot cleanup (outside the provider, at module top-level after the `isServer` guard):
     ```ts
     if (!isServer) {
       try { localStorage.removeItem('hl-markets-meta-v1'); } catch {}
     }
     ```

3. **Verify every consumer of `perpMeta`** (should just be `createMarkets` inside `use-markets.tsx`) still works via the derived value. Grep for `useInfo("meta"` across the codebase to catch any other callers.

### Acceptance criteria

- [ ] `grep -r saveMarketsMetaCache` returns zero results
- [ ] `grep -r MARKETS_META_CACHE_KEY` returns zero results
- [ ] `grep -r 'useInfo("meta"' apps/` returns zero results (or only the one in `use-markets.tsx` if you chose to keep it as a derived alias — not preferred)
- [ ] Hard warm reload → DevTools Network panel shows **zero** requests for `spotMeta`, `allPerpMetas`, `perpDexs`, `outcomeMeta`, `meta`
- [ ] Cold reload (cleared localStorage) → 3 metadata POSTs fire (not 4) — `meta` is gone
- [ ] Token selector shows correct market data across all tabs (perp, spot, HIP-3)
- [ ] Selected perp market's leverage, asset ID, decimals all match pre-change values (verified by opening BTC, ETH, and a builder-perp market)
- [ ] `hl-markets-meta-v1` is no longer in `localStorage` after any page load
- [ ] Circular import is resolved — `madge` or equivalent circular-dep tool reports nothing new between `root.tsx` and `use-markets.tsx`
- [ ] `pnpm build` completes without warnings about circular imports

### Validation steps

1. Clear all localStorage. Reload. Confirm 3 metadata requests in Network (was 4).
2. Reload again. Confirm 0 metadata requests.
3. Open token selector, verify all three scopes (perp / spot / HIP-3) render correctly.
4. Open BTC market, verify leverage and asset ID match production today.
5. Open a HIP-3 market (e.g. `xyz:SP500`), verify quote token and dex metadata correct.
6. Confirm `localStorage` contains only `hl-rq-cache-v1` for our data (no `hl-markets-meta-v1`).

### Risks

- **Consumer of `meta` we missed**: If anything external reads the `meta` query key directly via `queryClient.getQueryData(infoKey("meta", {}))`, it will now return undefined. Grep carefully; migrate to reading from `allPerpMetas[0]` or through `useMarkets()`.
- **`outcomeMeta` not currently in codebase**: If Hyperliquid cached it but we don't currently fetch it, skip adding it. Not required by our feature set.

---

## Issue 3 — Instant mark price render via `last-mark-cache`

**Type**: AFK
**Blocked by**: None (orthogonal to issues 1–2; can ship in parallel)
**Estimated effort**: half day

### What to build

Store the last-known mark price (and oracle price) for each coin in `localStorage`. Components that display mark price fall back to this cached value when the live WebSocket value is undefined — eliminating the blank-to-populated flash on cold start. Also persist the last selected coin so we can hydrate the correct pairing on first paint.

### Files to create

1. **`apps/terminal/src/lib/last-mark-cache.ts`** (~40 lines):
   ```ts
   const KEY = 'hl-last-mark-v1';
   const TTL = 60 * 60_000;

   export interface LastMarkEntry {
     markPx: string;
     oraclePx?: string;
     savedAt: number;
   }

   type Store = Record<string, LastMarkEntry>;

   function loadStore(): Store {
     if (typeof window === 'undefined') return {};
     try { return JSON.parse(localStorage.getItem(KEY) ?? '{}'); }
     catch { return {}; }
   }

   export function loadLastMark(coin: string): LastMarkEntry | null {
     const entry = loadStore()[coin];
     if (!entry) return null;
     if (Date.now() - entry.savedAt > TTL) return null;
     return entry;
   }

   export function saveLastMark(coin: string, markPx: string, oraclePx?: string) {
     if (typeof window === 'undefined') return;
     try {
       const store = loadStore();
       store[coin] = { markPx, oraclePx, savedAt: Date.now() };
       localStorage.setItem(KEY, JSON.stringify(store));
     } catch {}
   }
   ```

2. **`apps/terminal/src/lib/last-coin-cache.ts`** (~15 lines):
   ```ts
   const KEY = 'hl-last-coin-v1';

   export function loadLastCoin(): string | null {
     if (typeof window === 'undefined') return null;
     try { return localStorage.getItem(KEY); } catch { return null; }
   }

   export function saveLastCoin(coin: string) {
     if (typeof window === 'undefined') return;
     try { localStorage.setItem(KEY, coin); } catch {}
   }
   ```

### Files to modify

3. **`apps/terminal/src/lib/hyperliquid/hooks/useMarketsInfo.ts`** (or wherever `useSelectedMarketInfo` lives):
   - After extracting the live `markPx` from the selected market info, add a `useEffect` that calls `saveLastMark(coin, markPx, oraclePx)` whenever they change
   - In `useSelectedMarketInfo()`, merge a fallback into the returned data:
     ```ts
     const cached = useMemo(() => loadLastMark(selectedMarketName), [selectedMarketName]);
     const data = market ?? (cached ? { markPx: cached.markPx, oraclePx: cached.oraclePx } : undefined);
     ```
   - Ensure the returned shape is unchanged for existing consumers.

4. **`apps/terminal/src/stores/use-market-store.ts`** (or wherever `setSelectedMarket` is defined):
   - Call `saveLastCoin(marketName)` when the selected market changes, so the cache stays in sync with user action (not just WS updates).

5. **Components that render mark price** — verify behavior, likely no changes needed if `useSelectedMarketInfo` now returns cached fallback:
   - `coin-info-bar` (mark price cell, oracle cell, 24h change if computable from cached vs live)
   - Order form mid-price input (`PriceInput`)
   - Chart overlay if any

### Acceptance criteria

- [ ] Visiting ETH, waiting for mark price to render, then hard reloading → mark price is visible within first paint (before any Network request completes)
- [ ] `localStorage.getItem('hl-last-mark-v1')` contains an entry for every coin visited in the last hour
- [ ] `localStorage.getItem('hl-last-coin-v1')` matches the last-visited coin
- [ ] Clearing `hl-last-mark-v1` → mark price shows "—" on cold start (no regression in empty-state handling)
- [ ] Entries older than 1h are not shown (verified by manually editing a `savedAt` to be 2h ago and reloading)
- [ ] Switching coins (ETH → BTC → ETH) updates each coin's entry independently — BTC's cache is not overwritten by ETH
- [ ] No SSR errors — `pnpm build` completes; inspect server HTML output for no leaked references to `localStorage`

### Validation steps

1. Visit `/trade/ETH`, wait for live data. Inspect `hl-last-mark-v1` → should have an `ETH` entry.
2. Hard reload. Mark price visible within first paint (confirm visually — should not flash "—")
3. Navigate to `/trade/BTC`, wait for live data. Inspect → both ETH and BTC entries present.
4. Hard reload `/trade/BTC`. BTC price visible immediately.
5. Clear `hl-last-mark-v1`, reload `/trade/ETH`. Mark price shows "—" until WS connects (original behavior).
6. Manually set an entry's `savedAt` to `Date.now() - 7200000` (2h ago), reload. Mark price shows "—".

### Risks

- **Stale mark price misleading users**: 1h TTL prevents anything older. Oracle price drift within an hour is minimal for major assets. Small assets in extreme volatility could look wrong briefly — but it's still a better UX than "—".
- **Coin switching race**: If user switches ETH → BTC fast, we might write ETH's mark under BTC's key. Mitigation: `saveLastMark` is called from `useEffect` keyed on `[coin, markPx]`, so the coin parameter always matches the fresh markPx.

---

## Issue 4 — Persist `userFees` + per-query `staleTime` tuning

**Type**: AFK
**Blocked by**: Issue 1 (needs the `persist: true` mechanism)
**Estimated effort**: 2 hours

### What to build

Final polish to hit every success metric in the PRD. Add `userFees` to the persisted set. Tune `staleTime` per query class per the table in R8.

### Files to modify

1. **Wherever `userFees` is fetched** (`grep useInfo.*userFees`):
   - Add `persist: true, staleTime: 5 * 60_000`
   - Verify per-user keying works (different wallet addresses produce separate cache entries — should happen automatically since the wallet address is in the query params)

2. **`apps/terminal/src/lib/hyperliquid/markets/use-markets.tsx`** — per-query staleTime:
   | Query | staleTime |
   |---|---|
   | `spotMeta` | 30 min (unchanged) |
   | `allPerpMetas` | 30 min (unchanged) |
   | `perpDexs` | 5 min (down from 30) |
   | `outcomeMeta` | 30 min |
   Replace the single `STALE_TIME` constant with per-call values.

3. **Document the `["persisted", ...]` convention** in `packages/hl-react/README.md` so future SDK consumers know the rule.

### Acceptance criteria

- [ ] Connecting a wallet, visiting trade page → `userFees` fires once. Reload → `userFees` does NOT refire (within 5 min).
- [ ] Wait 5+ min, reload → `userFees` fires in background (non-blocking, no spinner).
- [ ] Disconnect wallet, connect a different wallet → new `userFees` request fires (different cache key).
- [ ] `perpDexs` refetches in background after 5 min (was 30 min) — confirms shorter stale window actually takes effect.
- [ ] `@hypeterminal/hl-react` README documents the `persist` option and `["persisted", ...]` key convention.
- [ ] All PRD success metrics hit:
  - [ ] Warm hard reload: 0 metadata POSTs within 30 min window
  - [ ] First mark price render: <100ms (from issue 3)
  - [ ] Token selector opens: <100ms (from issues 1–2)

### Validation steps

1. Disconnect. Reload. `userFees` should NOT fire (anonymous user query is the one used, and it's cached from previous visit).
2. Connect wallet A. Reload. `userFees` fires once (new key). Reload again. Should not fire.
3. Switch to wallet B. Reload. `userFees` fires once for B's key. Reload. Should not fire.
4. Inspect `hl-rq-cache-v1` → should contain entries for both wallet A and B's `userFees`.

---

## Cross-cutting notes

### What stays unchanged

- `useMarketsInfo.ts` sessionStorage cache for `allDexsAssetCtxs` / `spotAssetCtxs` — already works, intentionally session-scoped for volatile WS data. **Do not consolidate into the React Query cache for v1.**
- `validated-storage.ts` zustand adapter — different concern.
- `agent-storage.ts` — signing keys, different lifecycle and sensitivity.
- `wallet-utils.ts` last-wallet key — orthogonal.

### One-time cleanup

Issue 2 deletes the `hl-markets-meta-v1` key from users' browsers on first post-deploy visit. After ~1 release cycle, the cleanup line can be removed from `root.tsx`.

### Rollback

Each issue's change is contained. If issue 2 regresses markets, revert it — issue 1's `spotMeta` persistence continues working in isolation.
