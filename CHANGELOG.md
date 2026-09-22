# Changelog

This project follows a lightweight Keep a Changelog style. Entries remain under
`Unreleased` until a release version is cut. This is a summary of repository
changes, not evidence that a build has been deployed or accepted on real devices.

## Unreleased

### Changed

- Market-order partial fills now retain their execution result when the `FrontendMarket`
  remainder is canceled during reconciliation. Ordinary TP/SL cancellations caused by the
  same partially filled parent no longer add a contradictory order-canceled error; abnormal
  cancellations and rejected children remain visible. Overflowing notification bodies now
  use a distinct accessible details label.

- Accepted Scale ladders now show successful submission even when only some levels fill
  immediately. Reconciled IOC remainders with matching partial-fill evidence retain their
  execution result without a misleading cancellation error. Execution averages follow the
  selected number separators, and only overflowing notification content adds a keyboard
  scroll stop. Partial-result notifications retain their three-second duration.

- Trading notifications now use concise result sentences and compact, wrapping layouts on
  desktop and mobile. Immediate order-entry fills show actual executed quantity and average price from
  the exchange response; request prices are no longer presented as execution prices. Partial
  fills, attached-order failures and uncertain outcomes remain distinct, with order-status-only
  confirmations omitting unknown execution values. Both layouts share the existing notification
  stack, account isolation and display durations.

- Trading notifications no longer create duplicate submission cards during development
  effect replay or leave stale progress behind after an asynchronous close. Each card
  follows its current task, and closing a notice cannot discard a result arriving in the
  same update. Existing account isolation, background reconciliation and durations remain.

- Trading feedback now shares one notification stack across application pages. Market Close,
  Close All, Limit Close, Reverse, TP/SL, margin updates, order edits and cancellations show an
  immediate task that updates as the request is confirmed. Close All lists each market's result;
  partial fills, uncertain outcomes, failures and cancellations hide after three seconds at the
  front of the stack, while submission and confirmation progress stays visible. Late confirmations clear
  outdated errors and remain tied to the account and network that started the request. Pending
  orders can restore their feedback after a reload without inventing missing trade details.
  Successful tasks get their display time when they reach the front of the stack, and mobile
  notifications stay above the bottom navigation. Funds recovery reminders share the stack while
  keeping their existing review panels; dismissing a trading notice does not cancel its request.

- Mobile Positions now has a `Close all` action beside its single expand/collapse toggle.
  It opens the same market-close confirmation as desktop for all perpetual positions in the
  account, including positions hidden by list filters. The confirmation lists each market,
  direction and quantity before submission. Unready data disables the entry, and a pending
  submission stays active through tab and desktop/mobile layout changes.

- Reduce Only now sizes percentages and Max from the current opposite position on desktop and
  mobile, including when opening availability is zero. Oversized or wrong-direction orders are
  blocked across ordinary, trigger, TWAP and Scale orders; Scale checks the combined size.
  Quote-unit selections preserve their exact base quantity through confirmation and submission,
  and Reduce Only displays no opening-margin requirement.
  Follow-up fixes preserve valid available balances while position data is unavailable,
  label the Reduce Only Max action accurately in both layouts, and restore the original
  price basis for ordinary mobile order margin estimates.

- The remaining trading dialogs no longer show progress in their buttons. TP/SL, Adjust Isolated
  Margin, Cancel All Orders, the phone's Modify Order sheet, Swap and Account type close as soon as
  you confirm, and the result arrives as a notification in the bottom-right corner: updated,
  blocked by another pending action, submitted and still being confirmed, or failed. Their buttons
  keep their names instead of turning into `Submitting...`, `Updating...`, `Canceling...`,
  `Modifying...`, `Waiting for confirmation...`, `Swapping...` or `Switching...`, and submit errors
  no longer appear inside these dialogs. In the open orders list `Cancel all`, `Cancel selected`,
  the row `Cancel` button and the TWAP `Terminate` button also keep their names while a request is
  pending, the desktop inline size and trigger editor collapses when you confirm, and a confirmed
  cancellation now shows `Order cancellation confirmed.` The Account type dialog can be closed
  while a wallet signature is still pending.
- Adjust leverage and Margin mode close as soon as you confirm. The button no longer spins or turns
  into `Updated to 10x` before closing by itself; a notification reports `Leverage updated to 10x`,
  `Margin mode updated` or the reason the update failed, and it always states the leverage that was
  actually applied. Both dialogs can be closed while a request is pending. The desktop order button
  no longer spins while an order is being sent.
- Transfer, Send, Deposit and Withdraw buttons keep their names while a request is pending instead
  of turning into `Transferring...`, `Sending...` or `Processing...`; with an external wallet they
  read `Confirm in wallet` while the signature is pending. These dialogs stay open until the request
  settles, then close, and the result arrives as a notification in the bottom-right corner:
  `Transfer confirmed`, `Sent 25 USDC`, `Withdrawal submitted` with the net amount and fees, or the
  reason it failed. A withdrawal whose status could not be confirmed stays on screen as a warning
  until you dismiss it. A failed Send keeps the destination and amount for the next time you open
  Send. A deposit that fails before it is broadcast returns to the form so you can retry.
- Referral dialogs (enter a code, create a code, claim rewards) close as soon as you confirm and
  report the result as a notification; a request whose status could not be confirmed stays on
  screen as a warning until you dismiss it.
- Vault deposits and withdrawals and staking operations still show their progress while the
  request is signed, submitted and verified, but a verified result now closes the dialog and
  arrives as a notification (a vault transfer lists the final amount, commission and closing cost),
  and a rejected request shows a notification and returns to the review step. A result that could
  not be verified stays in the dialog with `Verify again`, as before. The staking dialog no longer
  shows a disabled `Operation in progress` button, and its error explanations, which were rendering
  empty, are now shown and translated.
- The API wallet dialog keeps its buttons named `Sign and authorize` and `Confirm removal` while
  fresh data is checked, and no longer shows a `Processing…` placeholder button. The rest of that
  dialog is unchanged because it has to show the one-time key.
- The order confirmation (desktop dialog and phone sheet) now lists only the action, size, price and
  estimated liquidation price, with the action and size coloured by direction. Market, slippage,
  leverage, order value, margin and fee rows were removed; they remain in the order form summary.
  Rows that define an advanced order still appear when they apply: the order type (advanced types
  and limit orders that are not good-till-cancelled), trigger, scale and TWAP parameters, take
  profit / stop loss and reduce only. The dialog has a single action button (`Buy / Long` or
  `Sell / Short`; `Buy` or `Sell` on spot) and no Cancel button, because the close button already
  dismisses it, and its rows are spaced further apart.
- Amounts and transaction hashes in transfer, swap, deposit, withdrawal, vault and staking
  notifications keep their left-to-right order when the interface language is Arabic.
- After a USDC deposit is confirmed on Arbitrum the Deposit dialog closes. While Circle forwards it
  to Hyperliquid, a single notification with an explorer link shows the progress, keeps tracking
  after you close the dialog or reload the page, and turns into the result. Reopening Deposit while
  a transfer is still forwarding shows its status instead of the form, as before.
- Limit Close, Reverse Position and the order confirmation now behave like Market Close and Close
  All Positions. Their confirm buttons keep their names (`Place Limit Close`, `Buy / Long` or
  `Sell / Short`, the order side) instead of turning into `Validating...`, `Submitting...`,
  `Confirming...` or `Reversing...`. The dialog closes as soon as you confirm, the order is sent in the
  background and the outcome arrives as a notification in the bottom-right corner, including an
  order that is still being confirmed, one blocked by another pending order, and a failure. Submit
  errors and the `still being confirmed` notice no longer appear inside these dialogs.
- The Close All Positions confirmation works like Market Close. Its button always reads
  `Close All Positions`: the number of positions stays in the summary above it, and it no longer
  turns into `Validating positions...`, `Submitting close orders...`, `Confirming exchange status...`
  or `Partial result`. The dialog closes as soon as you confirm and the outcome arrives as a
  notification in the bottom-right corner: all filled, submitted and still being confirmed, partly
  accepted, blocked by another pending order, or failed. While that runs the `Close All Positions`
  entry in the positions table is disabled.
- The Market Close confirmation button always reads `Market Close`; the size being closed stays in
  the `Close size` field above it (and in the button's accessible description). The size shown when
  you click is now a ceiling: the close size is still recalculated from the latest position, and if
  that result is larger than what was shown, nothing is closed and a notice asks you to reopen
  Market Close and review the new size. Max and percentage closes follow a position that shrank; a
  typed size is sent as typed and is still rejected when the remaining position is smaller. While
  the dialog is open it says when the position size differs from when it was opened, and a line
  under the button states that the estimated PnL excludes fees.
- A slider drag is no longer thrown away when balance or position data briefly goes stale or reloads
  in the middle of it, for example around a reconnect. The drag pauses: nothing is applied while
  the data is unreadable, the held value is applied as soon as it is readable again, and releasing
  while it is still unreadable cancels. This covers the desktop and mobile order forms, Market
  Close and Limit Close. Closing a dialog, submitting, disconnecting or a changed market still
  cancel the drag at once.
- Size, percentage and order value now follow a slider continuously on 120Hz and faster displays.
  Previews used to wait for a 15 ms pause in pointer movement, which never came during a smooth drag
  on those displays, so the numbers froze until release. They are now published at most once every
  15 ms while the pointer keeps moving.
- A slider grabbed while its dialog was still opening no longer snaps back to where it started. The
  dialog's 200 ms scale animation made the slider believe it had been resized and cancel the drag.
- The Market Close and Limit Close dialogs no longer show the `25% / 50% / 75% / Max` quick buttons. The
  slider already marks those stops, the percentage field accepts any value, and dragging or typing
  `100` still selects Max. This matches the order form, which dropped its quick percentage buttons
  earlier.
- Submit buttons no longer grey out while a slider is being dragged. This applies to the desktop and
  mobile order forms, Market Close, Limit Close, TP/SL, and the leverage and margin mode dialogs.
  Dragging no longer affects whether a button looks enabled; everything else that disables it (no
  size, too large, missing price, unavailable data, a request in flight) is unchanged, and a
  confirm that lands in the middle of a drag is still ignored.
- `/build-meta.json` also reports which gated deposit paths the build exposes (`cctpDeposits`). The
  CloudFront release refuses to upload a build that exposes sponsored Mainnet deposits or Mobile
  Agent pairing unless the operator acknowledges it with `--allow-sponsored-mainnet-deposits` or
  `--allow-mobile-pairing`, and `verify` compares those gates between the live site and the build.
- The margin mode, leverage and account mode dialogs of the order form load when first needed instead of with the
  terminal. If one cannot be loaded, the order form stays as it is and the dialog offers `Try again` and
  `Reload page`; the page never reloads on its own.
- Linking a phone no longer uses a server ticket. The desktop creates the QR entirely in the
  browser, the QR stays visible for 60 seconds after reveal and phones accept it for 2 minutes after
  it was created (previously 10). A phone refuses a QR it already imported without disturbing the
  access it already holds, refuses a QR whose time is ahead of the phone, QR codes created by an
  older page are rejected with a prompt to refresh both devices, and the success panel reminds the user
  to revoke from desktop if they did not import it themselves. A second phone scanning the same
  code within those 2 minutes is no longer rejected. `/mobile-agent-sync-ticket` is removed and
  answers 404.
- Every desktop navigation control (Deposit, More, language, display menu, account chip, `Connect`
  and reconnect) is 36px tall, and the header account chip, `Connect` button and reconnect button
  share that height on mobile; mobile keeps a 44px touch area through a pseudo element, drops the chip shadow and shows
  the email local part in the chip with the full address as its tooltip.
- The mobile header drops its theme toggle (the navigation drawer keeps it), shows a brand-filled
  `Connect` button that no longer truncates at 390px, and gives the language and settings icons
  one radius and token set; the desktop `Connect Wallet` button uses the same brand fill.
- The expanded mobile market bar no longer draws a divider between its two detail rows, and the
  spot `More Info` cell keeps the full shortened token address on one row with its explorer, copy
  and social actions beside it instead of clipping the address and wrapping the actions below.
- The mobile order book header is a single 36px chip row: price grouping on the left, the
  spread in the middle and a display-unit dropdown on the right; the separate spread row is gone
  and the ladder headings read `Total (unit)`, so the ladder starts about 47px higher.
- Mobile account tabs share one 36px toolbar row and one filter-chip style (27px, 7px radius,
  auto width, placeholder labels such as Type / Direction / Role / Status), the tab row is 40px
  with a 44px touch area, and the TWAP sub-view row matches the toolbar height.
- The mobile Account tab now shows the zero-value overview with inert Deposit / Withdraw while
  disconnected, and every mobile account tab (positions, balances, orders, TWAP and history)
  keeps its filter toolbar inert above an empty list, matching the desktop disconnected
  presentation; the Connect prompt stays with the header and order entry.
- Confirming a market close now closes the dialog immediately and runs the order in the
  background; the outcome arrives as a notification (an unconfirmed fill warns first and the shared
  reconciliation reports the final result), failures release the session so the
  position can be retried at once, and unconfirmed fills are reported by the shared order
  reconciliation notifications instead of reopening the dialog (ADR 0014).
- Tappable mobile surfaces (position, order and history cards, market rows, the trade summary
  and size-unit toggles) now show press feedback on touch screens.
- Desktop navigation keeps Vaults, Staking, Referrals and Leaderboard visible for disconnected
  visitors down to 1101px, moves the Earn placeholder into More at compact widths, and drives the
  More menu from one navigation configuration.
- Link mobile device gains a header QR icon beside settings and a matching compact utilities
  menu entry; both share the user-menu modal instance and appear only for an exact-owner session
  with the create-and-reveal flag enabled (ADR 0015).
- The Link mobile device modal approves in one step: opening runs read-only checks, the single
  `Approve mobile trading key` button signs, and the pending label reads
  `Approve QR code with wallet...`.
- The pre-approval panel merges the create and review points, lists what the key can and cannot
  do, and adds phone instructions (open gatu on the phone, tap Connect, then Link Desktop
  Wallet); the screen-sharing warning now appears before `Hold to reveal QR`.
- `Hold to reveal QR` draws its progress as a ring inside the button, and the revealed panel
  shows a visible seconds countdown to auto-close derived from the envelope expiry and the
  60-second reveal window.
- On a phone using a desktop-authorised trading key, Deposit, Withdraw and Transfer stay visible
  but disabled with one reason that the master wallet must be connected on desktop.
- The Link Desktop scanner selects the back camera after the stream starts and tells the user to
  tap the QR icon in the desktop header; importing stores the key in this phone's local scope and
  says so, together with the expiry date and the desktop revoke path.

### Fixed

- On phones the Market Close and Limit Close sheets have a close button again. Since the redesign
  they could only be left by swiping down, tapping outside or pressing Esc, and the only button on
  the sheet was the confirm button. The close button takes the place of the `Price: Market` and
  `Limit` labels in the sheet header, which repeated the title.
- On the desktop order form the size slider no longer jumps up or down while it is being dragged.
  The size message under the quantity field (`Min order $10`, `Enter size`, `Exceeds max size`)
  used to appear or disappear in the middle of a drag and move the slider row by 24px. A message
  that was not showing when the drag began now waits until the slider is released, and one that
  was showing keeps its line, at the same height, until then. Whether the order can be submitted is unchanged.
- Dragging a size or leverage slider no longer snaps back to where it started. In an embedded
  browser a real mouse could report that the slider lost the pointer a few milliseconds before the
  button was released, and the slider treated that as a cancelled drag, so most drags were thrown
  away. Losing the pointer is no longer a cancellation: the drag keeps following and the release
  applies the value as usual. The slider also records why its last drag ended, to make any further
  report of a jump answerable from the page.
- In the dark terminal, dropdown menus, tooltips, toasts and the desktop market selector use a raised
  surface in the terminal's own hue (`#212d33`) instead of the shared purple-grey default, and the
  scrim behind an open dialog no longer tints the page navy. The new surface has the same luminance
  as the old one, so text contrast is unchanged. The disabled `Reset` entry of the language menu is
  legible in dark mode (60% white instead of 12%).
- The header `More`, account and language menus, the display menu and the order-type menus share
  one look: 12px corners, 4px padding, 34px entries with 8px corners in IBM Plex Sans, and 44px
  entries on phones. Previously the corner radius was 10 or 12px, entries were 34 or 36px tall and
  the order-type menus opened in Inter under an IBM Plex Sans trigger. The language menu now uses
  the standard menu shadow and open animation, and its disabled `Reset` entry is legible in light
  mode as well.
- Every desktop dialog has 16px corners and a 1px edge. Settings, leverage, margin mode, account
  mode, wallet, connection and asset-information dialogs previously had 6 or 8px corners, and most
  dialogs had no edge at all, so in the dark theme they blended into the page. Phone sheets without
  their own design default to 16px top corners instead of 6px.
- Hovering the header `Connect Wallet` button changes only its fill. It used to fade the whole
  button to 90% as well, which in the dark theme cancelled the brighter hover fill (the button got
  slightly dimmer instead) and snapped instead of animating; the press scale now animates too. The
  order form's `Connect Wallet` button now brightens on hover in the dark theme, where its hover
  fill used to equal its resting fill.
- Linking a phone no longer refuses an account whose whole balance sits on a builder dex: the
  desktop check reads every perp dex before it reports `No balance on Hyperliquid`. When a balance
  cannot be read, or Hyperliquid answers with an incomplete snapshot, the dialog says the account
  could not be checked, that nothing was signed, and offers `Retry check` instead of that message
  or a raw network error.
- The pairing page is served with `no-store` and `no-referrer` on the CloudFront host, as it was on
  the previous host (takes effect with the next release of the edge functions).
- A scanned pairing link leaves the address bar as soon as the page starts loading instead of after
  the application code has downloaded, including links whose path uses different letter case. The
  pairing page always loads from the network rather than from the offline shell cache. When a link
  cannot be removed from the address bar, the page now explains what to do in the user's language
  instead of staying blank.
- Modals and drawers now animate in even when a store change mounts them already open, and
  store-driven global modals, the order confirmation, reverse and close-all dialogs stay mounted
  for their exit transition instead of vanishing; the position, order-confirmation and cancel-all
  dialogs no longer suppress those transitions.
- The lazy global modal chunks warm during idle time after the terminal settles, so the first
  Market Close, settings, swap, transfer, send or command-menu open no longer shows the
  shared loading spinner.
- The mobile Markets view stays mounted after its first visit, so switching to Trade or
  Account and back reuses the existing TradingView chart instead of rebuilding it.
- Visitors without a stored Privy session now see `Connect Wallet` on the first rendered frame
  instead of a brief `Connecting...`, dashboard pages resolve the account menu before revealing,
  compact headers keep ENS names, the utilities menu has its own accessible name, and connected
  headers no longer show duplicate theme, language and settings controls while the market loads.
- The terminal no longer stays blank when the persisted locale and the startup fonts become
  usable between its first render and its readiness effect, which reliably happened in
  development builds where React runs effects twice.

### Known

- Mobile pairing stays compiled out in production: both `VITE_MOBILE_PAIRING_*` flags remain off
  until the physical-device acceptance for the client-only transfer (ADR 0015 D7, option B) has
  been run.

### Changed

- Refreshing the trading terminal now reveals the page as soon as its first-render pieces
  have loaded instead of about 300 ms later, on warm and cold loads alike.
- Desktop widths from 1001px to 1420px now stack the trading panel above the order book and
  account information in a wider right column, with the account table beneath the chart column,
  matching the reference terminal. Saved desktop layouts for that breakpoint reset to the new
  default; wider layouts are kept.
- Removed startup skeletons: refresh now waits for the persisted locale, then shows real chrome and market content without route or language flashes.
- The market header metric row now appears once with the first market snapshot instead of
  reflowing from dashes to values, on refresh and on market switches.
- Webfonts are now declared with `font-display: block`, and startup waits (bounded) for the
  preloaded Inter and IBM Plex faces, so navigation, market names, badges and the market
  metrics no longer shrink when the fonts arrive.

- Dashboard startup now shares each page’s frame, responsive navigation and fixed
  desktop footer, preserving route-specific canvas colors, widths and padding.

- Mobile startup placeholders now share the six real mobile surfaces and terminal
  frame, including route labels, persisted tabs and the disconnected order controls.

- Desktop account startup placeholders now share the real tab header and disconnected
  overview, including five formatted zero values and locale-aware runtime tabs.

- Desktop order-entry startup placeholders now share the real panel header, default
  field frames, action button and summary chrome, keeping their geometry stable as
  the trading interface becomes ready.

- Desktop order-book startup chrome now shares the real column headers, side
  containers, grouping trigger and spread row, with matching tab-strip geometry.

- Desktop startup placeholders now share the real top navigation, footer and outer
  frame, including compact navigation, hidden Soon labels, footer dividers and an
  invisible clock slot. The anonymous Connect Wallet button now has the same
  144px minimum width as its connecting and loading states.

- Desktop market headers and favorites now share their real display components with
  startup placeholders. Unknown placeholder text now reserves typical value widths
  invisibly, while runtime placeholders show known route names and market kinds
  and select the matching favorite. Market statistics use title-case labels and content-sized
  columns with 32px gaps to fit all six perpetual metrics at 1440px; horizontal
  scrolling remains available at narrower widths. Mobile details use the same labels.

### Performance

- Warm terminal visits save the query cache synchronously after restore when the page
  hides or leaves, and can seed a complete market catalog up to seven days old while
  normal freshness checks refetch it. The general client cache still expires after 24 hours.
- Service Worker v9 serves a shared application shell and separately cached document
  pages immediately while refreshing them in the background. Referral and server routes
  bypass this cache; the first navigation after a release may use the previous shell.
- Navigation refreshes clone cacheable HTML before awaiting cache storage, so a page
  consuming its first network response cannot prevent the shell from being saved.
- Mobile startup defers the retained Markets view with React Activity while Trade
  renders synchronously. Adaptive modals share a media query for their 768px breakpoint,
  avoiding viewport-width layout reads even when closed.

### Added

- Email wallet export in the account menu and Settings, with exact-owner checks;
  compact layouts retain email identity, and Send identifies the Hyperliquid network.

- Cumulative order-book depth tooltips for mouse, keyboard and touch selection,
  preserving ordinary click-to-fill and touch scrolling. See
  [order-book interaction behavior](docs/orderbook-hover.md).
- A shared Animate Orderbook preference for new-level pulses and quantity-change
  feedback across desktop and mobile. System reduced-motion settings take
  precedence. See [animation behavior](docs/orderbook-new-level-animation.md).

- The production build now also prerenders a client-rendered application shell
  (`_shell.html`) and static HTML for the document routes, and
  `pnpm --filter @gatu/terminal serve:spa` serves the client output like a CDN.
  The Nitro server remains the deployed shape; static hosting still requires a
  host that routes `/api/*` to the server handlers. See
  [ADR 0005](docs/adr/0005-spa-static-shell.md).
- Geo checks call `/api/geo` and `/api/referral-geo` and client error reports
  post to `/api/client-error-report` instead of TanStack server functions, so
  the same handlers can run on an edge runtime. `/build-meta.json` is also
  written as a static file at build time. `serve:spa --api <origin>` proxies
  the server-only paths for local end-to-end checks.
- Runtime server rendering is off: the production server answers navigations
  from the prerendered shell and document pages, keeps the route-rule security
  headers, answers `/_serverFn/*` with 404, answers wrong-method or unknown
  server paths with 405/404 instead of a page, and keeps
  `POST /client-error-report` as a temporary alias. Deployment health checks now also probe `/api/geo`
  with the production IPdata key. See [ADR 0005](docs/adr/0005-spa-static-shell.md).
- The same API handlers can run on an AWS Lambda function URL behind CloudFront
  (`pnpm --filter @gatu/terminal build:lambda`), and `deploy/cloudfront/` holds the
  CloudFront Functions, header policies, distribution generator and static deployment
  script for the S3 + Lambda target that retires the EC2 server. Browser `POST`
  requests to the same-origin API now carry `x-amz-content-sha256`, which CloudFront's
  signed Lambda origin requires. The first CloudFront releases ran on the
  `*.cloudfront.net` domains; since 2026-09-15 `app.gatu.ai` and `testnet.gatu.ai` point at
  the distributions (`deploy.mjs aliases` attaches the hostnames and the ACM certificate),
  with the EC2 server kept for one release cycle as the rollback. The edge now serves the shell and
  document pages from cache for a minute with background refresh, and TradingView's
  content-hashed bundles are immutable instead of revalidated on every chart load.
  The build writes the trade startup chunks into the shell as `modulepreload` links,
  the bootstrap entry prefetches `/api/geo` before the wallet runtime loads, and the
  Lambda answers `GET /api/health` for a five-minute keep-warm schedule. The shell also
  preloads the TradingView loader on desktop widths and hands surface-specific startup chunks
  and the chart iframe's main bundles to the bootstrap entry, so phones no longer download
  desktop panels or chart bundles up front; the loader is cached as immutable behind its
  commit query. Dashboard routes now hydrate against the prerendered terminal skeleton
  instead of discarding it (no more recoverable-error reports per dashboard navigation),
  the bootstrap entry stays dependency-free until the mobile credential scrub, and the
  leaderboard API is cached at the edge with a 30 s function timeout so the first load no
  longer times out.

- Repository cleanup: removed eleven modules nothing imported (three wallet icons, the
  superseded leverage control, four unused UI hooks, the close-toast helper, the
  `order-entry-calcs` re-export barrel and the unused hl-react test provider), the root
  `vercel.json` left over from the terminal's Vercel period, and moved the mobile wallet
  PWA scratch notes under `research/`. `pnpm check` is clean again (compiled Lingui
  catalogs are ignored, `createLazyComponent` no longer uses `any`) and now runs in CI.

- A stricter candidate Content-Security-Policy (image sources limited to known hosts, no
  `blob:` scripts) can be sent in report-only mode by the edge, with violations logged by a
  dedicated report receiver Lambda; the edge sends the header whenever
  `deploy/cloudfront/edge-config.json` names the receiver URL. See ADR 0007.
- The report-only policy names the prerendered pages' inline scripts by `sha256` hash instead
  of `'unsafe-inline'`: the build lists the hashes, the release writes the current and previous
  sets into the CloudFront Function, `deploy.mjs sync` refuses to upload pages the live policy
  does not allow, and `verify` checks every page against the live header. The edge enforces the
  hashed `script-src` (no `'unsafe-inline'`, no `blob:`, violations reported) and the narrowed
  `img-src` (known hosts only) since the same day; `cspScriptHashes` and `cspImageSources` in
  the edge config switch either back to report-only, and the report-only header is omitted while
  it would repeat the enforced policy. See ADR 0007 and
  [the inline script hash plan](docs/csp-inline-script-hashes-plan.md).

### Changed

- Pull requests target `dev`, and only `dev` is promoted into `main`. Pull request checks use
  about half the GitHub Actions minutes and finish sooner
  ([ADR 0016](docs/adr/0016-dev-first-pull-requests-and-ci-tiers.md)): a newer push cancels the
  superseded run of the same pull request; the unit and release-tooling tests moved out of the
  build matrix into `Terminal Tests`, which runs them once instead of four times; type check, Biome
  and the translation catalog check share one `Static Checks` job; the website and brand job runs
  only when its inputs change; browser regressions run as two parallel shards. Pull requests
  build the terminal once with both pairing switches off, and the other three switch combinations
  build for pull requests into `main`, for `v[0-9]*` or `cloudfront-[0-9]*` tags, and on a manual run of
  `Production Builds`.
- All-market statistics now arrive on the public WebSocket's compact `pac`/`sac` channels (one
  compressed frame each, about a sixth of the bytes of `allDexsAssetCtxs`/`spotAssetCtxs`) whenever
  the browser can inflate them; a stream that cannot be decoded falls back to the plain channels for
  the session and reports once. Spot contexts are matched by market name.
- The order book no longer waits for a new WebSocket connection and a subscribe round trip after
  the terminal renders: trade routes open the pooled full-book stream for the URL market while the
  market catalog loads, and the panel that subscribes next receives the freshest snapshot at once.
- The first real terminal render no longer waits on React's Suspense fallback throttle: the
  client runtime gate switches synchronously once the wallet runtime module has loaded, and the
  trade entry routes resolve every lazy piece of the first render (user menu, panels, chart,
  default positions tab, footer, overlays) while the market catalog loads. The market-loading
  workspace draws the same frame as the shell instead of empty panels.
- The prerendered application shell now draws the terminal's real frame (navigation,
  market header, order book and order-entry chrome, account tabs, footer) with `-`
  placeholders instead of an empty grid, so the first paint already looks like the terminal
  while the runtime loads. Labels are English until the localized page replaces the frame.
- The header shows `Connect Wallet` immediately for visitors without a stored Privy session;
  `Connecting...` now appears only when a session is being restored or recovery is due.

- Desktop panels retain aligned chart, market-data, order-entry and account
  boundaries during resizing. Mobile order-entry and its adjacent book grow with
  the form, with the page owning vertical scrolling. See
  [layout behavior](docs/desktop-grid-layout.md).
- Desktop and mobile order forms share draft fields and summaries. TWAP puts
  quantity before duration and groups optional trigger and price controls behind
  Advanced Settings. See [order-form parity](docs/order-entry-surface-parity.md).
- Mobile market selection has larger touch targets and bounded market names;
  long Trade and Markets data lists use page-level scrolling where appropriate.
- Headline prices use the current asset context's midpoint, falling back to its
  mark price when the midpoint is absent. The compact book uses the server
  midpoint without that fallback. See [price-source reference](docs/price-source-audit.md).
- Account summaries use consistent mode names and metric scope across desktop
  and mobile, including eligible collateral and server LTV in portfolio leverage.
  Funding forms share exact-amount handling and clearer requested-action
  feedback. See [account overview](docs/account-overview.md),
  [deposits](docs/cctp-deposits.md) and [withdrawals](docs/withdrawals.md).
- The repository, documentation, root package and the API-skill installer now
  use the `gatu` name; the installer bin is `gatu-install-hyperliquid-api-skill`.
  An orphaned `hypeterminal:recent-wallets` browser-storage entry is removed on
  startup.

### Fixed

- The mobile startup placeholder now mirrors the real mobile terminal: the same
  header controls, market bar, trade/book split, order-form frame, book chrome,
  positions tab row and bottom nav, drawn from class constants the real
  components also consume (`mobile-chrome-classes.ts`), so nothing moves when
  the terminal mounts. It highlights Positions and Trade by default and stays
  neutral for state it cannot know (side, market, values); the runtime loading
  placeholder additionally uses the active locale and the saved tab selections.

- The TradingView loader is served under a content-hashed file name
  (`charting_library.<hash>.js`) that the build emits and the shell preloads. The previous
  immutable `?v=<commit>` object could pin a stale library body for a year, because the edge
  cache key ignores the query string; the plain `charting_library.js` revalidates again.
- The Portfolio summary shows a dash for Max Drawdown again instead of a fabricated `0.00%`; the
  metric stays intentionally unavailable until a cash-flow-adjusted series exists.
- A wallet runtime chunk that failed to load after hydration left the static shell on screen
  forever, because the runtime gate's store snapshot did not change on failure; the loader now
  publishes every outcome as a new snapshot so the error boundary receives the failure.
- The order book's replayed first snapshot keeps its original receipt time and ignores frames of
  other coins sharing the same transport, so a replay never counts as newer than it is and cannot
  be poisoned by another market; the subscription confirmation no longer resets that time to the
  present, and the stale flag is computed when the data is committed.
- The CloudFront release keeps every inline-script hash the edge still serves:
  `deploy.mjs functions --origin <origin>` reads the live pages and retains their hashes next to
  the new build's set, so an upload that failed between two releases can no longer leave a served
  page blocked by the enforced Content-Security-Policy. `reupload` rewrites object metadata as an
  in-bucket copy instead of uploading the local body, so it cannot publish an unguarded shell.
- The CSP report receiver keeps only the origin and path of reported URLs (query strings,
  credentials and referral codes are dropped, `/join/<code>` collapses to `/join/*`), accepts at
  most ten reports per request, and meters its per-minute budget by reports instead of requests.
- The leaderboard API waits for a stale refresh inside a Lambda invocation instead of starting a
  background refresh the runtime may freeze, falling back to the stale snapshot when the refresh
  fails; the edge's stale-while-revalidate keeps responses fast.
- The shell preload injector is idempotent (a second run reproduces the same shell), the static
  startup budget closure includes the `preload-trade-terminal-surface` chunk so the shell preloads
  it, and dashboard routes no longer prefetch the desktop trade panels and chart bundles.
- The compact market-context streams are decoded as a complete snapshot followed by changed-field
  deltas that merge into one accumulated view (the first release treated every frame as complete),
  validate every consumed field, decode strictly in order with a bounded backlog, stop decoding once
  unsubscribed, reject a frame that fails before the server confirmation, reset on a transport
  disconnect so every reconnect must deliver a complete snapshot, treat any malformed delta entry as
  a format change that triggers the fallback, and keep that fallback to the plain channels for the
  whole page session; the runtime market-loading frame renders its labels through Lingui.

- The TradingView chart no longer inserts Google Analytics on the 2% of loads the vendored
  library samples: its internal feature flag `14851` is disabled in `CHART_DISABLED_FEATURES`
  (the chart Content-Security-Policy already blocked the loader). See
  [runtime guardrails §4](docs/runtime-guardrails.md).
- Zod's JIT parser is disabled before any schema exists: application and `hl-react` modules
  import Zod through `src/lib/zod.ts` and `packages/hl-react/src/zod.ts`, which switch it off
  first. Building the first object schema no longer probes `new Function`, which the edge
  Content-Security-Policy blocked and reported as an `eval` violation on every page even though
  Zod fell back to its ordinary parser.

- Reduced repeated order-queue render code so deployment builds retain more
  room under the existing trading-page bundle budget, preserving status badges,
  warning priority and individual order feedback. See
  [performance acceptance criteria](docs/terminal-performance-baseline.md#order-queue-rendering-and-deployment-headroom).
- Loading, stale and recovering data retain quiet placeholders. Empty-account
  conclusions require complete, current snapshots, while action availability
  remains independently guarded. See [mobile data presentation](docs/mobile-data-presentation.md).
- Order-book rows remain complete at changing heights; grouped and fast/full
  feeds cannot contaminate one another, and stale or cached rows cannot fill an
  order. Compact books use the incremental feed with the public fast-feed fallback.
  See [layout rules](docs/orderbook-layout.md) and
  [transport remediation](docs/terminal-review-remediation.md).
- Late order results and session changes cannot erase newer drafts. Manually
  cleared limit prices stay empty until an explicit action rearms prefill, and
  slider commits use the actual quantity. See [draft lifecycle](docs/order-draft-lifecycle.md)
  and [slider interactions](docs/slider-interactions.md).
- Email trading uses the exact active embedded owner wallet; ordinary email
  trading no longer requires local Agent registration. Legal acceptance, signer
  readiness, funding and builder-fee approval remain separate gates. See
  [email signing](docs/email-trading-signing.md) and [onboarding](docs/trading-onboarding.md).
- Locale changes update mounted presentations, and document navigation preserves
  application providers. Root stylesheet placement remains stable during hydration.
  See [translation behavior](docs/i18n-presentation.md).
- Browser fixtures use separate dependency caches, and development modules
  revalidate after graph changes. Wallet testing can open the system browser via
  `pnpm dev:browser --port 3006`. See [local development](docs/tutorials/local-development.md).
- Mobile pairing rejects ticket re-registration and protects release switches
  with verified edge gating. Standard deployment and optional strict promotion
  have distinct evidence requirements. (Superseded: the server ticket and that
  EC2 release procedure were later removed; see the client-only pairing
  transfer entries above.)

### Notes

- The price-source entry above supersedes the earlier Unreleased claim that the
  ticker and book midpoint share default `l2Book` data. Grouped ladder prices are
  not the headline-price source; lifting grouping state into the ticker is no
  longer the proposed follow-up.
- SSR starts with the default English catalog and `lang`/`dir`; the browser
  restores the persisted locale. Server-rendered locale parity still requires a
  server-readable locale source.
- Pairing flags remain off when unset. Automated protocol and release checks do
  not establish real-device camera, PWA or wallet approval success; those results
  belong in the [device validation record](docs/mobile-phone-access-device-validation.md).
