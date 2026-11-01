# Trade Single Route Migration

## Goal

Move the trading terminal toward the official Hyperliquid terminal model:

- One stable trading shell.
- URL identifies the selected market with `/trade/:symbol`.
- Native perps, spot markets, and HIP-3 builder perps switch in place instead of navigating between separate terminal pages.
- Data subscriptions switch market parameters without recreating unrelated UI state.

## Official Model Alignment

The implementation follows these Hyperliquid API conventions:

- Native perpetual markets use the coin symbol, such as `BTC`.
- HIP-3 builder-deployed markets use `{dex}:{coin}`, such as `xyz:SILVER`.
- Spot markets may be represented internally as `@index`, but the route can use a human-readable pair path such as `/trade/ETH/USDC`.
- Builder perp metadata and account data remain dex-aware; route unification must not erase the current dex.
- WebSocket subscriptions should keep using the existing connection and update subscription params for the selected market.

## Route Contract

Supported trade routes:

- `/trade/BTC` -> native perp `BTC`
- `/trade/xyz:SILVER` -> HIP-3 builder perp `xyz:SILVER`, dex `xyz`
- `/trade/ETH/USDC` -> spot pair named `ETH/USDC` (the `UETH` pair); spot names follow the official terminal's display table
- `/trade/%40107` -> spot internal name `@107`; the address is then replaced with the pair's display path
- `/trade/0x<tokenId>` and `/trade/0x<base>/0x<quote>` -> spot pair by token ID, then replaced with its display path

Since 2026-11-01 ([ADR 0048](../adr/0048-official-spot-display-names-and-addresses.md)) an address that names no market is replaced with the default market once the catalog can conclude, instead of showing the not-found page. [Spot market names and addresses](../spot-market-names.md) owns spot names and every address rule, with the official terminal's behaviour beside this one.

Legacy routes remain compatible for now:

- `/perp`
- `/spot`
- `/builders-perp`
- `/builders-perp/:dex`

Navigation should prefer `/trade/...` paths. Legacy routes should be treated as compatibility entry points rather than the primary market switching model.

## State Ownership

The URL is the source of truth when a `/trade/...` route contains a market.

- `ExchangeScopeProvider` derives `routeScope`, `routeDex`, and `routeMarketName` from the path.
- `useSelectedMarket()` returns the resolved runtime market name when present, otherwise it falls back to the persisted selected market for the active scope.
- `useSelectedMarketInfo()` may use `routeMarketName` as a lookup candidate, but downstream data consumers receive the resolved market object and canonical internal `market.name`.
- `RouteMarketSync` resolves the route market through market metadata and persists the resolved internal market name under the resolved scope. It must not fallback while metadata is still loading.
- UI market switches should use `useMarketNavigation()` rather than calling `setSelectedMarket()` directly.

This prevents the previous race where a component could update the store while the route still pointed to another market.

## Current Implementation Scope

Implemented in this migration slice:

- Added `/trade`, `/trade/$symbol`, and `/trade/$base/$quote` TanStack routes.
- Added route parsing and path generation helpers in `market-route.ts`.
- Updated global scope derivation to understand `/trade/...`.
- Updated market selector, favorites, command menu, and position/order/history asset clicks to use shared market navigation.
- Updated main nav defaults to route through `/trade/...`.
- Added unit coverage for route parsing and path generation.

Not included in this slice:

- Removing legacy route files.
- Redirecting all legacy routes to `/trade/...`.
- Reworking the underlying Hyperliquid WebSocket client.
- Rewriting TradingView widget lifecycle.

## Verification Plan

Required local checks before shipping:

- `pnpm exec biome check <changed files>`
- `pnpm --filter @sairn/terminal exec vitest run src/lib/tests/market-route.test.ts`
- `git diff --check`
- `pnpm --filter @sairn/terminal build`
- Runtime smoke:
  - `/trade/BTC`
  - `/trade/xyz:SILVER`
  - `/trade/ETH/USDC`

Manual product checks:

- Switch native perp -> HIP-3 -> spot through the selector without a full terminal reload.
- Switch markets from favorites and command menu; URL and displayed market must match.
- Click assets from positions, open orders, fills, TWAP, funding, and order history; URL and displayed market must match.
- Mobile market tab selecting a market should return to the trade view without losing the route-selected market.

## Development Loop

Keep the migration incremental and reversible:

1. Route contract and parser helpers first.
2. Scope/store derivation second.
3. Shared navigation hook third.
4. Replace market-switching call sites in small batches.
5. Keep legacy `/perp`, `/spot`, and `/builders-perp` routes available until production proves `/trade/...` is stable.

After each batch, run the focused checks above before broadening the next batch. Browser smoke should verify that the header, selector, chart, order book, trade form, and account panel keep their shell mounted while only the selected market data changes.

## Review Requirements

Do not mark this migration complete solely on local tests. Treat local tests and build as necessary but not sufficient evidence.

Run adversarial review in these slices rather than reviewing the whole branch:

1. `market-route.ts`, route tests, and `/trade` route files.
2. `ExchangeScopeProvider`, `useSelectedMarket`, and `RouteMarketSync`.
3. `useMarketNavigation` and selector changes.
4. Favorites, command menu, desktop tabs, and mobile tab call-site replacements.

Only fix review findings that are reproducible, in scope, and do not remove the legacy route compatibility layer.

## Rollout Notes

Ship this behind normal deployment first while keeping legacy routes intact. After production confirms stable market switching:

1. Add analytics/logging for route format usage.
2. Convert remaining entry points and docs to `/trade/...`.
3. Decide whether legacy routes should redirect or remain permanent compatibility URLs.
4. Re-run adversarial review before removing the legacy compatibility layer.
