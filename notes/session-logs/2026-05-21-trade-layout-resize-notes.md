# Trade Layout Resize Notes

Date: 2026-05-21

Purpose: preserve the layout findings and reset the implementation discussion before making more changes. The current patch works better than the original in the tested cases, but it is more complicated than the layout should be. Treat this note as the source of truth for a later cleaner implementation.

## User-visible Issues

1. The trade sidebar did not scroll independently. To see the lower account content, the whole page had to scroll.
2. The chart section could be decreased, but could not be increased beyond its initial height.
3. Adding chart height caused page scroll, and after scrolling down the bottom-right sidebar area showed a blank section under the account buttons.
4. The trade button needed about 20px spacing above it.

## Current Moving Parts

### `TradeTerminalPage`

- Desktop only path uses a fixed top nav and fixed footer.
- Page wrapper has `min-h-dvh`, `pb-8`, and header offset padding.
- Mainnet header offset is `h-11` / 44px.
- Testnet header plus banner offset is `h-11 + h-8` / 76px.
- Footer is `h-8` / 32px.
- Mobile path is separate and should not be touched for this layout work.

### `MainWorkspace`

- Renders market selector/favorites and market overview above the main trading body.
- Uses `react-resizable-panels` for the horizontal analysis/sidebar split.
- Main panel height is currently:

```ts
max(calc(100dvh - 9.375rem), marketBodyMinHeightPx)
```

- `marketBodyMinHeightPx` grows when `AnalysisSection` asks for more height.
- This means chart expansion can make the page taller than the viewport.

### `AnalysisSection`

- Owns the chart/positions vertical split.
- Uses custom pointer and keyboard resize logic.
- Stores chart height in localStorage.
- Connected positions min height: 400px.
- Disconnected positions min height: 180px.
- Chart min height: 260px.
- Current patch changed the max chart height calculation so the chart can grow and the parent panel can expand.

### `TradeSidebar`

- Contains `TradePanel`, spacer, and `AccountPanel`.
- Desired behavior: keep its own scroll, keep bottom visible above footer, and remain usable when the analysis side grows.
- Current patch uses measurements, scroll listeners, `ResizeObserver`, and fixed positioning when the page scrolls. This handles the tested blank-area case, but it is a sign the architecture is doing too much locally.

## Conditions To Preserve

1. Desktop layout keeps fixed top nav and fixed footer.
2. Testnet banner changes the usable top offset from 44px to 76px.
3. Footer consumes 32px at the bottom.
4. Market header rows sit above the chart/sidebar body and reduce visible body space.
5. The analysis side must support the chart/orderbook split.
6. The analysis side must support chart/positions resizing.
7. Chart can shrink to 260px.
8. Positions panel must not shrink below 400px when connected.
9. Positions panel must not shrink below 180px when disconnected.
10. Horizontal analysis/sidebar resize must keep working.
11. Sidebar form/account content can be taller than visible space, so sidebar needs internal `overflow-y-auto`.
12. Sidebar should not require the whole document to scroll just to reach the account panel.
13. If chart expansion creates document scroll, the sidebar must not leave a blank bottom-right region.
14. The sidebar must respect the current resizable width.
15. Account panel should stay below the trade form when content is short, using flexible spacer behavior.
16. The trade button should keep about 20px top spacing.
17. Mobile trade layout should remain unaffected.
18. Existing persisted panel sizes from `react-resizable-panels` should not be casually broken.

## Why The Current Fix Got Complicated

The UI is mixing two layout models:

1. App-shell model: header and footer are fixed, panels fit inside the visible viewport, and each panel scrolls internally.
2. Document-scroll model: the chart can increase page height, and the browser document scrolls to reveal lower content.

The sidebar wants app-shell behavior while the chart currently creates document-scroll behavior. CSS can handle either model cleanly, but this mixed model needs extra work. Once the page scrolls, the sidebar either scrolls away with the document or has to be pinned. Because the sidebar sits inside a resizable panel, pinning it while preserving its exact left/width led to measurement logic.

`position: sticky` was tested conceptually for this, but inside the current `react-resizable-panels` structure it is fragile because ancestor sizing/overflow can stop it from behaving like a viewport-pinned panel.

## Approach A: Fixed App Viewport

Make the desktop terminal a true app shell:

- Outer desktop shell uses `h-dvh overflow-hidden`.
- The main workspace body gets the exact height between header/footer.
- Sidebar becomes simple: `h-full min-h-0 overflow-y-auto`.
- Chart/positions resize happens inside the fixed body height.
- Positions panel scrolls internally if needed.
- No document scroll is created by increasing chart height.

Pros:

- Simplest CSS model.
- Removes sidebar pinning and page-scroll edge cases.
- Best fit for a trading terminal.
- Existing `react-resizable-panels` can handle horizontal and vertical panes.

Cons:

- Chart cannot grow beyond the viewport unless another panel shrinks.
- If the product requirement is "chart can become taller than viewport", this approach rejects that behavior.

Best choice if we want the terminal to behave like an app, not a document.

## Approach B: Page-growing Analysis With Sticky Sidebar Column

Keep chart expansion as page growth, but restructure the layout so the sidebar is a first-class sticky column:

- Put the sidebar column at the layout level, not as a child that has to measure and fix itself.
- The left analysis column can grow taller than the viewport.
- The right sidebar column gets:

```css
position: sticky;
top: var(--app-top-offset);
height: calc(100dvh - var(--app-top-offset) - var(--footer-height));
overflow-y: auto;
```

- Horizontal resizing can stay with `react-resizable-panels` if the sticky behavior is applied to the correct panel wrapper, or can move to a CSS grid column with a custom resize handle.

Pros:

- Supports chart height increasing beyond viewport.
- Sidebar stays visible and scrollable without per-frame fixed-position measurement.
- Matches the behavior the user expected in the screenshots.

Cons:

- Requires a small `MainWorkspace` structure refactor.
- Needs careful testing with `react-resizable-panels`, because sticky must be placed on the correct wrapper.

Best choice if chart expansion should create page scroll.

## Approach C: Use `react-resizable-panels` For Both Axes

The app already has `react-resizable-panels@4.6.0` installed.

Use it for:

- Outer horizontal split: analysis/sidebar.
- Inner vertical split: chart/positions.
- Existing chart/orderbook split can remain nested.

Pros:

- Removes custom pointer, keyboard, and resize observer code in `AnalysisSection`.
- Panel persistence is already part of the current dependency.
- Min sizes and handles become more consistent.

Cons:

- The library sizes panels inside a container. It is best for Approach A.
- Pixel min heights plus page-growing chart behavior are less natural.
- If we keep page scroll, we may still need sidebar layout restructuring.

Best choice if we accept a fixed app viewport.

## Approach D: Keep Current Architecture, Extract Measurement Logic

Keep the current behavior but move the sidebar fixed-position logic into a reusable hook, for example `usePinnedPanelFrame`.

Pros:

- Smallest change from current patch.
- Can be made readable by centralizing constants and measurements.

Cons:

- Still measurement-heavy.
- Still couples the sidebar to document scroll, header height, footer height, and resizable panel geometry.
- More regression-prone than choosing one layout model.

Best only as a short-term patch.

## Library Candidates

### Already installed

- `react-resizable-panels@4.6.0`: should remain the first choice for resizable pane behavior. It solves split panels, not sticky page layout.
- `@tanstack/react-virtual`: installed, but relevant to virtualized long lists/tables, not this layout issue.

### Possible but not core fixes

- `react-use-measure` or a ResizeObserver hook: can make measurement code cleaner if we keep measurements, but does not remove the layout conflict.
- `react-virtualized-auto-sizer`: useful when a child needs parent dimensions, but not a sidebar pinning solution.
- `@floating-ui/react`: useful for popovers/tooltips/menus, not for trading panel layout.

Conclusion: no new library is likely to solve the core issue better than choosing the right layout model. The existing `react-resizable-panels` dependency is enough if we move toward a fixed app shell or clean nested panels.

## Recommendation

Pick one of these before implementing:

1. If chart expansion must create page scroll, use Approach B.
2. If the terminal should behave like a professional fixed trading app, use Approach A plus C.

My recommended clean path is Approach B for the current product request because the user explicitly wants to increase the chart height and already expects scrolling after expansion. The implementation should move sticky/sidebar height responsibility up into `MainWorkspace` instead of making `TradeSidebar` measure and pin itself.

If the product can accept a fixed viewport terminal, Approach A plus C is cleaner and likely more maintainable long term.

## Later Implementation Plan

1. Decide whether chart growth should create document scroll.
2. If using Approach B, revert the measured fixed-position logic in `TradeSidebar`.
3. Move sidebar height/sticky behavior into the layout wrapper in `MainWorkspace`.
4. Keep `TradeSidebar` as a simple scrollable content component.
5. Either keep the current chart height logic or migrate chart/positions to `react-resizable-panels` depending on the chosen model.
6. Verify these cases:
   - Mainnet desktop at 1090x614.
   - Mainnet desktop at 1280x832.
   - Testnet desktop with banner.
   - Connected wallet positions min height.
   - Disconnected positions min height.
   - Chart increase with drag and keyboard.
   - Chart decrease with drag and keyboard.
   - Sidebar internal scroll reaches account panel bottom.
   - Page scroll after chart expansion does not create bottom-right blank area.
   - Horizontal sidebar resize still works.
   - Mobile layout is unchanged.

## Current Patch Status

Do not treat the current code as the final architecture.

- `analysis-section.tsx` currently has chart growth logic based on visible viewport height and parent min-height updates.
- `trade-sidebar.tsx` currently has measurement and fixed-position logic to avoid the blank bottom-right area.
- `trade-panel.tsx` currently adds `pt-5` above the trade button area.
- Biome passed for the three touched trade files.
- Full TypeScript validation was not clean due to existing unrelated repository errors.

