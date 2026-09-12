# Account overview

Desktop and mobile share `useAccountModeLabels`, `useAccountOverviewLabels` and `useAccountOverview`. Render complete translated headings rather than concatenating mode and overview fragments. The current mode comes from resolved REST / WebSocket account state, never an unsubmitted selection.

| Protocol mode | Display name | Summary | Ratio | Leverage |
| --- | --- | --- | --- | --- |
| `unifiedAccount` | Unified account / 统一账户 | Unified Account Summary / 统一账户概要 | Unified Account Ratio | Unified Account Leverage |
| `portfolioMargin` | Portfolio margin / 投资组合保证金 | Portfolio Margin Summary / 投资组合保证金概要 | Portfolio Margin Ratio | Portfolio Account Leverage |
| `disabled` | Manual / 手动 | Manual Account Summary / 手动账户概要 | Account Margin Ratio | Cross Account Leverage |
| unresolved or unsupported | Account / 账户 | Account Summary / 账户概要 | neutral labels | neutral labels |

The mode picker and trading header use the same names. A compact header may abbreviate Unified and Portfolio. Mobile renders one summary heading without a duplicate mode badge. Mode and locale updates must retain the mounted panel and action drafts. Confirmed unsupported modes keep their explicit selection guidance; unresolved modes must not claim a connection failure or supported account state. The Confirm button retains its label while mode data loads, remains disabled, and cannot sign.

## Metric scope

- Portfolio value includes the valued Spot balances in shared modes. Manual mode uses the selected DEX account value. This is distinct from the collateral denominator used for leverage.
- Unified account ratio groups cross maintenance requirements and isolated margin by collateral token, then uses the maximum collateral-specific ratio. Portfolio margin ratio comes directly from `spotClearinghouseState.portfolioMarginRatio`; do not derive it from perp-only margin. Manual mode retains the selected DEX cross-margin calculation.
- Shared account leverage divides USD-normalized cross notional across DEXs by eligible collateral value. Count each settlement asset once, even when multiple DEXs use it. Unified mode excludes non-settlement Spot assets. Portfolio mode additionally values eligible non-settlement assets using their server `oraclePx * ltv`, not full Spot market value. Unknown collateral metadata, invalid prices/LTV and required missing reserves produce an unavailable metric, never a guessed amount.
- The pinned SDK exposes reserve IDs with `oraclePx` and `ltv` through `allBorrowLendReserveStates`. Fetch this public snapshot only for portfolio mode, sharing the existing SDK query cache; refetch every 30 seconds and on focus. Accept only successful, non-placeholder data fetched after mount and less than 60 seconds old. It controls this read-only metric only, not order sizing or funding eligibility.
- Shared-mode Perps Maintenance Margin retains USD-normalized cross maintenance across DEXs; Manual mode uses the selected DEX. Keep the aggregation explicit rather than copying a reference UI label onto a different formula. Unrealized PNL retains the existing aggregate scope. All arithmetic stays in domain helpers using Big.js and decimal strings.
- Desktop and mobile show the ratio before value, PNL, maintenance and leverage. Unavailable metrics retain each surface's numeric-placeholder contract, with no passive transport warnings.

## Mode availability

New portfolio margin activation remains controlled by `VITE_PORTFOLIO_MARGIN_ACTIVATION_ENABLED`. When disabled, describe this as a terminal feature policy, not lack of SDK support or exchange rejection. Existing portfolio accounts remain readable and can switch away. Do not enable the feature simply because documentation has changed.

Link to current official eligibility and limits instead of embedding mutable pre-alpha, account-value or volume thresholds in translated UI. Mode updates continue through the matching owner-signed `userSetAbstraction({ user, abstraction })` action and refresh the existing account queries. Viewing the picker and changing its draft must never sign.

## Evidence and verification

Checked on 2026-09-12 against the [live terminal](https://app.hyperliquid.xyz/trade/HYPE), its publicly served account-summary implementation, [account abstraction documentation](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/account-abstraction-modes), [portfolio margin documentation](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/portfolio-margin), and the installed SDK 0.33.3 reserve response types. The reference separates Spot portfolio value from leverage collateral and uses server LTV for eligible non-settlement collateral. Its currently selected DEX PNL / maintenance presentation is not a reason to discard GATU's existing multi-DEX summary scope.

Regression coverage includes all supported modes, unresolved state, English/Chinese changes on mounted desktop/mobile views, ratio accessible names, non-collateral holdings, duplicate collateral assignments, missing/invalid reserve data, feature-gated mode selection, and no signing before confirmation. The account-action browser suite also covers prior Deposit / Withdraw placement, conditional Perps / Spot access, exact transfer amounts, mobile form reachability and preserved input drafts.
