# PRD: Command Bar (Cmd+K) v1 — Keyboard-First Navigation & Views

**Status**: Draft
**Author**: Ankit
**Date**: 2026-04-16
**Reference**: `research/ideas-as-research.md` §4 item 1 (Bloomberg-style command bar)

---

## Background

HypeTerminal ships a `Cmd+K` palette today. It does exactly one thing — select a market — and it does that well. The rest of the product is reached by clicking: nav links for scope, buttons for theme/settings, tabs for positions/orders/fills, a gear icon for slippage, a user menu for sub-accounts, and so on. That works for casual use. It doesn't match the mental model of the traders we're targeting — people who came from Bloomberg, ThinkorSwim, TradeStation, Superhuman, Linear, or VSCode and expect to reach every feature from the keyboard in under a second.

Rather than rebuild the UI keyboard-first, we extend the existing `Cmd+K` into a general-purpose command surface. Same shortcut, same modal, same `cmdk` library, same fuzzy search engine — but with commands as first-class entities alongside markets.

## Scope for v1

**In:** navigation, data views, account views, settings toggles, help/system.

**Explicitly out (deferred to v2+):**
- Order entry of any kind (limit, market, stop, TWAP, scale, bracket, TP/SL).
- Order cancels, modifies, scheduled cancel.
- Position management (close, flat, reverse, leverage change, margin adjust).
- Transfers, deposits, withdrawals, swaps, send, bridge.
- Vault / sub-account / staking / delegation actions.
- Atomic order-ticket text parsing (`BUY 10 SOL @ 180`).
- Multi-panel workspace addressing.
- LLM fallback for unparseable input.
- Screeners / scanners.
- Aliases, macros, shareable deep links.

Deferring execution until v2 means **zero signing work in v1**. Every command in v1 is either a route change, a store mutation, a modal open, or a view switch. That keeps the blast radius near zero and lets us ship an honest foundation quickly.

---

## Problem statement

| Symptom | User impact | Root cause |
|---|---|---|
| Every non-market feature requires mouse-hunting | Slow power-user workflow; breaks flow | No keyboard-first entry for anything except market selection |
| `Cmd+K` opens a market picker even when the user wants to toggle theme, change slippage, or jump to fills | Wasted keystroke + click fallback | Command menu has no notion of commands — only markets |
| Settings scattered across gear icon, header, modals, tabs | Cognitive load; discoverability suffers | No unified index of "every thing you can do" |
| Sub-account switching requires three clicks (avatar → dropdown → name) | Interrupts trading | Only UI path is the user menu |
| Switching scope (perp ↔ spot ↔ HIP-3) requires locating and clicking nav | Mouse-bound | Route-driven only |
| New features need new UI surface area to be discoverable | UI clutter grows with feature count | No "shipped but hidden" affordance |

The underlying cause is uniform: **features are reachable only by their visual location, not by their name.**

---

## Goals

1. **Every view, route, and non-signing action in the app is reachable via `Cmd+K` in ≤ 3 keystrokes.**
2. **The existing market picker behavior is preserved** — typing a ticker still selects it in the current scope, with no regression in search quality.
3. **Commands are colocated with features.** Adding a new feature adds a new command in the same PR, not in a central registry file 1,000 lines long.
4. **The registry is typed and extensible** so v2 (execution), v3 (screeners), and v4 (multi-panel) plug in without rewriting.
5. **Zero signing work in v1.** No `useExchange` calls. Commands that would require signing are explicitly excluded.
6. **Performance is not degraded.** Palette opens in < 50 ms cold; fuzzy search stays sub-16 ms on the full index.

## Non-goals

- Replacing the `cmdk` library or the existing `createSearcher` fuzzy engine. We extend both.
- Global hotkey layer (`g p`, `g s`, letter chords). Post-v1 if it's worth it.
- Mobile parity. `Cmd+K` is desktop-first in v1; mobile continues to use the bottom-tab UI.
- Telemetry / command usage analytics. Useful later; not blocking.
- Customizable keybindings. Deferred.
- Renaming, aliasing, or macro recording from within the palette.

---

## Users and jobs

The same three personas from the research doc, but v1 addresses a subset of what each one needs:

**Equities swing trader (persona a)** — wants fast market/scope switching and fast access to charts, funding, and 24h stats. v1 covers all of this.

**Prop/algo quant (persona b)** — wants keyboard reach for every view: positions, open orders, fills, funding history, TWAP history, ledger, sub-accounts. v1 covers all read-side. Execution is v2.

**Wealth/RIA client (persona c)** — wants portfolio-style views, fee/VIP tier visibility, ledger-level clarity. v1 exposes these as first-class command entries that today are either buried or missing.

---

## Current state (verified against code)

All citations are file + line references as of 2026-04-16.

**Existing `Cmd+K` modal** — `apps/terminal/src/components/trade/components/command-menu.tsx:19–106`
- Opens on `Cmd+K` / `Ctrl+K` (lines 34–46, raw `window.addEventListener`, no shared hotkey layer).
- Renders `cmdk` `CommandDialog` with `shouldFilter={false}` — we bring our own search.
- Only action: `setSelectedMarket(scope, market.name)` (line 53), then close. No routing, no other commands.

**Modal state** — `apps/terminal/src/stores/use-global-modal-store.ts:1–84`
- Single-slot union: `deposit | settings | swap | commandMenu | null` — only one modal open at a time.
- Selectors: `useCommandMenuOpen()` (line 82), `useCommandMenuActions()` (line 83).

**Market store** — `apps/terminal/src/stores/use-market-store.ts:1–87`
- Persisted zustand (`STORAGE_KEYS.MARKET_PREFS`, version 3) with per-scope `selectedMarkets` and `favoriteMarkets: ["BTC", "ETH", "HYPE"]` defaults.
- Actions: `setSelectedMarket(scope, name)`, `toggleFavoriteMarket(name)`.

**Scope provider** — `apps/terminal/src/providers/exchange-scope.ts`
- Reads current `ExchangeScope` from route (`all` | `perp` | `spot` | `builders-perp`). Writes are by navigation.

**Fuzzy search engine** — `apps/terminal/src/lib/search/`
- Multi-phase (exact → prefix → suffix → wordPrefix → contains → fuzzy) with weighted field matching.
- `DEFAULT_MATCH_SCORES` in `types.ts:60–67`: exact=1000, prefix=500, suffix=350, wordPrefix=300, contains=100, fuzzy=50.
- `createSearcher(items, config)` returns `{search, setItems, getItems}` — reusable for any typed collection.
- Market preset at `lib/search/presets/market.ts:1–63`.

**Routes** — `apps/terminal/src/routes/`
- `index.tsx` (all), `perp.tsx`, `spot.tsx`, `builders-perp.index.tsx`, `builders-perp.$dex.tsx`, `$.tsx` (404).

**Layout** — `apps/terminal/src/components/trade/layout/main-workspace.tsx:1–53`
- Two-panel `react-resizable-panels` grid (analysis + sidebar). Panel IDs in `PANEL_LAYOUT.MAIN`.

**Global settings store** — persisted zustand with: `theme`, `language`, `numberFormatLocale`, `marketOrderSlippagePercent`, `marginMode`, `showOrderbookInQuote`, `showChartScanlines`, `hideSmallBalances`, `network`, `positionsActiveTab`, `mobileActiveTab`. Every one is a plain action — no signing, safe to trigger from a command.

**hl-react exports** relevant to v1 (`packages/hl-react/src/index.ts`) — read-only: `useInfo`, `useSubscription`, `useUserPositions`, `useApiStatus`, `useAgentStatus`. We touch `useExchange` **only for v2+**.

---

## API capability map (v1-relevant only)

v1 has no signed calls. All data sources are reads or store mutations.

| Capability | Source | Notes |
|---|---|---|
| Asset metadata | `meta`, `spotMeta`, `perpDexs`, `allPerpMetas` | Already cached; feeds market index. |
| Live asset context | `activeAssetCtx` / `activeSpotAssetCtx` (WS) | Feeds `FUND`, `OI`, `STATS`. |
| Account state | `webData3`, `clearinghouseState`, `spotClearinghouseState` | Feeds `EQUITY`, `BAL`, `POS`. |
| Orders read | `frontendOpenOrders`, `userHistoricalOrders` | Feeds `OPEN`, `HIST`. |
| Fills read | `userFills` sub | Feeds `FILLS`. |
| Funding | `userFundings` sub, `fundingHistory`, `predictedFundings` | Feeds `FUNDP`, `FUND`, `PFUND`. |
| TWAP history | `userTwapSliceFills`, `userTwapHistory` | Feeds `TWAPF`. |
| Ledger | `userNonFundingLedgerUpdates` | Feeds `LEDG`. |
| Fees | `userFees`, `isVip`, `userRateLimit` | Feeds `FEE`, `VIP`, `RATE`. |
| Sub-accounts read | `subAccounts2` | Feeds `SUB` list. Switch is local state only. |
| WS health | `useApiStatus` | Feeds `:ws status`. |

Hyperliquid rate limits relevant to palette usage:
- Read endpoints counted by weight; most screener-ish queries are weight ≤ 20.
- `useInfo` results are cached in React Query, so repeat `Cmd+K → FEE` does not re-fetch.
- Subscription count ceiling: `WS_RELIABILITY_LIMITS.subscriptions.maxTrackedKeys = 800` (`packages/hl-react/src/internal/websocket/reliability.ts:9`). Palette-triggered view opens that reuse existing subs add no load.

---

## Design

### Command shape

A command is a typed object, colocated with the feature it represents. A command does exactly one of three things:

```ts
type Command =
  | { kind: "navigate"; /* route change */ }
  | { kind: "open-modal"; /* modal store action */ }
  | { kind: "mutate-store"; /* zustand action: setTheme, setSlippage, setSelectedMarket, ... */ };
```

No command kind calls `useExchange`. That's the guarantee that v1 cannot produce a signed action.

```ts
interface Command {
  id: string;                                    // stable, kebab-case, e.g. "nav.perp"
  label: string;                                 // user-visible: "Switch to Perp"
  mnemonic?: string;                             // optional short code: "PERP"
  keywords?: string[];                           // extra fuzzy terms
  section: CommandSection;                       // grouping in the palette
  kind: "navigate" | "open-modal" | "mutate-store";
  icon?: ComponentType;
  enabled?: (ctx: CommandContext) => boolean;    // hide when irrelevant
  run: (ctx: CommandContext) => void | Promise<void>;
}

type CommandSection =
  | "navigation"
  | "markets"
  | "views"
  | "account"
  | "settings"
  | "help";
```

The `enabled` predicate is how we keep the palette clean: "Switch to HYPE" is only offered when HYPE exists in current scope; "View my delegations" only if the user has delegations; "Switch sub-account" only if the user has sub-accounts.

### Command context

A single object passed to every `run` / `enabled`:

```ts
interface CommandContext {
  router: Router;
  scope: ExchangeScope;
  selectedMarket: string;
  isConnected: boolean;
  address?: string;
  hasPositions: boolean;
  hasSubAccounts: boolean;
  // lazily-bound action packs
  marketActions: MarketActions;
  settingsActions: SettingsActions;
  modalActions: ModalActions;
}
```

Built by a hook at palette open time. Nothing persistent. Commands never close over router/actions directly — they always receive them via `ctx`. This keeps commands pure and easy to test.

### Registry

Commands register themselves at their feature's module boundary:

```ts
// apps/terminal/src/features/theme/commands.ts
export const themeCommands: Command[] = [
  {
    id: "theme.toggle",
    label: "Toggle theme",
    mnemonic: "THEME",
    keywords: ["dark", "light", "mode"],
    section: "settings",
    kind: "mutate-store",
    run: ({ settingsActions }) => settingsActions.toggleTheme(),
  },
  { id: "theme.dark",  label: "Theme: Dark",  mnemonic: "DARK",  section: "settings", kind: "mutate-store", run: (c) => c.settingsActions.setTheme("dark") },
  { id: "theme.light", label: "Theme: Light", mnemonic: "LIGHT", section: "settings", kind: "mutate-store", run: (c) => c.settingsActions.setTheme("light") },
];
```

A central index (`apps/terminal/src/commands/index.ts`) concatenates all feature command arrays. No barrel file gymnastics — one file, one `export const allCommands`. React compiler handles memoization.

### Palette UX inside `cmdk`

The existing `CommandDialog` grows two kinds of items:

1. **Markets** (existing behavior, unchanged) — filtered by current scope.
2. **Commands** (new) — grouped by `section` with `CommandGroup` headers.

Ranking when user types: we run both the market searcher *and* a command searcher (reusing `createSearcher` with a command-specific config), merge results by score, and cap at ~50 rows. Commands that start with the query (prefix match on mnemonic or label) always rank above fuzzy market matches.

Empty-state view (no query): show top 8 "recent commands" (stored in a capped in-memory ring, no persistence yet) + favorites markets below, as a fast-path to common actions.

A small footer line inside the palette shows the current context: `Scope: Perp · Market: BTC · Connected: 0x1234…cd`. This makes context-dependent commands (e.g. "Flat BTC" in v2) legible *before* the user runs them.

### Grammar — minimal in v1

v1 does not parse arguments. Every command is atomic — selecting it from the list runs it. That means no `BUY 10 SOL @ 180` in v1, which is already what we agreed.

We do accept **two-token navigational input** as a special case of search: typing `perp btc` ranks the "switch to perp + select BTC" pairing highly, even though under the hood it's two sequential commands. If the user picks it, we execute both.

Everything else is one-shot: type enough of the label/mnemonic/keyword, hit Enter.

### Keyboard

- `Cmd+K` / `Ctrl+K` — open / close. (Same as today.)
- `Esc` — close.
- `↑` / `↓` — navigate results. (Handled by `cmdk`.)
- `Enter` — run selected.
- `Tab` — (reserved for v2 argument entry; no-op in v1).

No other global shortcuts in v1.

---

## Command catalog (v1 — exhaustive)

Grouped by `section`. Every entry below is in scope for v1.

### Navigation (11)

| id | label | mnemonic | target |
|---|---|---|---|
| `nav.all` | Go to All Markets | `ALL` | `/` |
| `nav.perp` | Switch to Perp | `PERP` | `/perp` |
| `nav.spot` | Switch to Spot | `SPOT` | `/spot` |
| `nav.builders` | Switch to Builder Perps (HIP-3) | `BUILD` | `/builders-perp` |
| `nav.builder-dex` | Go to a specific builder DEX… | `DEX` | select from `perpDexs`, then `/builders-perp/$name` |
| `nav.back` | Back | — | `router.history.back()` |
| `nav.forward` | Forward | — | `router.history.forward()` |
| `nav.reload` | Reload | — | `router.invalidate()` |
| `nav.vaults` | Vaults (planned — disabled when route missing) | `VAULTS` | noop + toast "coming soon" |
| `nav.portfolio` | Portfolio (planned) | — | noop |
| `nav.staking` | Staking (planned) | — | noop |

### Markets (existing + new)

Unchanged from today: every market in the unified index is selectable. Typing a ticker (`BTC`, `ETH`, `HYPE`, `PURR`, a HIP-3 coin) runs `setSelectedMarket(currentScope, name)`.

**Added:**

| id | label | mnemonic | run |
|---|---|---|---|
| `market.favorite-add` | Add current market to favorites | `FAV` | `toggleFavoriteMarket(selectedMarket)` |
| `market.favorite-remove` | Remove current market from favorites | `UNFAV` | same |
| `market.favorites-list` | Show favorites only | — | palette-local filter |

### Views (20 — opens the panel / route that shows the data)

All are either passive (route only) or open a modal / focus an existing tab. No new render surfaces required.

| id | label | mnemonic | target |
|---|---|---|---|
| `view.chart` | Chart | `CHART` | focus chart panel |
| `view.orderbook` | Order book | `DOM` / `DEPTH` | focus orderbook tab |
| `view.trades` | Trades tape | `TAPE` | focus trades tab |
| `view.funding` | Funding (rate + countdown + history) | `FUND` | scroll/focus stat block + open history tab |
| `view.oi` | Open interest | `OI` | scroll/focus stat block |
| `view.stats` | Market stats (24h vol, change, high/low, oracle) | `STATS` | focus market overview |
| `view.predicted-funding` | Cross-venue predicted funding | `PFUND` | new minimal panel (read-only) |
| `view.positions` | Open positions | `POS` | switch positions tab |
| `view.open-orders` | Open orders | `OPEN` | switch orders tab |
| `view.order-history` | Order history | `HIST` | switch orders-history tab |
| `view.fills` | Fill / trade history | `FILLS` | switch history tab |
| `view.funding-payments` | Funding payments | `FUNDP` | switch funding tab |
| `view.twap-fills` | TWAP slice fills | `TWAPF` | switch twap tab |
| `view.ledger` | Non-funding ledger (deposits/withdrawals/liquidations) | `LEDG` | new minimal panel (read-only) |
| `view.balances` | Spot balances | `BAL` | switch balances tab |
| `view.equity` | Account equity / margin | `EQUITY` / `ACCT` | focus account panel |
| `view.fees` | Fee tier + VIP + volume | `FEE` | new minimal panel |
| `view.rate-limit` | API rate limit | `RATE` | new minimal panel |
| `view.sub-accounts` | Sub-accounts list (read only in v1) | `SUB` | new minimal panel |
| `view.referral` | Referral rewards | `REF` | new minimal panel |

The six "new minimal panel" entries above are the only new render surfaces v1 requires. Each is a table or stat block on data we already have; no new endpoints.

### Account (read-only views on current user — 4)

| id | label | mnemonic | run |
|---|---|---|---|
| `account.copy-address` | Copy wallet address | `ADDR` | `navigator.clipboard.writeText(address)` |
| `account.status` | Show connection status | — | open toast with ws/api state |
| `account.agent-status` | Agent wallet status (approved? expires when?) | `AGENT` | read-only dialog |
| `account.switch-sub` | Switch active sub-account view | — | sub-list submenu → set `selectedSubAddress` (local state only) |

### Settings (18)

Every persisted user preference is addressable.

| id | label | mnemonic | run |
|---|---|---|---|
| `settings.open` | Open settings modal | `SETTINGS` | `useSettingsDialogActions().open()` |
| `settings.theme-toggle` | Toggle theme | `THEME` | `setTheme(inverse)` |
| `settings.theme-dark` | Theme: Dark | `DARK` | `setTheme("dark")` |
| `settings.theme-light` | Theme: Light | `LIGHT` | `setTheme("light")` |
| `settings.language` | Change display language… | `LANG` | submenu over supported locales |
| `settings.number-format` | Change number format… | `FMT` | submenu over locales + auto |
| `settings.slippage` | Set market order slippage… | `SLIP` | submenu with presets 0.5 / 1 / 2.5 / 5 / 10% |
| `settings.margin-cross` | Default margin mode: Cross | `CROSS` | `setMarginMode("cross")` |
| `settings.margin-iso` | Default margin mode: Isolated | `ISO` | `setMarginMode("isolated")` |
| `settings.orderbook-quote` | Orderbook: show in quote | `OBQ` | `setShowOrderbookInQuote(true)` |
| `settings.orderbook-base` | Orderbook: show in base | `OBB` | `setShowOrderbookInQuote(false)` |
| `settings.scanlines-on` | Chart scanlines: on | — | `setShowChartScanlines(true)` |
| `settings.scanlines-off` | Chart scanlines: off | — | `setShowChartScanlines(false)` |
| `settings.hide-dust-on` | Hide small balances | `DUST` | `setHideSmallBalances(true)` |
| `settings.hide-dust-off` | Show small balances | — | `setHideSmallBalances(false)` |
| `settings.network-mainnet` | Network: Mainnet | `MAIN` | `setNetwork("mainnet")` (reloads) |
| `settings.network-testnet` | Network: Testnet | `TEST` | `setNetwork("testnet")` (reloads) |
| `settings.reset` | Reset all settings (confirm) | — | clear persisted prefs |

### Help / system (8)

| id | label | mnemonic | run |
|---|---|---|---|
| `help.commands` | List all commands | `?` / `HELP` | cheatsheet modal |
| `help.shortcuts` | Keyboard shortcuts | `KEYS` | cheatsheet modal |
| `help.docs` | Open Hyperliquid docs | `DOCS` | external link |
| `help.support` | Open support / feedback | `SUPPORT` | external link |
| `help.changelog` | Changelog / what's new | — | external link |
| `help.ws-status` | Show WebSocket health | — | open toast w/ counts |
| `help.version` | App + SDK version | — | toast |
| `help.signout` | Disconnect wallet | `SIGNOUT` | wallet disconnect |

**Total v1 command count: ~70 discrete entries** (plus all markets). Each one is either a route change, a store mutation, a modal open, or a toast — no signing.

---

## Implementation plan

### Phase 0 — foundation (Week 1)

1. Create `apps/terminal/src/commands/` directory with:
   - `types.ts` — `Command`, `CommandContext`, `CommandSection`.
   - `context.ts` — `useCommandContext()` hook that gathers router + store selectors + action packs.
   - `registry.ts` — `allCommands: Command[]` concatenated from feature modules.
   - `search.ts` — instantiate `createSearcher(allCommands, commandSearchConfig)`.
2. Create a `commandSearchConfig` preset in `lib/search/presets/command.ts` modeled on `marketSearchConfig` — fields: `label` (weight 2), `mnemonic` (weight 2, prefix-bias), `keywords` (weight 1). Fuzzy only on label with `fuzzyMinLength: 3`.
3. Extend `command-menu.tsx` to render two `CommandGroup`s: "Commands" above "Markets". Existing market search is unchanged.

**Exit criteria:** empty command registry compiles; palette still behaves exactly like today.

### Phase 1 — navigation + markets (Week 1)

4. Author `features/navigation/commands.ts` with the 11 nav commands.
5. Author `features/markets/commands.ts` with favorite add/remove/list.
6. Wire router into `CommandContext`.

**Exit criteria:** user can type `perp`, `spot`, `all`, `build` and navigate; user can favorite current market from palette.

### Phase 2 — settings (Week 2)

7. Expose action pack from `useGlobalSettings()` → `SettingsActions`.
8. Author `features/settings/commands.ts` with all 18 settings commands.
9. Submenu pattern: label commands that need an argument (e.g. `SLIP`) open a nested `cmdk` filter — no new UI, just a state transition in the palette.

**Exit criteria:** every persisted setting is reachable from palette; no UI regression in gear-icon modal.

### Phase 3 — views (Week 2–3)

10. Where a view already has a tab/route, command targets it via existing action.
11. Six "new minimal panel" entries (`PFUND`, `LEDG`, `FEES`, `RATE`, `SUB` list, `REF`) each become a tiny read-only route or modal rendering existing `useInfo` data. No new endpoints. Each panel is ≤ 80 lines.
12. Author `features/views/commands.ts` wiring these up.

**Exit criteria:** all 20 view commands navigate/focus correctly.

### Phase 4 — help + polish (Week 3)

13. Author `features/help/commands.ts` with help, shortcuts, docs, support, version, ws-status, signout.
14. Add footer bar to palette showing scope / market / connected status.
15. Add recent-commands ring (in-memory, capped at 8).
16. Record palette open → first-interaction latency in dev; aim < 50 ms cold.
17. QA pass: every command in the catalog is runnable, `enabled` predicates correctly hide irrelevant entries, fuzzy search quality is equal or better than today on market queries.

**Exit criteria:** ship.

---

## Risks & open questions

**Risks**
- **Search result mixing.** Commands and markets in one list could push a frequent ticker (`BTC`) below a command whose label contains "bt" (e.g. a hypothetical "Balance transfer"). Mitigation: prefix-match commands always, but give markets a flat score floor ≥ fuzzy command matches.
- **Locale strings.** All new command labels go through `lingui`. If translations aren't ready, English fallback must not break sort order. Mitigation: fuzzy search on the *rendered* label, not the catalog id.
- **Enabled predicate churn.** If a predicate reads store state, it triggers a re-index on every store change. Mitigation: predicates run only at palette open time, not on every keystroke.
- **Settings re-ranking.** Users may not remember that "Dust" hides small balances. Mitigation: rich `keywords` per command (e.g. `["small", "dust", "minor"]`).

**Open questions (not blocking v1)**
- Do we expose `DMS` (dead-man switch) as a read-only *status* command in v1? It's agent-signable so we could, but it's the first execution-adjacent thing. Conservative default: leave for v2.
- Sub-account *switch* is a local-state change, not a signed action. Include in v1? Default: yes (it's already a user-menu click; we're just adding a keyboard path).
- Recent-commands persistence. Memory ring for v1, consider localStorage for v2.
- Should we hide `Cmd+K` commands behind a user-toggleable feature flag during rollout? Low risk, so probably not.

---

## v2 and beyond (appendix — NOT implemented here)

Left intentionally detailed so v1 design doesn't accidentally close doors on these.

**v2 — execution**
- Order entry commands (interactive: set side / type / size / price via palette).
- Atomic text parser (`BUY 10 SOL @ 180 SL 170 TP 200`).
- Position management (`CLOSE`, `FLAT`, `FLAT ALL`, `REV`, `TPSL`).
- Cancel management (`X <oid>`, `XALL`, `XMKT`).
- Confirmation modal pattern for destructive actions.
- `DMS` arm/disarm.
- Transfers, swaps, sends, bridge.
- Every command here carries a `requires: "master" | "agent"` field; palette must re-prompt master wallet for the nine `USER_SIGNED_METHODS` in `packages/hl-react/src/registries/exchange.ts:11`.

**v3 — discovery**
- Screeners (`SCR FUND>0.1`) — simple DSL, cached filter chains.
- HIP-3 market incubator view.
- `BASIS` one-click basis-trade ticket.

**v4 — workspace**
- Multi-panel grid (2×2) with per-panel `CommandContext`.
- `Shift+Enter` = run in new panel, panel focus keys.
- Saved workspaces with share links.

**v5 — intelligence**
- LLM fallback for unparseable input.
- Aliases (`:alias myBasis = BASIS BTC`).
- Macros (record a sequence, replay).

---

## References

- `research/ideas-as-research.md` — §4 item 1 ("Bloomberg-style command bar + Terminal UX").
- `packages/hyperliquid-api/SKILL.md` — API surface decision rules used during capability mapping.
- `packages/hl-react/src/index.ts` — hooks available to v1 (read-only slice).
- `packages/hl-react/src/registries/exchange.ts:11` — `USER_SIGNED_METHODS` set (informs v2 gating, not v1).
- `apps/terminal/src/components/trade/components/command-menu.tsx` — file to be extended.
- `apps/terminal/src/lib/search/` — fuzzy engine reused as-is.
- `apps/terminal/src/stores/use-global-modal-store.ts` — modal state slot used for palette.
- Reference products to study before building: Linear, Superhuman, Raycast, GitHub Cmd+K, VSCode command palette.
