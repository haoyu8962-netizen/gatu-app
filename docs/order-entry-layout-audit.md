# Order-entry layout audit

The desktop order-entry panel must show every ordinary order type in its default grid height without an internal scroll step. Shortened user layouts and unusually long action feedback may need local overflow, but the order-type header must remain visible and all fields, actions and summaries must remain reachable. Do not enlarge the chart, book or page when changing order type.

The desktop header, default field frames, CTA and summary chrome retain their pure runtime views; startup placeholders have been removed under [ADR 0010](adr/0010-blank-until-ready-startup.md) and the [surface 4 migration record](work-memory/sessions/2026-09-16-trade-panel-view-migration.md).

## Reference and initial findings

Inspected [Hyperliquid HYPE](https://app.hyperliquid.xyz/trade/HYPE) on 2026-09-08. At 2016×1358 its Scale panel stays 670px tall, with 33px inline fields and 8px spacing. Total Orders and Size Skew share one row. Its footer is 179px and shows Start Price, End Price, Order Value, Margin Required and Fees. Both order count and size skew remain in the form rather than being repeated in the footer.

GATU's initial Scale content needed 625px but had only 349px available because the footer consumed 321px. The header was inside that scrolling area. Initial vertical overflow at the same viewport was 50px for Limit, 68px for Stop Limit and Take Profit Limit, 103px for TWAP and 276px for Scale. Market, Stop Market and Take Profit Market fitted. Merely proving that the page height stays stable missed these presentation defects.

## Presentation rules

- The header is a separate non-scrolling region. Keep the active order type, margin/account controls and direction selector accessible after every switch and every local scroll.
- Use the existing compact desktop header, 36px price/size/Scale/TWAP input frames, 8px field spacing, compact 20px summary rows and a 40px desktop action button with 12px footer insets. TP/SL frames are 33px on both surfaces, with permanent labels and independent return-unit menus contained inside their frames. Ordinary mobile fields remain 32px. Do not reduce text through browser zoom, CSS scaling or page-size changes.
- Scale uses inline Start/End price fields and a shared Orders/Skew row. Keep complete accessible labels, visible ranges, input constraints, precision and mid-price actions. Its compact summary retains Start/End prices and financial totals; order count and skew remain in the inputs and order confirmation.
- Preserve all existing TWAP timing, randomization, trigger and stop controls, TP/SL controls, precision, financial arithmetic and execution guards. Inline presentation must not silently discard optional values or mutate the order model.
- Use exactly one mounted form and retain input state across tab and locale changes. Mounted TWAP fields and conditional hints must subscribe to locale changes; translate the running-time range as well as the individual fields. Do not create invisible measurement copies or store translated text in order state.
- Record and test all eight real order types, including the conditional TWAP summary/hint rows and TP/SL expansion. A passing synthetic tall-form test is only an overflow fallback check.

## Verification

Use the production TradePanel inside the production desktop grid hook in the browser fixture, with deterministic wallet/network boundaries and no exchange request. Keep production validators, field feedback, CTA and summaries active. Compare outer grid geometry across switches; assert that normal tabs have no vertical overflow and their fields and actions are visible. Exercise English and Chinese at wide and compact desktop widths, smaller manually selected heights, retained values, range limits and keyboard reachability. Inspect the actual local terminal as well as the fixture, and retain mobile behavior when changing shared components. A fixture that supplies an empty validation array cannot establish real-panel coverage.

## Verified reference coverage and mobile boundary

Hyperliquid's desktop panel stays 670px at 2016×1358 and 1545×900, and 677px at 1238×900 and 1001×900. Market, Limit, Stop Market, Stop Limit, Take Profit Market, Take Profit Limit, TWAP and Scale all fit without scrolling. Market/Limit with TP/SL and TWAP with advanced fields also fit. This validates reducing excessive field and footer spacing before relying on overflow.

Hyperliquid's mobile TWAP at 393×852 uses about 417px in its default state and 499px with advanced conditions. GATU's mobile split now uses the viewport-based size as a minimum and grows with natural form content. The book stretches alongside it and the account area follows below. Complete TWAP and Scale controls remain inline; do not move them into a drawer solely to satisfy the former fixed-height ceiling. Embedded forms have no internal vertical scrolling; short screens and keyboards use the surrounding page scroll. Preserve fees, margin requirements, execution conditions and touch target space.

## Local results

At 2016×1358 and 1001×900, all eight ordinary desktop tabs now have `scrollHeight === clientHeight`. Scale's footer decreased from 321px to 177px while retaining prices, order value, margin and fees. The chart, order book, account panels and persisted grid geometry remain stable when switching tabs. The price unit may be hidden visually in a narrow container, but the full accessible input label retains it.

The initial component fixture uses the real header, fields, summaries and order-entry store, but supplies empty field errors and a substitute footer. Its passing four-viewport results did not cover the production validator's empty-form messages or their combined height. Retain it for component controls and constrained geometry, and use the production TradePanel/grid fixture for validation-dependent layout coverage. A separate test changes language while TWAP remains mounted so remounting cannot hide stale labels. Synthetic tall-content tests cover page-scroll recovery and natural height changes; real mobile controls additionally verify TWAP conditions and retained inputs. Desktop constrained-height tests retain their internal-overflow expectations.

The six ordinary mobile market/limit/trigger forms retain the viewport-based minimum. TWAP expands with its enabled conditions and Scale with its full fields. All eight real forms must have zero internal vertical overflow, with matching form/book bottom edges. Mobile TWAP reserves the natural wrapped height of both translated trigger directions while a trigger value is configured. Only the applicable direction is visible and exposed to assistive technology. Equality or an unavailable mark hides both hints without changing their space; clearing the configured trigger removes that space. Short screens use page scrolling for lower content.

## TWAP advanced settings

TWAP quantity and its percentage slider precede the duration controls on desktop and mobile. Randomize timing and Reduce Only form one wrapping options group; spot omits Reduce Only. Advanced Settings occupies its own row and defaults off. Its trigger and side-aware Max/Min Price fields expand inline only when enabled. The advanced disclosure remains available for disconnected or unfunded previews; price inputs, randomization and Reduce Only retain the existing form-availability guards. Keep one instance of each input, disable and hide the collapsed fields from keyboard and assistive navigation, and preserve their draft strings across toggles and locale changes. Mobile option rows have a 32px visual minimum with 12px separation, retaining independent checkbox hit areas; they wrap when the form container cannot fit them side by side.

The advanced toggle belongs to the transient order-entry draft and increments its revision. Turning it off retains raw prices but resolves both effective prices to null for validation, summaries, confirmation and submission. The shared submitter independently omits details when the captured advanced flag is off. Enabling with blank optional fields remains an ordinary TWAP. Market changes and successful current-draft resets clear the toggle and prices; changing order tabs or locale preserves them. Frozen confirmation intent and stale-draft protection continue to apply.

Regression coverage includes default closure, repeated toggles, retained input nodes and prices, independent randomize/reduce-only state, spot and disabled controls, English/Chinese changes, direction labels, excluded hidden summaries and payloads, and desktop/mobile geometry. The mobile split remains content-sized; desktop grid boundaries remain independent of expansion.

## Desktop/mobile parity

Follow [the surface comparison](order-entry-surface-parity.md) for the complete eight-order matrix. Both surfaces use the same TWAP and compact Scale summaries. Quantity precedes both forms; Scale count and skew share a row with visible ranges rather than being repeated in the footer. TIF shares the Reduce Only row where available; TP/SL has its own following row. Trigger-only prices do not offer a Mid shortcut. Ordinary leveraged trigger orders retain the same liquidation row as desktop; it remains a placeholder where the existing estimator does not support that order type.

Use fixed field gaps on mobile and assign surplus minimum-height space before the summary. Keep the summary above the mobile action and below the desktop action. Quantity, denomination and Reduce Only use the shared draft across responsive remounts; successful resets must continue through the identity/revision guard.

The real MobileTradeView fixture has a separate sibling Vite dependency cache. Check all eight forms, expanded TP/SL, both return-unit menus, field hit testing, advanced TWAP retention, Scale limits, locale changes and unavailable-account states. Do not substitute a synthetic form for these checks or allow fixture dependency optimization to invalidate the development server cache.

## Validation feedback and combined form height

At 1400×1330, the production Chinese Limit panel with empty size and newly opened TP/SL previously overflowed its field viewport by 5px; empty Scale overflowed by 15px. The immediate size error occupied a field row while the empty TP/SL or Scale error occupied the footer. The nested field and body scrollers could also compete in reduced user layouts. At the same viewport, the inspected Hyperliquid Limit/TP/SL form showed no immediate required-field errors and fitted its panel. Its right column was 396px wide versus GATU's 296px, so its dimensions are not interchangeable with this project's three-column grid.

- Keep empty required drafts quiet, including when a user clears a field. A nonempty invalid value such as `0` still receives feedback. An incomplete Scale range is quiet only when every populated endpoint is valid. These are display rules: raw validation and `canSubmit` remain unchanged.
- Show each TP/SL direction/return error beside its inputs without repeating the same error in the footer. Share the protocol normalization and direction result when deciding whether local feedback covers an error. A positive price that rounds to zero still needs the footer error when local direction feedback cannot describe it.
- Apply the same account/market presentation readiness to local TP/SL feedback and the footer. Recovery hides text and `aria-invalid` together without clearing raw invalid flags or changing the draft.
- Display the estimated monetary TP/SL result beside its permanent Profit/Loss label, with an approximation sign and the complete explanation available to assistive technology and via the title. Keep both input frames and unit menus at their existing sizes. Labels and large amounts may wrap; do not truncate the amount or reduce the font to force a fit.
- Keep one overflow owner, `trade-panel-body`, below the fixed header. Fields retain their natural height and grow into unused space. The footer stays at the bottom when content fits; shortened user layouts and unusually long combined feedback scroll the fields, action and summary together. Neither the grid nor the page grows in response to desktop form content.

Regression coverage must include the reported 1400×1330 Chinese empty Limit/TP/SL state, all eight initial forms, populated TP/SL with both monetary estimates, invalid quantities and price directions, TWAP advanced conditions, Scale ranges, desktop breakpoint edges, and saved reduced geometry. Assert complete labels, inputs, unit menus and monetary values as well as scroll extents, actual hit targets and stable neighboring panel bounds. Mobile uses the same feedback and TP/SL presentation while retaining its surrounding page scroll.

The production desktop matrix checks 1001/1400/1420/1421/1545px in English and Chinese, with complete initial forms and populated/error combinations. The separate component/overflow fixtures retain 1001/1238/1545/1740/2016px checks. Mobile coverage includes 320/375/393px, independent return-unit menus, a non-USDC large estimate, locale and draft retention, and unavailable-account/market recovery. No real transaction or signature is used for these layout checks.

Validation: 150 relevant unit/component checks passed, plus the Vite cache-isolation contract. The production desktop/mobile Playwright configuration passed 29 cases; the existing desktop form and overflow suites passed 11. The final six strengthened PnL-boundary cases were rerun successfully. TypeScript and Biome checks passed. Screenshots of desktop/mobile Limit with populated TP/SL, advanced TWAP and the 320px large USDH estimate were visually inspected.
