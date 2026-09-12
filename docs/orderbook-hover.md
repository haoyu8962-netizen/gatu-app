# Order book cumulative hover

Desktop, compact and split books share `useOrderbookHover` and one
`OrderbookHoverTooltip` per rendered book. The tooltip reads existing public book
and market-context data; it does not create subscriptions, request quotes or
invoke exchange actions.

## Data and precision

`processLevels` preserves decimal strings and computes cumulative base size and
quote notional with Big.js. The hover summary reuses those totals. Average price
is cumulative quote notional divided by cumulative base size; distance is
`abs(level price - reference price) / reference price * 100`. Do not substitute
the final level price for every price in the cumulative notional.

Use the selected market's existing fast market-context `midPx`, falling back to
its live `markPx`. The global market context must report a successful, fresh
receipt. Do not use the grouped book midpoint or the selected-market hook's
cached mark as a reference. Missing or stale reference data renders `—` for
distance; it is not zero distance. Invalid or nonpositive book amounts do not
produce a tooltip.

Distance has four decimal places. Average prices honor five significant figures
and the market's perp/spot decimal cap, while integer prices retain their full
integer value. Base totals use `szDecimals`. USDC totals display whole units;
other quote units preserve the existing order-book notional precision so small
non-USDC amounts remain visible. Tooltip totals are not abbreviated. Asset
labels and translations update without replacing price rows.

## Selection and input

Mouse hover selects a side and rank counted from the best price. A stationary
pointer therefore reads the current level at that screen position on each live
snapshot. Keyboard focus and touch long-press select the exact price instead;
they follow that price while it remains visible. Row keys remain `side + price`
so selection never restarts level pulses or quantity feedback.

Container pointer handlers update selection only when its target changes. Gaps
between real rows preserve the current selection; headers, spread, placeholders
and leaving the ladder dismiss it. Escape dismisses the tooltip. Only the active
row references the tooltip with `aria-describedby`; live updates are not an
`aria-live` announcement.

Touch uses the existing 450 ms long press, 8 px movement tolerance and 2.5 second
automatic dismissal, counted from long-press activation. Releasing the finger
preserves that deadline: the resulting touch `pointerleave` does not dismiss a
completed press. Moving, scrolling or cancellation still dismisses the gesture
without preventing scrolling. Mouse hover or keyboard focus taking over cancels
the touch deadline so it cannot close the new selection.

A completed long press suppresses its resulting click; a later ordinary tap
still fills the clicked limit price without opening a tooltip. Pointer-generated
focus remains suppressed through `pointerup` and scope invalidation until the
compatibility click, cancellation or a keyboard event; it must not be mistaken
for keyboard selection. The price must remain valid when the long-press timer
fires. Market, network, grouping, actual feed, view and measured-row geometry
changes invalidate the session. Hidden pages, blur, disabled data and removed
targets close it. Recovery cannot resurrect an old selection.

## Geometry and layers

The shared Base UI positioner uses a virtual anchor resolved from the current
side and rank. It portals a 228 px tooltip outside clipped panels, prefers the
left side with an 8 px gap, and keeps a 10 px viewport collision margin. Changing
the selected rank refreshes the anchor; ordinary quote changes do not measure
every row or allocate new observers. Scrolling or resizing closes the selection
so a stationary pointer cannot retain a target after the layout moves. Hidden
anchors also hide the positioner.

The range from the best price to the selected row uses the existing
`--orderbook-hover` token. Non-interactive pseudo-elements bridge the existing
row gaps and draw a dashed boundary without changing layout. Desktop and compact
asks use the top boundary, bids use the bottom; split rows use the bottom on both
sides. Depth bars, level pulses and numeric text keep their established layers,
colors, animation timing and minimum contrast. Animation preferences do not
disable hover interaction.

This matches the desktop cumulative-hover behavior inspected in the
[Hyperliquid terminal](https://app.hyperliquid.xyz/trade/HYPE). It is a UI behavior
reference, not a new SDK endpoint or a dependency requirement. Exact decimal
arithmetic, existing row identity, unavailable-data guards and mobile long-press
behavior follow this project's contracts.

## Verification

- `orderbook-hover.test.ts`: exact arithmetic, invalid data and price precision.
- `use-orderbook-hover.test.tsx`: stationary hover, keyboard/touch identity,
  interruption, recovery, compatibility focus and timer cleanup/ownership.
- `orderbook-row-tooltip.test.tsx`: real popup content, live reference fallback,
  localization, accessibility association and long-press click suppression.
- Mobile mode/subscription tests: compact and split integration, current-feed
  guards and unchanged subscriptions.
- `tests/browser/orderbook-hover.pw.ts`: real positioning, cumulative ranges,
  live snapshots, gap/spread behavior, themes and viewport bounds. Native touch
  sequences cover short taps, first and repeated focused long presses through
  release and expiry, click suppression, keyboard recovery and touch scrolling
  in both compact and split layouts.
- Existing layout, CLS, pulse, size-color and price-selection regressions remain
  required for changes to these layers.

“距中间价”只使用同市场且接收时间有效的服务端 `midPx`。缺少中间价时显示占位，不将标记价替代中间价；平均价和累计量继续由盘口精确累计数据计算。
