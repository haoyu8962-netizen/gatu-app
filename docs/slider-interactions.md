# Trading slider interactions

## Scope and reference

The trading quantity and leverage controls share `TradeSlider`, an application-only
single-thumb control. It uses Pointer Events and a native range input for keyboard
and assistive technology access. `TradeSizeSlider` and `LeverageSlider` are thin
business adapters. The shared `@gatu/ui` Slider remains available for other products;
no new dependency or alternate wallet/trading execution path is introduced.

The reference is the [Hyperliquid trading terminal](https://app.hyperliquid.xyz/trade/HYPE),
inspected through its authenticated UI and publicly served JavaScript in September
2026. The inspected slider was custom React code, not evidence of Base UI usage.
Observed behavior is a comparison baseline, not a public SDK contract.

| Surface | Application behavior |
| --- | --- |
| Desktop and mobile order size, including ordinary advanced orders | Integer requested percentages, actual size and percentage derived from quantity precision |
| Market and limit position close | Shared slider with existing `size`, `percent`, and explicit `max` intents, plus existing amount input and shortcuts |
| Position TP/SL | Slider and percentage input only while configuring a fixed quantity |
| Leverage and margin/leverage dialogs | Integer range from 1 to the market maximum; drag previews, release edits pending leverage, Confirm invokes the existing action |
| Slippage | Numeric draft with explicit Confirm/Cancel; input and blur never persist; existing 0.1–5% bounds and two decimal places remain |
| Portfolio history cursor | Separate indexed chart navigation; preserve index -1, Home/Escape clearing, and End selecting the latest sample |

The legacy `LeverageControl` remains unused by runtime callers and uses the same
adapter if rendered. Existing deposit, withdrawal, bridge, staking, and vault forms
have no quantity slider to migrate. Official repay, chase, and trailing-stop paths
are comparison inventory only: this work does not add those trading businesses.

Confirmation ownership, late order completion and shared limit-price prefill are
specified in [`order-draft-lifecycle.md`](./order-draft-lifecycle.md).

## Visual and input contract

- A 33px control contains an 8px track and an 18px thumb. Quantity controls have
  6px marks at 0/25/50/75/100; leverage has no percentage marks.
- Reuse `trading-panel-*` tokens in both themes and on both order sides. The
  44px native input target and thumb remain mounted while values change.
- Hover and press feedback scale to 1.7 and 2.2 over 200ms. Reduced-motion disables
  these scale transitions. Thumb geometry and input values do not depend on motion.
- Pointer position is continuous. Business requests and percentage text are
  integers. Actual quantity can yield a fractional underlying percentage, displayed
  as a rounded integer; this presentation never changes an order's size or intent.
- Horizontal geometry, keyboard arrows, fill origin, and marks follow direction.
  Arrow keys move one unit, Page keys ten, Home/End select the range endpoints.
- Retain requested keyboard/native-range intent while focused, independently of
  actual rounded quantity. An assistive technology range event is an absolute value,
  never an inferred delta. Blur restores the native value to the actual percentage.
- Locale/theme changes preserve mounted controls and drafts. Text drafts belong to
  their interaction identity; changing owner/market/order context clears old drafts.

## Scheduling and cleanup

Pointer movement schedules at most one RAF to paint transforms and marks. It arms
one **15ms preview timer** unless one is already pending; when the timer fires it
publishes the draft value of that moment, so consecutive business previews are at
least 15ms apart and a continuous stream of moves keeps publishing (a throttle).
RAF never dispatches financial calculations, and the timer never waits for RAF.
Moves dispatched inside one task cannot publish before that task ends. Release reads
its own final coordinate, cancels pending work, and synchronously commits that value
once. A stationary thumb press does not publish a value or commit.

Until 2026-09-20 the timer was reset on every move, as in the official terminal's
slider. On displays that deliver pointer moves faster than 15ms apart (120Hz and up)
a continuous drag then published nothing until the pointer paused or released, so
the size, percentage and order value froze while the thumb moved. The throttle is a
deliberate improvement over that behaviour, not an alignment with it.

While a pointer session is active, its draft owns both the thumb and the native
range value. Parent renders, including unchanged or quantity-rounded previews,
must not overwrite that position. Release accepts the actual business percentage;
only a cancellation restores the exact starting snapshot.
Changed commits trigger one local reconciliation render after the business callback,
even if lot rounding leaves the parent's value unchanged. Settling must not depend
on a later quote update. Stationary release uses the current actual percentage
without changing quantity or issuing a commit.

`onInteractionStart` records the exact business snapshot. `onInteractionEnd` runs
once after commit/cancel, including stationary release. Trading forms use these
boundaries to lock submission while a gesture is active, including the interval
before the first preview. Keyboard and native-range input commit synchronously.
The lock is a ref set in the gesture callback, so it takes effect at pointer down
without waiting for a render. The desktop and mobile order forms read it in
`handleCtaClick()`, which wraps every action of the submit button, and again in
`canExecuteOrder()`; Market Close, Limit Close and TP/SL read it in `handleSubmit()`;
the leverage and margin mode dialogs read a dedicated ref in `handleConfirm()` next to
the drag draft they display. Dialogs built on `TradingActionButton` also pass it as
`isActivationLocked`, which the button checks before its Enable step. The gesture
takes no part in a submit control's `disabled` state or appearance: a single pointer
cannot reach the button mid-drag, so greying it on every slider touch carried no
information, and the official terminal's submit conditions have no gesture term (ADR
0017 addendum, `docs/confirmation-surfaces.md`). Validity, availability and in-flight
conditions still disable the control as before. The lock ends with the gesture:
moving focus off the slider cancels the gesture and restores the starting value, so
a confirm after that acts on the restored value that is then on screen.

A resize cancels the gesture only when the control's layout width changes. The
observer compares each `contentRect.width` with the first one it reports for that
gesture, never with `getBoundingClientRect()`: an ancestor transform, such as the
`scale` of a dialog's 200 ms open animation, changes the visual width but not the
layout width, and comparing the two cancelled any drag that began during the
animation and snapped the thumb back to where it started.

Pointer cancellation, lost capture, window blur, hidden document, a window resize,
a change of the control's layout width, unmount, `disabled`, invalid ranges, and
changed identity/direction cancel pending RAF/timers/listeners. Other pointer IDs
cannot replace the active gesture. What a cancellation restores belongs to the
caller, and a changed identity never receives an old snapshot. The order forms put
back the exact starting size string whenever the identity still matches, whether or
not the form is available at that moment. The close dialogs route the restore through
the same `canEdit` guard as every other edit, so a gesture cancelled while the
position data is unreadable keeps the last intent that was published before the pause
instead of the starting one; the thumb is repainted from that value. In both cases a
move made during a pause was never published and is simply dropped. No synthetic
pointerup, forced React flush, or duplicate Base UI gesture engine is used.

`disabled` and `paused` are different reasons and end a gesture differently. Both make
an idle slider unavailable: no gesture can start, keyboard and native-range input are
refused and the control is dimmed. `disabled` is for reasons that end the editing
context (closing or submitting dialog, disconnected wallet, a balance or position that
is really zero, a closed or flipped position) and cancels an active gesture at once.
`paused` is for value sources that are temporarily unreadable (balance or position data
loading, stale or failed, typically around a reconnect) and must not throw away a drag
the user is in the middle of: the gesture survives, the thumb keeps following the
pointer, no business preview is published and any pending preview timer is dropped.
When the source recovers, the slider publishes the held draft once through the same
15ms timer without waiting for another move, because the same percentage may now mean
a different quantity; a thumb that was only pressed publishes nothing. Releasing while
still paused cancels. The submit lock stays held for the whole gesture, paused or not.

While a gesture is held and the slider is unavailable, the hidden native range input
stays focusable with `aria-disabled="true"` instead of the native `disabled`
attribute, which the component writes back after every render and at the end of the
gesture. A natively disabled input would lose focus, and losing focus is one of the
cancellation paths. The desktop and mobile order forms pass `paused` for blocked
availability, Market Close and Limit Close for position data that is loading, stale or
failed; TP/SL and the leverage dialogs pass only `disabled`. The official terminal's
slider has no cancellation path and no disabled state at all, so a drag there always
ends by committing; `paused` keeps that for data hiccups without giving up the
cancellations that protect a changed editing context.

Unmount clears pending work during layout cleanup, before a replacement form can
run its layout effects. A disposed quantity hook cannot restore or commit into the
shared order-entry store. This covers keyed market replacements as well as identity
changes on a mounted form; an old BTC gesture must not undo a new market's form
reset. Interaction end still releases the gesture lock. StrictMode effect replay
must leave the next gesture usable without duplicate callbacks.

The official web implementation's missing touch-cancel cleanup and leverage
minimum positioning were not copied. Its vibration path required a native Android
Capacitor platform; Android browser emulation still reported platform `web` and no
vibration calls. This web/PWA implementation adds neither haptics nor a setting for it.

## Quantity and execution boundaries

Quantity arithmetic stays in domain modules and uses Big.js. Multiply the precise
maximum size by the requested percentage, then round down to `szDecimals`. Generated
quote amounts and base-to-quote conversions round down to two decimal places. A
100% selection must never round a generated amount above the available maximum.
Follow the [SDK-facing tick and lot-size rules](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/tick-and-lot-size).

The official HYPE sample had maximum 0.69 at price 84.292: requesting 35% produced
0.24 (display 35%); 63% produced 0.43 (display 62%); 1% produced zero; 100% produced
0.69. These are precision examples, not current market data or pricing assumptions.

Small maximum quantities make this rounding visible as large steps. With maximum
`0.003` and `szDecimals = 3`, requests from 63% through 66% still produce `0.001`
and an actual percentage of 33.33%; 67% produces `0.002`, and 20% produces zero.
Returning to 33% after release in this case is a successful rounded selection,
not a canceled gesture or an SDK rollback. Do not round quantity up or retain a
misleading requested percentage after release to hide the lot-size constraint.
A subsequent official HYPE check with maximum approximately `0.70` confirmed that
a 2% track press produced `0.01`, displayed 1%, and settled the thumb at 1.43%.

TP/SL uses the frozen, reviewed position snapshot as denominator. Configured 100%
is an explicit fixed size; whole-position protection still passes `null` and
produces protocol size `"0"`. Configured 0% or a rounded zero is invalid and cannot
remove protection or silently become whole-position protection. Preserve existing
PnL/ROE precedence, freshness and scope checks, operation locks, REST/SDK boundary
revalidation, cancel/replace ordering, and uncertain-result handling.

Position close preserves requested intent separately from its actual percentage.
A manually entered size whose actual percentage displays 100 must not become an
explicit Max selection. No slider can submit, sign, approve, change account mode,
or save leverage automatically. Those actions retain their existing confirmation
and identity checks.

## Implementation practices and verification

Keep gesture geometry and pending work in refs; React owns business drafts and
submission state. Layout effects synchronize DOM state and lifecycle boundaries,
not chains of derived financial state. Native input mode remains uncontrolled for
its lifetime with one DOM synchronization owner. See React's [input guidance](https://react.dev/reference/react-dom/components/input#optimizing-re-rendering-on-every-keystroke)
and [Pointer Events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events).

Regression coverage includes:

- Exact 14/15ms preview timing, continued publishing under moves faster than the
  preview interval, independent painting, final-coordinate flush,
  same-frame reversals, multiple pointers, stationary focus, and all cancellation
  boundaries, including resize and unmount.
- Held track presses across old-value and quantity-rounded parent renders, plus
  small-lot release and cancellation behavior in a real browser.
- Low-precision keyboard accumulation and absolute native input after a keyboard
  draft; invalid ranges, RTL, stable IDs, labels, error descriptions, and integer inputs.
- Large decimal quantities, quote rounding, spot/perp sizing, fixed TP/SL 100% versus
  dynamic full-position protection, zero rejection, identity changes, draft recovery,
  and blocking confirmation during a gesture.
- Slippage Confirm/Cancel/persistence and unchanged portfolio chart navigation.
- Real Chromium pointer/touch interactions, 390/1000/1001/1333/1920px layouts in both
  themes, exact geometry, no horizontal clipping, and the existing all-order-form
  desktop layout suite.

The browser fixture explicitly scans application CSS and uses the existing separate
`node_modules/.vite-browser` cache. Its performance attachment records callback
intervals, parent commits and timing. Bounds validate scheduling and final values;
they do not establish device-wide latency, mainnet execution, or a measured speedup
against the old implementation. Wallet/signature/real order actions are tested
through existing controlled test doubles, without creating live orders.

## SDK request verification

The SDK contract tests use the installed `@nktkas/hyperliquid` 0.33.3 package,
including the repository's existing TWAP duration patch. They execute real
`ExchangeClient` validation and serialization with a test signing wallet and a
capturing transport. Neither signatures nor order requests reach a live account.
Compare fields with the [exchange API](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint)
and the [SDK documentation](https://nktkas.gitbook.io/hyperliquid).

- `order-slider-sdk-contract.test.tsx` checks all eight perpetual order types and
  the four supported spot types, both sides, base/quote inputs, core/spot/HIP-3 asset
  IDs, lot and price precision, reduce-only/TIF, attached TP/SL, and TWAP details.
- `use-asset-leverage.test.tsx` passes confirmed leverage through the real SDK and
  rejects owner changes before signing. Editing a draft makes no SDK request.
- `position-slider-sdk-contract.test.ts` and the position submit/modal tests cover
  rounded percentage sizes, Max, fixed versus whole-position TP/SL, trigger/limit
  fields, and cancel-before-replace ordering.

Slippage is a percentage in settings, basis points inside order calculations, and
a protective limit price in the SDK request. Both order construction and the final
execution guard must stay inside the exact Big.js limit: round buy prices down and
sell prices up to a valid tick. For reference price 1378.9 and 0.1% slippage, a buy
limit of 1380.3 exceeds 1380.2789 and must be rejected; the valid inward tick is
1380.2. Limit and trigger orders retain their separate pricing semantics.

`FrontendMarket` is accepted by the pinned SDK and is the terminal's existing
market-order TIF; the public exchange table only lists `Alo`, `Ioc`, and `Gtc`.
Offline acceptance verifies compatibility with the installed SDK, not a live
exchange acknowledgement or fill. Public InfoClient reads can be checked live
without signing; they do not validate exchange mutation outcomes.
