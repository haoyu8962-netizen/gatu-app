# Changelog

This project follows a lightweight Keep a Changelog style. Entries remain under
`Unreleased` until a release version is cut. This is a summary of repository
changes, not evidence that a build has been deployed or accepted on real devices.

## Unreleased

### Added

- Earn is live. The new `/earn` page lists Hyperliquid's borrow and lend reserves with their LTV,
  APY, oracle price and totals, your supplied and borrowed amounts, interest and liquidation
  prices, plus your health factor, and lets you supply, withdraw, borrow and repay. Max follows the
  official terminal's rules; for supplies and borrows the amount you see is the most that is sent,
  withdraw-all and repay-all with Max close the whole position including interest accrued until it
  executes, amounts that would leave less than $1 supplied are blocked with an explanation, and the
  request stops if your balances changed before it was submitted. Portfolio Margin accounts see the
  automatic-mode explanation with manual actions disabled. Earn is now a regular navigation entry on desktop and
  in the mobile menu; between 1101px and 1150px the lower navigation entries move into More so
  French labels still fit.
- A Funding view next to the desktop chart and a fourth Funding tab in the mobile Markets view
  show a perpetual or HIP-3 market's funding rate history with its cumulative rate, over 1h
  buckets for 7 days, 8h buckets for 30 days (default) or daily buckets for 90 days. It loads
  only when first opened, keeps TradingView mounted while it is shown, and spot markets show only
  Chart. See [market funding history](docs/market-funding-history.md).
- A Funding Comparison page (`/fundingComparison`, in the desktop More menu and the mobile drawer)
  compares the predicted funding of Hyperliquid main perpetual markets with Binance and Bybit for
  an hourly, 8-hour, daily, weekly or yearly period, with each venue's difference to Hyperliquid.
  See [funding comparison](docs/funding-comparison.md).
- When the exchange reports a perpetual or HIP-3 market at its open-interest cap, Limit, Stop
  Limit and Take Profit Limit orders are disabled with an explanation on desktop and mobile, and
  the submission guard checks it again; market, trigger-market, TWAP and Scale orders stay
  available. HIP-3 asset information shows the market's open-interest cap. No reachable market is
  capped today, so this has only test evidence. See [open-interest cap](docs/open-interest-cap.md)
  and [ADR 0023](docs/adr/0023-open-interest-cap-advisory-check.md).
- Manage TP/SL warns when the position is large enough that a market TP/SL may slip heavily,
  using Hyperliquid's maximum market order value for the position's current leverage; submission
  is unchanged. See [TP/SL slippage warning](docs/position-tpsl-slippage-warning.md).
- TWAP Fill History can be exported as CSV on desktop and mobile. The export pages the complete
  TWAP slice fill history rather than the 2,000 fills shown in the table, keeps the latest 10,000
  with a warning when that limit is reached, and paces its requests; the trade history export
  still excludes TWAP fills. See the Export section of
  [TWAP regression tests](docs/twap-regression-tests.md).
- The leverage dialog on desktop and mobile shows the maximum position size allowed at the
  selected leverage for markets with more than one margin tier (for example BTC above 20x:
  $150,000,000). See [leverage position limit](docs/leverage-position-limit.md).

### Changed

- The product is now Sairn. The terminal and the website show the Sairn name, the logo kit v1.3
  (lockup, mark and its two-colour signal and choice panels), new favicons, PWA and Apple touch
  icons, the Sairn logo in the Privy login window and on the position PNL share image, and new link preview
  images for the terminal and the website. The page title, the startup announcement,
  the installed app name and every translated message use the new name, and the legal documents
  name Sairn Corp. The chart's first load shows the Sairn page-loading motion (the two panels
  breathe in turn; a static mark when reduced motion is on). Links, brand text and focus rings use
  the Sairn accent (teal in the light theme, mint in the dark theme) instead of lime; primary buttons
  stay neutral and waiting spinners are grey. The desktop logo is now 24px high, so
  the header has 9px less room before its navigation collapses; see
  [brand assets](docs/brand-assets.md).
- Notifications, funds and signing status screens and wallet handshake buttons use the Sairn
  motion kit instead of spinning icons: order notifications show a glyph for submitting,
  confirming, unconfirmed, partially filled (only for a verified partial fill; a batch that was
  only partly accepted, or that has rejected, cancelled or unknown orders, shows a warning),
  filled or accepted, cancelled and failed; standard notifications show success, info, warning,
  error and pending glyphs; results whose status is unknown always show the amber unknown glyph,
  never an error, and waiting indicators are never green. Deposit, Vault, API wallet and bridge
  status screens show the kit's illustrations, 64px while waiting for the wallet, submitting or
  awaiting the result and 48px or larger for success, error, unknown and cancelled results;
  buttons waiting for a wallet show the breathing two-panel indicator in the button's own colour,
  and 16px copy buttons draw a check. Passive loading, lazy dialog placeholders, refresh buttons and chart
  recovery keep the neutral spinner. Reduced motion shows every glyph in its final state. The
  partial, info and warning glyphs are drawn by the kit's own engine pending the designer's
  confirmation; see [brand assets](docs/brand-assets.md) and
  [ADR 0029](docs/adr/0029-brand-status-motion.md).
- The mobile order button now matches desktop: while an order is being sent it keeps its Buy or
  Sell name and shows no indicator, because the order's status appears in the notifications. Only
  the Enable Trading wallet signature shows progress, with the Sairn button indicator instead of
  the spinning icon it showed in both cases before.
- The canonical domain is now `sairn.ai` (`app.sairn.ai`, `testnet.sairn.ai`, `support@sairn.ai`).
  When the domain switches, `gatu.ai` goes offline without a redirect, and settings, sign-in and saved
  trading keys from `gatu.ai` do not carry over. Browser storage keys, the Hyperliquid Agent slot,
  internal headers, build variables and package names now use `sairn`, so external wallets must
  approve a new Agent once. Email sign-in moves to a new Privy app, so an email account gets a new
  embedded wallet address; move funds from the old address before the switch. See
  [ADR 0032](docs/adr/0032-gatu-offline-cutover-to-sairn.md) and the
  [cutover plan](docs/sairn-domain-cutover-plan.md).
- Notices on the Staking page and in the Staking, Referral, API wallet and Vault dialogs are rounded
  8px like the other notices; they were 4px to 10px.

- Dashboard pages share one set of corners. Page panels are rounded 12px and carry the same soft
  shadow, and the cards, sections and notices inside them are rounded 8px, including the position,
  order and history cards Portfolio shows on phones (the Trade page keeps its own cards). Before,
  Portfolio, Staking, Vaults and the history pages used 6px panels, Referrals and API Wallet 16px,
  Portfolio, Earn and Staking had no shadow, and cards used anything from 2px to 14px.

- When a transfer or send may have gone through but its result could not be confirmed, for example
  after a timeout or a lost connection, the notification now stays on screen as a warning, "Transfer
  status unknown" or "Send status unknown", and asks you to check your balances and the Deposits &
  Withdrawals history before retrying. It used to look like a failure and disappear after three
  seconds. A send whose result is unknown no longer refills the recipient and amount the next time
  you open Send, so it cannot be repeated with one tap.

- The notification after a withdrawal is submitted is shorter: under `Withdrawal submitted` it now
  says only how much you'll receive on Arbitrum after confirmation, for example "You'll receive
  $239.80 on Arbitrum after confirmation." The route fee is no longer repeated there, since the form
  showed it before you confirmed; a one-time account activation fee still appears when it was
  charged. The Chinese text no longer calls the pending amount "实际到账" or mixes 提现 and 提款.

- The terminal no longer cancels a withdrawal because Circle's forwarding fee changed after you
  pressed Withdraw. The withdrawal uses the fee read when you press Withdraw, and the `Withdrawal
  submitted` notification estimates the amount you'll receive from that fee. It still stops and
  keeps the form open if the fee cannot be read or your amount is below the minimum at that fee.
  See [withdrawals](docs/withdrawals.md#cctp-route).

- Trading notifications are more accurate and repeat less:
  - When a Position TP/SL update cannot be confirmed, the notification says "TP/SL may have
    changed. Review this position's TP/SL before retrying." It no longer claims an order was
    submitted and tells you not to retry, which could be false after the old TP/SL were canceled.
  - When an accepted order is canceled afterward, the notification says so in one sentence
    instead of joining "Canceled" to a second sentence.
  - Terminate TWAP notifications say "termination" throughout, matching the Terminate button.
  - Margin mode and account type changes state what was applied, such as "Switched to Isolated
    margin at 7x" or "Switched to Unified account".
  - A generic reason that only repeats "Failed" (such as "Order failed" or "Failed to close
    position") is no longer shown under a failed notification; specific reasons still are.
  - Successful cancel, modify, isolated margin and TP/SL updates end with "Canceled", "Modified"
    or "Updated" instead of restating the action, and the confirming step uses the standard
    "Confirming — do not resubmit" line.
  - An unconfirmed result that already has a line explaining what to review is summarized as
    "Unconfirmed" instead of repeating the advice.
  - A partial fill of a single position (Market Close, Reverse, Swap) says "Partially filled" and
    "Review positions" instead of "Partially completed" and "Fully filled 0/1".
  - A Swap's market line shows the pair name, such as HYPE/USDC, instead of an internal id such as
    @107. Filled close, reverse and swap results say "Filled" instead of "Order filled".
  - In Chinese, order results use 委托 like the Open Orders tab, cancellations use 取消 like the
    Cancel buttons, and the accepted and fully filled labels match their count lines.

- Funds notifications say what happened and stop repeating themselves:
  - A withdrawal whose status is unknown now says "Check your balance and withdrawal history before
    retrying." instead of restating that the status could not be confirmed.
  - The automatic testnet deposit reports "USDC deposit confirmed on Arbitrum" when the Arbitrum
    transaction confirms, instead of claiming it was already submitted to Hyperliquid.
  - Once Circle forwards a CCTP deposit, the notification and the deposit screen say "Deposit
    submitted to Hyperliquid" and "Your balance updates once Hyperliquid credits it." While
    forwarding, they say "Circle is forwarding your USDC to Hyperliquid. Do not submit this
    deposit again."
  - Vault results are titled "Vault deposit confirmed" or "Vault withdrawal confirmed". A
    withdrawal says "You received X USDC." and lists the leader commission and closing cost only
    when they are above zero. The transaction is a short explorer link instead of the full hash.
    A rejected authorization says "No operation was submitted."
  - Staking results name the action and amount, such as "Delegated 10 HYPE". A request that
    failed its checks before sending is titled "Request not submitted" instead of "Request
    rejected".
  - Earn results are one line with the amount, such as "Borrowed 5,029.4 USDC". Max withdrawals
    and repayments say "Withdrew entire USDC supply" or "Repaid entire USDC borrow".
  - A referral request that definitely failed is no longer titled "Request not confirmed", and a
    successful one says "Changes may take a moment to appear."
  - Transfer and Send amounts follow the number-format setting.

- Chinese text now uses 存款 for deposits and 提款 for withdrawals, matching the Deposit and
  Withdraw buttons. Forty-eight messages that said 充值, 提现 or 入金 were updated, including
  the withdrawal form's `Withdraw to Arbitrum` button, the deposit address and status messages,
  and the deposit and withdrawal notifications. Thirty more labels that said 存入 or 提取 now
  follow the same buttons, among them the desktop positions toolbar's Deposit and Withdraw buttons
  (previously 存入 and 提取), the Vault and staking withdrawal labels (提款已锁定, 提款规则, 从金库提款,
  待处理提款) and the funds recovery reminders. Phrases with an object keep 存入 and 提取, such as
  提取金库权益, and Earn keeps 存入 for Supply.

- Other notifications follow the buttons they come from:
  - Disconnect failures start with "Disconnect failed:" instead of "Secure disconnect failed
    because", and an unavailable email wallet says "Disconnect, then log in again with the same
    email." like the Disconnect button.
  - Saving a PnL share image says "Image saved" only after the image was downloaded. When a phone
    opens the share sheet instead, no notification appears. A failure says "Failed to save image".
  - In Chinese, TWAP Fill History is 成交记录 instead of 填充历史 on the tab, the table and the
    export messages, and the export progress messages use the same ellipsis as the others.

- The phone navigation drawer no longer shows the Navigation and More headings. As on the
  official terminal, a divider now separates the main destinations from Funding Comparison,
  Statistics, API Wallet, Docs and Support, which leaves more room for the list on small screens.
  Screen readers still announce the two groups as the primary navigation and More.

- Docs, Support, Terms, Privacy Policy, Risk Disclosure and Cookie Policy now open inside the
  normal application chrome: the same top navigation and footer as the trading and dashboard
  pages on desktop, and the application mobile header on phones. Their separate document
  navigation is gone, and the account menu, Deposit and connection controls work on these pages.
  Opening one directly now shows the usual blank startup until the app is ready, then waits like
  the other dashboard pages for the footer and dialog host, and the pages are no longer
  prerendered as standalone HTML. As on the official terminal, the Cookie Policy is reached from
  Section 4 of the Privacy Policy (updated September 27, 2026) instead of a footer
  link, and the phone navigation drawer now lists Docs and Support. Releases replace the old
  standalone page files with the app, so a URL such as `/terms/index.html` no longer shows an
  outdated copy.

- Opening a dashboard page directly (Portfolio, Vaults, Staking, Referrals and referral
  invitation links, Leaderboard, API wallet and the history pages) now waits up to 1.5 seconds,
  the same limit as the trade page, for the footer and the global dialog host to load. When they
  load in time they appear together with the page instead of a moment later, so Ctrl/⌘K works
  from the first frame unless the terms-acceptance prompt is showing. The command menu itself
  still loads on first use, and a slow connection reveals the page when the limit is reached.

- The HIP-3 deployer disclaimer now always has a way out. On the trade page, Leave this market
  returns to BTC; the scrim and Esc still do not dismiss it. Close All and Reverse now show the
  same cancellable disclaimer as Market Close and Limit Close before their confirmation instead of
  failing at submission, and Close All reads the account again when the disclaimer is accepted, so
  its 30-second preview restarts at that moment. The disclaimer fades out after Confirm, Leave or
  Cancel instead of disappearing, and it no longer shows a close button because its footer holds
  the way out. Limit Close now fades out as well when it is cancelled or submitted, like Close All
  and Reverse, and its confirm button is disabled while it closes.

- Link mobile device is now one sentence, one warning and one action. The header QR icon is the
  only entry (it loads the dialog while you hover or focus it, so the click opens the dialog
  directly instead of a "Connecting" shell), the dialog approves the 30-day trading key with a single click (an email wallet signs
  without a second prompt), a 2-second hold that counts down on the button reveals the QR (the progress ring now follows the hold exactly and the QR is drawn the moment the hold completes) and it closes after 60 seconds, immediately if the page is hidden. The phone
  page scrubs the link, shows one sentence and imports on a single tap; a reload asks for a new scan.
  The link now carries a plain payload in the URL fragment instead of an encrypted envelope, the
  revoke panel is gone (approving again replaces the key and the API wallet page removes it), and
  the two build switches became one `VITE_MOBILE_PAIRING_ENABLED`, still off in production.

- Email users no longer see a second Privy signature prompt when approving or revoking
  mobile trading access from the Link mobile device dialog, or when authorizing or removing an
  API wallet. Each dialog's own review step is the confirmation, so the embedded wallet signs
  silently like every other reviewed action, and the API wallet progress view says so instead
  of asking for a wallet confirmation. The revoke confirmation in the Link mobile device dialog
  says "Confirm revoke" for email users and keeps "Confirm revoke in wallet" for external
  wallets; the phone pairing page formats the key's expiry in the interface language.

- The Link mobile device dialog no longer stacks grey boxes: the master wallet is a plain
  label row, "pairing temporarily unavailable" and "keep this window open" are info callouts,
  "trading key approved" and "mobile access revoked" are success callouts, and the approval,
  reveal, scan and revoke cards are outlined on the dialog surface. Warning callouts use the
  semantic error stroke instead of an opacity modifier. The phone pairing page, the staking
  operation reference and the pending-CCTP-deposit notice follow the same three tiers.

- With the `1.234,56` or `1 234,56` number format, typing a comma in any amount, size or price
  field now enters the decimal point instead of being ignored, so the decimal key on German and
  French keyboards works; the field still shows the protocol value with a dot.

- The chart now follows the number-format setting: its price axis, legend and crosshair
  labels use the same decimal sign and grouping separator as the rest of the terminal, and a
  setting change rebuilds the chart with its layout preserved instead of leaving `1.234,56`
  in the tables next to `1.234` on the axis.

- Dates and times keep Latin digits in every language (the Arabic interface previously
  showed Arabic-Indic digits next to Latin-digit prices). Recent trades and the pairing pages,
  which formatted times with the browser's own locale, now follow the interface language;
  vault and API-wallet timestamps already did and keep their date-only or date-time shape.

- Switching the interface language in the dark theme no longer flashes a light chart for a
  moment. The chart's initialization mask now becomes opaque immediately when the
  TradingView widget is rebuilt (it still fades out), so the library's default light body
  background stays hidden until the terminal theme stylesheet has loaded inside the iframe.

- Market Close submissions now run in a page-level host. A brief legal-status recheck
  (wallet reconnect or a failed background refresh) no longer cancels a confirmed close or
  releases its in-flight guard early, and switching the account tab, mobile view or layout
  during a direct close no longer lets the order go out on frozen position data. A
  confirmation is sealed at the click even while the host is still loading: the dialog
  closes, the pending notification appears, the size can no longer change, and repeated
  confirmations of the same session reuse that one attempt.

- Stacked order options in the trading panel keep each click or tap target inside its own
  28px row. Previously the checkbox's 44px hit layer let a click on the lower edge of
  Reduce Only toggle TP/SL; each label now also answers across the adjacent half gap.
  Desktop TWAP options (Randomize timing, Reduce Only, Advanced Settings) follow the same
  rule, so a click near one option no longer toggles its neighbour.

- Partial fills of market or limit orders that carried TP/SL now add a neutral note stating
  Hyperliquid's documented rule: attached TP/SL is placed only if the order fully fills, or
  if its remainder is canceled for insufficient margin. The note asks the user to review the
  position's TP/SL and does not claim the attached orders' actual state.

- Settings and the command menu remain usable while the legal status check is
  pending. Trading and funds dialogs stay gated until the account's legal state
  is resolved.

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
  do, and adds phone instructions (open Sairn on the phone, tap Connect, then Link Desktop
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

- Signing up with email no longer shows Privy's "Creating your wallet" and welcome screens next to
  the terms dialog. The wallet is now created in the background after the email code is accepted,
  and the terms dialog opens only after the login window has closed and the new wallet is ready.
  While the wallet is being created the page waits instead of asking you to reconnect. If it is
  not ready after 20 seconds, a "Wallet not ready" dialog offers Retry and Disconnect, Reconnect
  wallet also retries, and Disconnect now works for an email login that has no wallet yet. The
  terms dialog's reconnect and verification-error states offer Disconnect as well. Privy can still
  show its own creation screen when its wallet service does not start within 30 seconds; until
  that service is ready, Reload page remains the only recovery. See
  [ADR 0033](docs/adr/0033-silent-email-wallet-creation.md).
- In the light theme, browsers that tint their toolbar or status bar from the page's theme color
  (Safari 15 and later, Chrome on Android) now use white like the page header instead of the dark
  terminal teal. The theme color follows the theme chosen in Settings from the first paint and on
  every switch; the dark theme and the installed app's manifest color stay `#0F1A1F`.
- The Vault dialog shows an unknown result in amber with the unknown glyph instead of a red error
  icon, and an API wallet signature you declined shows a neutral cancelled glyph, because nothing
  was submitted.
- The website's copy now matches the product: it no longer calls the terminal open source, MIT
  licensed or self-hostable (the repository is private and the Terms forbid redistribution), shows
  Hyperliquid's fee together with the 0.01% builder fee, no longer claims 50× leverage, "no
  email" or "no backend", lists the current wallets and the Arbitrum USDC deposit, fixes the footer
  anchors on inner pages and drops the placeholder blog post. The hero screenshots show the Sairn
  terminal and are served from hashed paths. A release runbook is in `deploy/website/README.md`;
  the website has not been released since 2026-07-19.
- The support page and product docs describe the current phone linking (scan a short-lived QR
  code from the desktop header, where available) and USDC deposits from Arbitrum, instead of a
  pairing code and a built-in bridge; the legal documents carry the date of the Sairn rename.
- With a wallet connected, the desktop header no longer overlaps between 1182px and about 1450px:
  in Spanish and French the deposit button covered More (clicking More opened the deposit dialog)
  and Settings could be pushed off screen. The header now switches to its compact layout at 1379px
  instead of 1181px, and a deposit button that is unavailable shows only its icon, with the reason
  in its tooltip. On 1280px and 1366px screens the connected header therefore shows Trade,
  Portfolio and Earn with the rest in More, and the disconnected header shows the language icon
  without its name. See [ADR 0013](docs/adr/0013-desktop-navigation-collapse.md).
- On phones, Vault cards no longer run off the right edge of the screen when the list contains a
  long Vault name, so APR, equity, age and the performance line stay visible; a long name wraps onto
  more lines instead of being cut off, on phones and in the desktop table alike. On desktop, the
  Vault and Leader column headers line up with their columns. A Vault's mark now skips punctuation
  and emoji, so `[ Systemic Strategies ] …` shows `SY` instead of `[`.

- On phones, the Vaults, Vault detail and Referrals pages (including referral invitation links) now
  keep the same 16px side margin as Staking, Earn and Portfolio instead of pressing a rounded panel
  against the screen edges. Vault cards show each value under its label, so leader addresses stay
  complete at the narrower width. The three referral steps (Trade, Create code, Invite traders)
  now wrap onto more lines instead of being cut off with an ellipsis, which the narrower width had
  started to do in Chinese and several labels already did in English and French.

- On phones, the Referrals page shows your whole referral code, wrapping a long code onto another
  line instead of cutting it off. At 320px the referral card no longer grows 25px wider than its
  column, where the panel cut off its right edge. Chinese step labels no longer leave a single
  character on a line of its own.

- The Vaults list no longer repeats its Vaults title as a group heading. When Vaults are not
  classified as official or user, or the Deposited or Leading filter is on, the list is a single
  group with no heading; a classified list still shows Official Vaults and User Vaults.

- On a Vault's page, the Account value or PNL figure sits above the chart instead of on top of it,
  where the line could run through the number. In Chinese, the page's notices say 金库 like the rest
  of the page instead of the English word Vault.

- Mobile navigation now finishes closing the menu before switching pages, while preloading the
  destination during the exit animation to avoid the menu disappearing abruptly.

- The Privy login window now follows theme changes immediately, while unchanged wallets keep
  their connection instead of reconnecting on each toggle.

- Error messages follow the interface language. The order and cancellation rejections that
  Hyperliquid documents (such as tick size, minimum order value, insufficient margin, reduce-only,
  post-only, open-interest caps, oracle price limits and maximum position), not having enough cross
  margin to decrease leverage, an expired action and a required first deposit are translated and
  keep the amounts, prices and account address the exchange reported. As on the official terminal,
  an order rejected for insufficient margin while the account holds an opposite position suggests
  Reduce Only. Any other exchange message is still shown word for word, but no longer cut to its
  first line or 100 characters, and a rejected Market Close or Close All no longer repeats each
  market's message on its summary line. Wallet, signing, network and other failures that do not
  come from the exchange show a translated explanation instead of English technical text. Trading
  notifications and dialog errors that are already on screen change language with the page; short
  confirmations that close by themselves keep the language they opened in. See
  [ADR 0024](docs/adr/0024-translate-action-errors-at-render.md).
- Vault action errors, staking amount errors and the API wallet name check, expiry and status labels
  are no longer blank. The helpers that built them returned empty text in every language. A Vault
  transfer the exchange rejects shows the exchange's reason, and a Vault request that fails on the
  network is reported as a failed operation, not as a change of wallet or network.
- On phones, a leverage change made in the leverage drawer is reported under Adjust leverage. Its
  notifications were titled Margin mode even when the margin mode did not change.
- An order that the exchange rejected or canceled after it was submitted shows the reason in words,
  such as a rejection for insufficient margin, instead of a status code such as
  `perpMarginRejected`.
- The chart reports a translated reason when market history cannot be loaded instead of the
  network error text.
- The Previous, Next and page labels of the history tables, the Clear search button, the
  screen-reader names of the notification region and its close buttons, the embedded wallet's Agent
  approval prompt, the LI.FI credit and the bridge quote countdown are translated.
- The Docs page no longer shows its placeholder table of unfinished guide links, whose entries all
  pointed nowhere, or the note telling authors to replace them.
- The Quick Links on the Support page, and its other link to Troubleshooting, now jump to their
  section and stop below the header on desktop, on testnet and on phones. Headings had no anchor,
  so these links did nothing.
- Italic text on the Docs and Support pages no longer shows its underscores or asterisks, and a
  numbered list with nested bullets keeps one numbering instead of restarting at 1 for every entry.
- Arabic, Spanish, French and Hindi translate 12 more strings that fell back to English, including
  the mobile order book's `Total` column header, the TWAP trigger hints and the Display and
  language menu. Two English source entries that were empty are filled.
- A request for a missing file with a longer extension, such as `/missing.webmanifest`, or for a
  file whose name starts with a dot, such as `/.env`, now returns Not Found from CloudFront, the
  application server and the Service Worker instead of the application page.
- Setting the computer's clock back no longer keeps stopped market or account data looking live.
  Prices, order books, market contexts and account streams that stop updating are marked stale
  after their usual threshold (for market contexts about 25 seconds while the page is visible)
  whatever the clock does, and order books and market contexts that keep arriving are no longer
  held back for as long as the clock was moved back. Staleness thresholds and reconnection are
  unchanged.

- Setting the computer's clock back no longer leaves order cancellations, order edits and TWAP
  cancellations waiting for confirmation for as long as the clock was moved back. A fresh
  open-orders or active-TWAP update confirms them as usual, a request with no answer is reported as
  unconfirmed after the usual 15 seconds, and an update that arrived before the request is no longer
  taken as its result. A connection that stops sending data is still reconnected, and after a change
  of order-book grouping the book waits no longer than its usual five seconds for the previous
  grouping to close. Pending orders that are shared between browser tabs still follow the
  computer's clock.

- On phones the Market Close and Limit Close sheets have a close button again. Since the redesign
  they could only be left by swiping down, tapping outside or pressing Esc, and the only button on
  the sheet was the confirm button. The close button takes the place of the `Price: Market` and
  `Limit` labels in the sheet header, which repeated the title.
- The leverage slider in the desktop Adjust leverage dialog and the mobile leverage sheet no longer
  moves under the pointer when a drag crosses 10x. The high-leverage warning below the field used to
  appear or disappear in the middle of the drag, which moved the centred desktop dialog by about
  35px and the bottom sheet by about 70px. The warning now keeps the state it had when the drag began
  and follows the released value. Typed values and arrow keys still update it at once, and Confirm
  still submits the released value.
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
