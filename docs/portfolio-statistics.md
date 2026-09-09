# Portfolio statistics

The portfolio page values the selected owner account on the selected network. It does not aggregate unrelated wallets or subaccounts. The scope and period selectors apply to historical performance; equity rows describe current balances.

## Sources and units

The integration is pinned to `@nktkas/hyperliquid` 0.33.3. Source field definitions are in its `esm/api/info/_methods` declarations and the official API documentation:

- [Info API](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint): `portfolio`, `userFees`, `userVaultEquities`, `borrowLendUserState`, `allBorrowLendReserveStates`.
- [Spot API](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint/spot): spot balances and entry notional.
- [Account abstraction modes](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/account-abstraction-modes): shared balances live in spot state; individual DEX account values must not be added in shared modes.
- [Portfolio margin](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/portfolio-margin): automatic borrowing and supplying.
- [Portfolio graphs](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/portfolio-graphs): account value includes unrealized PNL and vault balances; history is sampled on deposits/withdrawals and periodically, not a precise accounting ledger.

Financial arithmetic stays in domain functions using Big.js and decimal strings. Number conversion is permitted for chart geometry and formatting, not equity aggregation. USDC is the USD accounting numeraire, consistent with the rest of the terminal.

| Metric | Rule |
| --- | --- |
| Spot account equity | Sum `balances[].total` multiplied by current USD prices. `entryNtl` is entry notional and is never a substitute for a missing price. Nonzero balances require a positive price; zero balances and USDC need no market price feed. |
| Perps account equity | Standard mode only: sum every DEX's `marginSummary.accountValue`, converting each DEX from its collateral token to USD. Do not add cross-margin summaries or unrealized PNL again. |
| Shared core equity | Unified account and portfolio margin use spot equity once. Do not add separate DEX account values. |
| Vault equity | Sum the current `userVaultEquities[].equity` values. A successful empty array is zero; missing data is unavailable. |
| Lending net balance | Sum `(supply.value - borrow.value) * oraclePx`, joined by token ID. This is net assets less liabilities, not earned interest. A nonzero supply or borrow requires a valid oracle, even if they offset. |
| Total equity | Core + vault + lending net balance, only when every required value is valid and lending overlap has been ruled out by the conservative policy below. Never substitute portfolio history for current equity. |
| PNL and historical volume | Select `day/week/month/allTime` or the corresponding `perp*` key. Use the latest valid PNL sample and the period's `vlm`. Live API samples reset PNL to zero at the beginning of each window; do not subtract an all-time baseline. |
| 14 day volume | Preserve the existing sum of `userCross + userAdd` for the latest fourteen returned daily entries. Do not include the exchange's volume. This is a calendar-entry statistic, not a rolling 336-hour calculation. |

## Lending overlap policy

The SDK names `total`, `supplied`, and `borrowed`, but those type declarations alone do not establish how every account mode reconciles these fields with `borrowLendUserState`. Do not infer additive independence from the names.

For shared account modes, any nonzero borrow or supply makes current total equity unavailable pending validated reconciliation. Any nonzero or invalid `supplied`/`borrowed` field in spot state also prevents aggregation, including during mode transitions. Equal supply and borrow still count as exposure. Separately valid spot and lending net values remain visible, with an explicit desktop explanation that they may overlap. Unknown or malformed lending data cannot be treated as zero.

For standard accounts with no spot lending fields indicating overlap, the separately held lending net balance may be added. Before relaxing the shared-mode guard, verify same-account responses covering standard, unified and portfolio-margin modes, empty lending, supply-only, borrowing, offsetting supply/borrow, and transitions. Record the field relationship and add fixture-based regression tests. The current implementation intentionally does not claim such reconciliation is verified.

## Availability and identity

Account queries use the existing SDK transport and TanStack Query infrastructure. Keys retain method, parameters (including owner) and network, and additionally isolate portfolio results by account mode. Placeholder data is disabled. Re-entering a query waits for a fetch after mount before publishing cached values.

Queries refresh every 60 seconds, use a 15-second per-attempt timeout and one retry, and consider data unavailable after 120 seconds without a successful update. This application freshness budget is not an exchange guarantee. A five-second clock plus focus/visibility notifications expires stalled results without requiring a new network response. HTTP age is based on local query receipt time, not exchange timestamps. Future local receipt timestamps fail closed after a clock adjustment.

Fresh data remains visible during a normal background refresh. A refresh error, placeholder, missing result or expired result cannot feed current statistics. WS balances must have a successful source status; cached error/stale states are not usable. Each metric depends only on the sources it needs, so an auxiliary error does not hide valid PNL or spot balances. Disconnecting immediately masks account results. Neither HTTP polling nor independent WS updates is an atomic exchange-wide snapshot.

## Maximum drawdown

Maximum drawdown is intentionally unavailable, with a visible explanation on desktop. The previous calculation measured peak-to-trough cash balance and treated withdrawals as trading losses. It has been removed rather than replaced with a PNL-denominated percentage.

Re-enabling it requires a validated cash-flow-adjusted unit-value/return series. Define external flows for the chosen scope (perp-to-spot transfers are internal to combined scope), prove ledger coverage, align valuation and flow times, and handle empty/zero/negative starting equity. Missing ledger coverage or ambiguous timing must not produce a numeric result. If only sampled returns can be established, explicitly label the metric an estimate. No precise drawdown is inferred from `portfolio` samples alone.

## Verification

Regression tests cover pricing completeness, valid zero balances, malformed values, liabilities, decimal precision, independent DEX collateral conversion, shared lending overlap, query expiration/errors, cash withdrawals, and wallet/network/mode cache isolation. UI checks cover desktop and mobile summaries and explanatory text. SDK response samples are evidence for field shape, not a guarantee of valuation completeness.

On mobile (1000px and below), passive loading, error, stale-data and unavailable explanations and their retry controls remain hidden. Numeric placeholders and blank chart areas preserve layout; an empty-history conclusion requires a complete successful history response. Desktop explanations remain available. These presentation rules do not change any valuation, freshness or action-availability guards.
