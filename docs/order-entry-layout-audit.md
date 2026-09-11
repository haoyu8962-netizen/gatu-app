# Order-entry layout audit

The desktop order-entry panel must show every ordinary order type in its default grid height without an internal scroll step. Shortened user layouts and unusually long action feedback may need local overflow, but the order-type header must remain visible and all fields, actions and summaries must remain reachable. Do not enlarge the chart, book or page when changing order type.

## Reference and initial findings

Inspected [Hyperliquid HYPE](https://app.hyperliquid.xyz/trade/HYPE) on 2026-09-08. At 2016×1358 its Scale panel stays 670px tall, with 33px inline fields and 8px spacing. Total Orders and Size Skew share one row. Its footer is 179px and shows Start Price, End Price, Order Value, Margin Required and Fees. Both order count and size skew remain in the form rather than being repeated in the footer.

GATU's initial Scale content needed 625px but had only 349px available because the footer consumed 321px. The header was inside that scrolling area. Initial vertical overflow at the same viewport was 50px for Limit, 68px for Stop Limit and Take Profit Limit, 103px for TWAP and 276px for Scale. Market, Stop Market and Take Profit Market fitted. Merely proving that the page height stays stable missed these presentation defects.

## Presentation rules

- The header is a separate non-scrolling region. Keep the active order type, margin/account controls and direction selector accessible after every switch and every local scroll.
- Use the existing compact desktop header, 36px price/size/Scale/TWAP input frames, 8px field spacing, compact 20px summary rows and a 40px desktop action button with 12px footer insets. Existing TP/SL and percentage controls keep their own density. Do not reduce text through browser zoom, CSS scaling or page-size changes.
- Scale uses inline Start/End price fields and a shared Orders/Skew row. Keep complete accessible labels, visible ranges, input constraints, precision and mid-price actions. Its compact summary retains Start/End prices and financial totals; order count and skew remain in the inputs and order confirmation.
- Preserve all existing TWAP timing, randomization, trigger and stop controls, TP/SL controls, precision, financial arithmetic and execution guards. Inline presentation must not silently discard optional values or mutate the order model.
- Use exactly one mounted form and retain input state across tab and locale changes. Mounted TWAP fields and conditional hints must subscribe to locale changes; translate the running-time range as well as the individual fields. Do not create invisible measurement copies or store translated text in order state.
- Record and test all eight real order types, including the conditional TWAP summary/hint rows and TP/SL expansion. A passing synthetic tall-form test is only an overflow fallback check.

## Verification

Use real form/header/summary components in the browser fixture, with deterministic data and wallet boundaries and no exchange request. Compare outer grid geometry across switches; assert that normal tabs have no vertical overflow and their fields and actions are visible. Exercise English and Chinese at wide and compact desktop widths, smaller manually selected heights, retained values, range limits and keyboard reachability. Inspect the actual local terminal as well as the fixture, and retain mobile behavior when changing shared components.

## Verified reference coverage and mobile boundary

Hyperliquid's desktop panel stays 670px at 2016×1358 and 1545×900, and 677px at 1238×900 and 1001×900. Market, Limit, Stop Market, Stop Limit, Take Profit Market, Take Profit Limit, TWAP and Scale all fit without scrolling. Market/Limit with TP/SL and TWAP with advanced fields also fit. This validates reducing excessive field and footer spacing before relying on overflow.

Hyperliquid's mobile TWAP at 393×852 uses about 417px in its default state and 499px with advanced conditions. GATU's mobile split now uses the viewport-based size as a minimum and grows with natural form content. The book stretches alongside it and the account area follows below. Complete TWAP and Scale controls remain inline; do not move them into a drawer solely to satisfy the former fixed-height ceiling. Embedded forms have no internal vertical scrolling; short screens and keyboards use the surrounding page scroll. Preserve fees, margin requirements, execution conditions and touch target space.

## Local results

At 2016×1358 and 1001×900, all eight ordinary desktop tabs now have `scrollHeight === clientHeight`. Scale's footer decreased from 321px to 177px while retaining prices, order value, margin and fees. The chart, order book, account panels and persisted grid geometry remain stable when switching tabs. The price unit may be hidden visually in a narrow container, but the full accessible input label retains it.

The browser regression fixture uses the real header, fields, summaries and order-entry store, with mocked wallet/data boundaries only. It covers four desktop viewports, English/Chinese, TP/SL expansion, populated TWAP conditions, Scale ranges and keyboard limits, existing positions, retained inputs and smaller user-selected geometry. A separate test changes language while TWAP remains mounted so remounting cannot hide stale labels. Synthetic tall-content tests cover page-scroll recovery and natural height changes; real mobile controls additionally verify TWAP conditions and retained inputs. Desktop constrained-height tests retain their internal-overflow expectations.

At 393×852, the six ordinary mobile market/limit/trigger forms retain the 480px minimum; the complete TWAP form grows to 570px and Scale to 614px. All eight real forms have zero internal vertical overflow, with matching form/book bottom edges. Mobile TWAP reserves the natural wrapped height of both translated trigger directions while a trigger value is configured. Only the applicable direction is visible and exposed to assistive technology. Equality or an unavailable mark hides both hints without changing their space; clearing the configured trigger removes that space. Short screens use page scrolling for lower content.
