# ADR 0001: Share account data contracts while rendering each shell independently

- Status: Accepted
- Date: 2026-08-21

## Context

The trading terminal has desktop and mobile account surfaces, and the portfolio page has a separate account-equity summary. They overlap in data sources but do not have the same presentation or readiness contract:

- Desktop and mobile show the selected trading context, margin risk, and funding actions.
- Portfolio combines the default account with all-Dex perpetual equity, Vault equity, Earn balance, and portfolio history.
- A separate-account overview may use the selected DEX, while Portfolio must remain independent of the selected market.

Maintaining separate calculations and label mappings in each shell caused behavior and translation drift. Merging the shells into one responsive component would instead couple unrelated layout, density, and interaction requirements.

Hyperliquid's official documentation also makes the account-mode and data boundaries explicit. Standard mode keeps Spot and Perps balances separate, while Unified Account and Portfolio Margin share the Spot clearinghouse balance. The account-abstraction write action accepts `disabled`, `unifiedAccount`, and `portfolioMargin`, while account-state responses can also expose values such as `default` and `dexAbstraction`. This UI accepts only the three documented trading modes and treats every other or conflicting value as unavailable instead of guessing. User queries must use the actual master or subaccount address, `allDexsClearinghouseState` and `spotState` are distinct user streams, and `allMids` is a market-price stream. WebSocket consumers must tolerate disconnects and accept the reconnect snapshot before treating data as current.

## Decision

### Share sources and business state

`useDefaultAccountSnapshot` is the common source hook. It exposes only:

- the active Hyperliquid account address and connection state;
- the default-Dex account snapshot, which already carries Spot and all-Dex clearinghouse state;
- the collateral registry derived from current market metadata;
- collateral USD prices and their availability status.

The hook must not subscribe to the selected DEX. `useAccountOverview` adds the selected-Dex source because the trading account panels need it. Portfolio consumes only the default snapshot, so changing the selected market cannot add a Portfolio subscription or change Portfolio equity.

`deriveAccountOverview` remains the shared pure business model for desktop, mobile, and other trading-shell consumers. Account mode, equity, risk, leverage, funding readiness, stale/error state, and the Spot-funds notice are derived there rather than in render components.

### Fail closed

Unresolved account mode, missing required snapshots, stale streams, request errors, and missing non-USDC collateral prices are unavailable states in the shared model. Desktop and Portfolio consumers render placeholders or an explicit status and must not substitute `$0.00`.

The mobile account overview uses formatted zero placeholders for unavailable metrics without loading, stale, or error banners or warning icons. These placeholders exist only in the mobile rendering layer: they never enter the shared model, classify an account as empty, or enable funds actions. Loading is exposed through `aria-busy`, and disabled funds controls retain their accessible explanations.

Outside those mobile placeholders, a numeric zero is displayed only when it comes from a complete current snapshot. Readiness is consumer-specific:

- Trading account overview readiness may depend on the selected DEX and the account abstraction mode.
- Portfolio current-equity readiness additionally requires its all-Dex, Vault, Earn, and reserve-price sources; history remains a separate fallback when those current sources are unavailable.

There is intentionally no shared global `ready` boolean in `useDefaultAccountSnapshot`.

### Share labels, not markup

Account-mode and summary labels belong in a Lingui-aware label hook such as `useAccountOverviewLabels`. The hook must use the active Lingui context so runtime locale changes update both shells. It returns translated strings; it does not return shell-specific markup.

Desktop and mobile continue to render their own components. They must consume the same model fields and label contract, while retaining independent layout, heading hierarchy, density, action placement, and responsive behavior.

### Keep Portfolio semantics independent

Portfolio reuses the common default-account snapshot inputs only. It does not consume `useAccountOverview` and does not replace its existing equity calculation with the trading-panel value.

The following Portfolio rules remain local:

- all-Dex equity for separately collateralized accounts;
- non-additive unified and portfolio-margin account equity;
- Vault and Earn aggregation;
- current-source readiness and history fallback;
- portfolio scope, period, fees, PNL, drawdown, and chart state.

Any future extraction from Portfolio must be a pure calculation over already-subscribed inputs. It must not add a selected-market subscription, weaken current-source readiness, or change the history fallback.

## Rejected alternatives

### One responsive account component

Rejected because the shells have different information density, navigation, action placement, and heading context. Sharing markup would make responsive changes riskier without reducing business-state drift.

### Use `useAccountOverview` in Portfolio

Rejected because it subscribes to selected-Dex balances and models trading-panel readiness. Portfolio requires default-account all-Dex semantics and additional Vault, Earn, reserve, and history sources.

### Treat missing data as zero

Rejected in the shared business model because an unconnected, loading, stale, or failed account cannot be distinguished from a confirmed empty account and can incorrectly enable funding actions. Mobile display placeholders do not change this data contract.

## Consequences

- Account data-source wiring and collateral metadata have one shared entry point.
- Trading shells retain one business model and one translation contract while preserving independent UI composition.
- Portfolio keeps its production equity semantics and does not react to selected-market changes.
- Tests must cover confirmed zeroes, unresolved/error/stale states, non-USDC collateral valuation, all-Dex Portfolio equity, disconnect clearing, and the absence of a selected-Dex subscription in the shared source hook.

## References

- [Hyperliquid Info endpoint](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint)
- [Hyperliquid account abstraction modes](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/account-abstraction-modes)
- [Hyperliquid Portfolio Margin](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/portfolio-margin)
- [Hyperliquid Exchange endpoint](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint)
- [Hyperliquid WebSocket subscriptions](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/websocket/subscriptions)
- [Hyperliquid WebSocket reconnect guidance](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/websocket)
