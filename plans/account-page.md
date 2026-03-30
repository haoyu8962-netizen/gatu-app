# Plan: Full Account Page (/account)

> Source PRD: vipineth/hypeterminal#60

## Architectural decisions

- **Route**: `/account` — standalone route with its own page layout (TopNav + scrollable content, no trading panels)
- **Navigation**: TopNav link (desktop), mobile account panel link (mobile)
- **Auth**: No route guard — show "connect wallet" prompt when disconnected
- **Data sources**: Hyperliquid API via `useSubscription` (WebSocket) and `useInfo` (REST) hooks
- **Actions**: Reuse existing modals (deposit/withdraw/bridge/transfer/send)
- **Layout**: Responsive single-column, sections stack vertically, tables become cards on mobile
- **History pagination**: Time-range based (`startTime`/`endTime`) per Hyperliquid API pattern

---

## Phase 1: Page Shell + Account Overview

**User stories**: 1, 2, 3, 26, 27, 28, 29, 30, 34, 35, 36, 37

### What to build

Create the `/account` route with a standalone page layout. Add navigation links in TopNav (desktop) and mobile account panel. Implement the Account Overview section showing all corrected metrics: equity (perps + spot breakdown), balance, unrealized PNL, withdrawable, margin used, margin ratio (with visual bar), maintenance margin, cross leverage. Wire action buttons to existing deposit/withdraw/bridge/transfer/send modals. Handle wallet-not-connected state with a connect prompt.

### Acceptance criteria

- [ ] `/account` route renders a standalone page with TopNav
- [ ] TopNav has an "Account" link that navigates to `/account`
- [ ] Mobile account panel has a link to the full account page
- [ ] Account overview displays: equity, balance, unrealized PNL, withdrawable, margin used, margin ratio, maintenance margin, cross leverage
- [ ] Margin ratio has a visual bar/gauge indicator
- [ ] Perps + Spot equity breakdown is shown
- [ ] Action buttons (Deposit, Withdraw, Bridge, Transfer, Send) open existing modals
- [ ] Wallet-not-connected state shows connect wallet prompt
- [ ] Page is responsive on mobile

---

## Phase 2: Portfolio PNL Chart

**User stories**: 4, 5, 6, 7

### What to build

New hook wrapping the REST `portfolio` info endpoint. Render account value and PNL as line charts with a Day/Week/Month/All Time period selector. Show total trading volume for each period. Use the combined (perp+spot) data variant.

### Acceptance criteria

- [ ] New hook fetches portfolio data from the `portfolio` info endpoint
- [ ] Account value line chart renders correctly
- [ ] PNL line chart renders correctly
- [ ] Time period toggle (Day/Week/Month/All Time) switches the data
- [ ] Total volume for the selected period is displayed
- [ ] Charts handle empty/zero data gracefully

---

## Phase 3: Positions & Spot Balances

**User stories**: 8, 9, 10, 11, 12, 13

### What to build

Open perp positions section showing all positions with full detail (coin, side, size, entry, mark, PNL, leverage, margin, liq price). Liquidation warning when within 10% of current price. Spot balances section with per-token breakdown (total, available, in orders, USD value), sorted by USD value, with hide-small-balances toggle. Adapt existing position/balance display logic for the wider full-page layout.

### Acceptance criteria

- [ ] All open perp positions displayed with: coin, side, size, entry price, mark price, PNL ($, %), leverage, margin used, liquidation price
- [ ] Liquidation warning indicator when liq price is within 10% of mark price
- [ ] Spot balances table shows: token, total, available, in orders, USD value
- [ ] Balances sorted by USD value descending
- [ ] Hide small balances toggle works
- [ ] Tables become cards on mobile

---

## Phase 4: Ledger History

**User stories**: 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25

### What to build

Tabbed history section with tabs: All / Trades / Funding / Orders / Ledger. New hook for `userNonFundingLedgerUpdates` endpoint powering the Ledger tab (deposits, withdrawals, transfers, liquidations, rewards). Trades tab uses `userFillsByTime`, Funding tab uses `userFunding`, Orders tab uses `historicalOrders`. All tabs with time-range filtering support. Each entry type has appropriate rendering (type icon, amounts, fees, timestamps, explorer links).

### Acceptance criteria

- [ ] Tabbed history view with All / Trades / Funding / Orders / Ledger tabs
- [ ] Ledger tab shows deposits, withdrawals, transfers, liquidations, reward claims
- [ ] Trades tab shows fills with coin, side, price, size, fee, closed PNL, timestamp
- [ ] Funding tab shows coin, size, funding rate, USDC amount, timestamp
- [ ] Orders tab shows historical orders with final status
- [ ] Time-range filtering works for trades, funding, and ledger tabs
- [ ] Each entry type has distinct visual treatment
- [ ] Empty states handled gracefully

---

## Phase 5: Leverage Settings

**User stories**: 31, 32, 33

### What to build

Per-asset leverage display and configuration section. Show assets that have open positions or recent activity with their current leverage value and margin mode (cross/isolated). Allow changing leverage and switching margin mode using existing leverage control components.

### Acceptance criteria

- [ ] Lists assets with open positions showing current leverage and margin mode
- [ ] Leverage can be changed per-asset from this section
- [ ] Margin mode (cross/isolated) can be switched
- [ ] Reuses existing leverage control components
- [ ] Success/error feedback on leverage changes
