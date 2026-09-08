# Desktop grid layout

The desktop workspace uses one React Grid Layout instance with stable panel keys. The layout starts at 1001px, uses 14 columns through 1420px, and uses 16 columns above 1420px. Grid rows are 30px with 3px gutters and outer padding.

## Shared boundaries

- Favorites and market information remain above the chart. The chart, market-data panel and trading panel share the upper area's bottom boundary.
- The account table and account-information panel share their top and bottom boundaries. Their common height accommodates both panels' minimum height and the account's natural content height.
- Resizing a vertical boundary changes the whole affected area. Resizing a column boundary updates neighboring columns while preserving the configured minimum and maximum widths. Panels must not be pushed into another vertical tier to resolve a horizontal resize.
- Apply these rules through the same compactor used by React Grid Layout, content measurement, resizing and saved-layout restoration. A correction applied only after a default vertical compaction is insufficient because the library compacts again during rendering and resizing.

## Height ownership

- Persist user-selected geometry in grid units. Keep observed natural content heights separately, per breakpoint, and derive the displayed geometry from those inputs.
- The upper area's height is at least the user-selected height, the chart and toolbar minimums, the market-data minimum, and the trading form's natural height. The lower area's height is at least its user-selected height, both account-panel minimums, and the account's natural height.
- Content growth may expand an area; content shrinkage must allow it to return to the user's size. Never feed a stretched panel height back into natural content measurement or save it as a new user preference.
- Measure actual content inside Suspense boundaries. Loading fallbacks and detached nodes must not change persisted geometry.
- Fill and center account empty states in an outer layout layer. Measure natural content in a separate, non-stretched layer. A `height: 100%` or auto-margin expansion must not become a new content minimum.

## Persistence and verification

Validate saved geometry and preserve current constraints and panel identities. Restore shared boundaries from valid saved user geometry. The v10-to-v11 migration preserves valid column widths and user-resizable chart, market-data and account-table heights; it discards measured trading/account heights and derived vertical positions. Older incompatible storage versions are discarded. Reset must remain available.

Regression checks must cover both desktop breakpoints, repeated breakpoint changes, content growth and shrinkage, user resizing in both directions, saved-layout restoration, and loading-to-content transitions. Inspect actual React Grid Layout bounds in a browser: paired boundaries may differ by at most one CSS pixel, panels must not collide, and repeated measurements must settle without growth loops. Shared layout changes must not remount panel contents. Browser drag tests must also fail on runtime exceptions; compile the drag dependency's debug flag to `false` in both application and fixture builds so resizing does not depend on a browser `process` global.
