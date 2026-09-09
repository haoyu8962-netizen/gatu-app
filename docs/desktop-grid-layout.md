# Desktop grid layout

The desktop workspace uses one React Grid Layout instance with stable panel keys. The layout starts at 1001px, uses 14 columns through 1420px, and uses 16 columns above 1420px. Grid rows are 30px with 3px gutters and outer padding.

## Shared boundaries

- Favorites and market information remain above the chart. The chart, market-data panel and trading panel share the upper area's bottom boundary.
- The account table and account-information panel share their top and bottom boundaries. Their common height accommodates both panels' minimum height and the account's natural content height.
- Resizing a vertical boundary changes the whole affected area. Resizing a column boundary updates neighboring columns while preserving the configured minimum and maximum widths. Panels must not be pushed into another vertical tier to resolve a horizontal resize.
- Apply these rules through the same compactor used by React Grid Layout, content measurement, resizing and saved-layout restoration. A correction applied only after a default vertical compaction is insufficient because the library compacts again during rendering and resizing.

## Height ownership

- Persist user-selected geometry in grid units. Keep observed natural content heights separately, per breakpoint, and derive the displayed geometry from those inputs.
- The upper area's height comes from user-selected grid geometry and panel minimums. Order type, TP/SL, validation feedback and translated form content must not change this boundary. The lower area's height is at least its user-selected height, both account-panel minimums, and the account's natural height.
- Account content growth may expand the lower area; account content shrinkage must allow it to return to the user's size. Trading form content never sets grid minimums. Never feed a stretched panel height back into natural content measurement or save it as a new user preference.
- Measure actual content inside Suspense boundaries. Loading fallbacks and detached nodes must not change persisted geometry.
- Measure natural content in a separate, non-stretched layer. A `height: 100%` or auto-margin expansion must not become a new content minimum.

## Persistence and verification

Validate saved geometry and preserve current constraints and panel identities. Restore shared boundaries from valid saved user geometry. The v10-to-v11 migration preserves valid column widths and user-resizable chart, market-data and account-table heights; it discards measured trading/account heights and derived vertical positions. Older incompatible storage versions are discarded. Reset must remain available.

Regression checks must cover both desktop breakpoints, repeated breakpoint changes, content growth and shrinkage, user resizing in both directions, saved-layout restoration, and loading-to-content transitions. Inspect actual React Grid Layout bounds in a browser: paired boundaries may differ by at most one CSS pixel, panels must not collide, and repeated measurements must settle without growth loops. Shared layout changes must not remount panel contents. Browser drag tests must also fail on runtime exceptions; compile the drag dependency's debug flag to `false` in both application and fixture builds so resizing does not depend on a browser `process` global.

## Disconnected account and order-entry presentation

- The disconnected desktop account panel keeps a compact, top-aligned overview with numeric zero placeholders and a two-column Deposit / Withdraw action row. Do not replace it with a centered wallet illustration, repeated Connect heading or instructional paragraph. Use a neutral overview heading until the account mode resolves. These display values are not account snapshots or proof of funding.
- Ordinary disconnected Deposit / Withdraw controls remain disabled; the existing navigation and order-entry Connect actions remain the wallet entry points. Preserve the sponsored email-deposit path, its availability guard and its existing deposit-modal action. Agent-only connected sessions continue to use the connected account surface and existing funding restrictions.
- The desktop order-entry body fills its grid panel. The order-type header remains outside the scrollable field viewport; the existing CTA, validation feedback and order summary form a bottom section. Put surplus height between these sections, keeping Fees close to the panel's lower inset in both Market and Limit modes. Do not distribute surplus height between individual fields or change order controls to imitate the reference.
- At default desktop geometry all eight ordinary order types must fit without internal vertical scrolling. Use consistent compact input and summary density first; the fields section owns overflow only for constrained user sizes or expanded content. The order-type header must stay visible, and the CTA and summary remain at the bottom. Tall forms, requested-action feedback, TP/SL, Scale and TWAP must remain reachable inside the panel without resizing the chart, order book, account panels or page. Do not observe the trading form as a grid content minimum, retain historical maximum form heights, or mount hidden duplicate forms. Account measurement remains independent.
- Preserve existing wallet/session identity, regional checks, snapshot freshness, funding availability and order execution guards. Preserve the separate mobile order and account flows; their order parameters and execution guards are independent of layout height.

Reference inspection of [Hyperliquid HYPE](https://app.hyperliquid.xyz/trade/HYPE) at 1238×1305 and 1740×1305 shows disabled disconnected funding controls, zero-valued account metrics, and an order-entry `1fr auto` layout with CTA/summary at the bottom. At the wider viewport its account overview starts near the top of the lower panel. Its narrower desktop switches to two columns; GATU retains its documented three-column desktop contract.

Regression checks cover ordinary disconnected, sponsored email-deposit, Agent-only and wallet-connected account states; the footer position across Market/Limit and taller forms; unchanged grid and page geometry through repeated order-type switches and tall content; internal scrolling and keyboard reachability; and 1001px, 1238px and wide desktop widths. Check wallet entry actions and funding guards without submitting transactions.

At 1545×900, reference Market and Limit modes retain the same 670px trading panel and chart/account boundaries while reallocating space between the scrollable fields and bottom summary. Preserve this height-ownership boundary alongside GATU's grid resizing controls. Browser regressions must compare every panel rectangle and the outer scroll extent, preserve saved user geometry and field values, and verify that the last field, CTA and fees remain reachable.

## Mobile order-entry height

The embedded mobile form and compact order book share an order-type-independent split height: `clamp(370px, 60svh, 480px)`. The 370px floor preserves room for the compact book, while the viewport-relative height and 480px ceiling leave room for account navigation on ordinary phones. Stable viewport units avoid resizing this split merely because browser chrome changes. Market details and account disclosures retain their own explicit expansion behavior.

The embedded form scrolls its fields and summary internally, with the existing action area at the bottom. Keep a minimum usable field viewport and allow local body scrolling for unusually tall action feedback; no field or requested-action message may become unreachable. The surrounding page can still scroll to account data. Switching order types must preserve the split, order-book and account boundaries, viewport scroll position, form state and subscription identity. Do not derive split height from the current order form or hide duplicate forms to measure them.

At 390×844 the reference terminal's Market-to-Limit split grows from 370px to 390px and reduces its account area. GATU instead keeps the mobile split stable to honor the requested height boundary. Verify 320px, 390px and tablet widths, shorter viewports, tall advanced forms, keyboard reachability, action feedback, and a stable compact-book footer during repeated switches.

## Complete order-type coverage

Follow [the order-entry layout audit](order-entry-layout-audit.md) when changing form height. Validate real Market, Limit, Stop Market, Stop Limit, Take Profit Market, Take Profit Limit, TWAP and Scale components; synthetic tall rectangles cover overflow recovery but cannot replace real-form coverage. Keep the header independently visible even when overflow is unavoidable. Default geometry must remain independent of the selected order type.
