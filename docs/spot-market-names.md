# Spot market names and addresses

Status: implemented 2026-11-01 on branch `claude/audit-g2-spot-names` (on top of `claude/audit-group2`); not merged into `dev`, not released. Decision and tradeoffs: [ADR 0048](adr/0048-official-spot-display-names-and-addresses.md). Audit item C3 of the [full-feature audit](work-memory/sessions/2026-10-30-full-feature-audit.md).

## Goal and boundaries

Every spot token and pair shows the name the official Hyperliquid terminal shows for it, every surface shows that one name, and a `/trade` address opens the market the official terminal opens for it. Display names are presentation only: API coins (`@107`, `PURR/USDC`), protocol token names (`UBTC`), `name:tokenId` token strings in signed actions and info requests, stored selections, favorites, drafts and CSV exports never change, and a display name is never sent to the API.

## Where the names come from

Hyperliquid's API has no display names: `spotMeta.tokens[].name` is the protocol name (`UBTC`, `UPUMP`, `PAIR`). The official frontend keeps its own table by network and token index. In its 2026-10-31 production bundle (`config-BhZylSmU.js`; the 2026-11-01 deploy renamed the chunk `config-Carig3W2.js`):

```js
function Rh(e,t,n){return{index:kn(e),l1Name:t,displayName:n}}
var zh={Testnet:[Rh(1129,`UNIT`,`BTC`), …],Mainnet:[Rh(197,`UBTC`,`BTC`), …],Local:[],Sandbox:[]};
… var xne=yne(zh[Ln.chain]),Sne=bne(zh[Ln.chain]);function Cne(e){return xne[e]}function wne(e){return Sne[e]}
```

The spot catalog keys it by token index (`i=Hn(Cne(r)??n.name)`); `wne` (by protocol name) is only the fallback of `Og` before `spotMeta` loads. `apps/terminal/src/config/spot-token-display-names.ts` is the single copy: `[index, tokenName, displayName]` per network, in the official order, the `tokenName` being the official `l1Name`.

Mainnet (all 28 official entries; every recorded name matched `spotMeta` on 2026-11-01):

| Index | Protocol name | Display name | Strip-U rule before |
| --- | --- | --- | --- |
| 197 | UBTC | BTC | BTC |
| 221 | UETH | ETH | ETH |
| 254 | USOL | SOL | SOL |
| 269 | UFART | FARTCOIN | FART |
| 268 | USDT0 | USDT | USDT |
| 292 | HPENGU | PENGU | HPENGU |
| 297 | XAUT0 | XAUT | XAUT |
| 299 | UPUMP | PUMP | PUMP |
| 26 | PUMP | PUMP-26 | PUMP |
| 19 | ANSEM | ANSEM-19 | ANSEM |
| 293 | PAIR | PEAR | PAIR |
| 71 | PEAR | PEAR-71 | PEAR |
| 844 | UANSEM | ANSEM | ANSEM |
| 319 | UUUSPX | SPX | SPX |
| 320 | UBONK | BONK | BONK |
| 246 | WMNT | MNT | WMNT |
| 343 | UXPL | XPL | XPL |
| 361 | UDZ | 2Z | DZ |
| 338 | UENA | ENA | ENA |
| 164 | MON | MONPRO | MON |
| 383 | UMON | MON | MON |
| 395 | MMOVE | MOVE | MMOVE |
| 419 | UZEC | ZEC | ZEC |
| 437 | HSEI | SEI | HSEI |
| 443 | UVIRT | VIRTUAL | VIRT |
| 451 | UAVAX | AVAX | AVAX |
| 513 | ONEAR | NEAR | ONEAR |
| 842 | HNIL | NIL | HNIL |

Tokens outside the table that the strip-U rule used to rename now keep their protocol name, as on the official terminal: `UMOG`, `USPYX`, `UWLD`, `UMEGA` and `UDOGE` on mainnet, `UBONK`, `USPY`, `UZEC` and `UVIRT` on testnet. On the full `spotMeta` of 2026-11-01 every token and pair name is unique on both networks (1,677 testnet tokens and 1,343 pairs, 511 mainnet tokens and 348 pairs).

Testnet keeps 13 of the 16 official entries. Three are left out because the token at the index carries another name on testnet (`spotMeta` 2026-11-01), so the official entry would mislabel a token or name two tokens `ENA`: `(100, PUMP, PUMP-26)` (index 100 is `AG`), `(1474, UENA, ENA)` (index 1474 is `UUENA`) and `(1397, UUENA, ENA)` (index 1397 is `UENA`).

## Rules

Implemented by `getSpotTokenDisplayNames` (`domain/market/tokens.ts`) and `createMarkets` (`lib/hyperliquid/markets/use-markets.tsx`), which reads the network from the Hyperliquid transport:

1. A token takes the table's display name when the token at that index carries the recorded protocol name; otherwise it keeps its protocol name. An entry never applies to a different token (fail closed).
2. A token outside the table whose protocol name a table entry displays is shown as `<name>-<index>`, the form the official table itself uses for `PUMP-26`, `ANSEM-19` and `PEAR-71`. On mainnet (2026-11-01) this never happens; on testnet it names `BTC-69`, `SPX-1020` and `MON-1127`. The official terminal shows both tokens with the same name there.
3. A pair is `<base display>/<quote display>` and its address is that name. Pair names are unique on both networks; if two pairs ever shared a name, both addresses would fall back to the API coin (`/trade/@N`), which still resolves.
4. A token's icon is `/coins/<display name>_spot.svg` (`USDC.svg` for USDC), as the official `Zie` builds it.
5. `getToken(name)` and `getTokenDisplayName(name)` look a token up by its protocol name first; a display name only matches when no protocol name equals it.

A token listed after the last sync shows its protocol name until the table is re-synced, and takes rule 2 if its name collides with a table name.

## Surfaces

- From the catalog (`displayName`, `shortName`, `pairName`): market selector, header and mobile market bar, ⌘K command menu, chart title and legend, order book and trade headers, order form and its notifications, swap dialog, asset information, Earn, document title.
- Protocol token names shown through `getTokenDisplayName` or `AssetDisplay isToken`: balances (desktop, phone, Portfolio), the token dropdown and labels of the swap dialog, fee tokens of fills (trade history tab, phone cards, TWAP fill history on both surfaces, the trade history page), amounts and fees of deposits and withdrawals, and the Send dialog (asset options, available balance, review, success notification). `AssetDisplay` without `isToken` resolves a coin as a market first, so a balance of the protocol token `PUMP` used to show the `PUMP` perp's name.
- CSV exports keep protocol values (`coin`, `feeToken`, ledger tokens), under the History values rule of [the toolbar design](trading-toolbar-redesign.md#history-values) that exports carry what the exchange sent. The official trade-history CSV writes display names; this terminal deliberately does not.
- Not changed, follow-ups: the accessible names `Switch to {coin} market` and the market filters of the trade-history and order-history pages name a spot market by its API coin (`@142`), as before; changing the messages needs new translations.
- The PnL share card shows positions, which are perps; the website links only to perps (`apps/website/src/data/market-structure.json`); neither carries a spot name.

## Addresses

`getTradeRouteMarketFromPath` parses the path, `TradeTerminalPage` resolves it (`getMarketByName`, `getMarketInfo`, then `findCanonicalMarketForRoute`), and `getTradeRouteRedirectPath` decides the replacement. Official evidence is the 2026-10-31 bundle (`index-CT3XnY0E.js` `Pw`/`Fw`, `config-BhZylSmU.js` `iO`, `sO`, `P8`, `b8`) and a read-only headless check of app.hyperliquid.xyz on 2026-11-01.

| Address | Official terminal | This terminal |
| --- | --- | --- |
| `/trade/PEAR/USDC` | `@1118` (`PAIR`), observed | `@1118`; before this change `@114` |
| `/trade/PUMP/USDC`, `/trade/PEAR-71/USDC` | `@188`, `@114`, observed | Same; before, `PUMP/USDC` was a duplicate and 404 |
| `/trade/hype/usdc` | Upper-cases the path unless it contains `-` or `:`, then matches display names exactly; URL becomes `/trade/HYPE/USDC` | Exact match, then a unique case-insensitive match (so `pump-26/usdc` and testnet names with lower-case letters also open); URL replaced with the display path |
| `/trade/HYPE/FOO` (quote names no token) | Opens the base against USDC (`i??mg`); URL becomes `/trade/HYPE/USDC`, observed | Same, URL replaced |
| `/trade/HYPE/PURR` (known token, no such pair) | Default market | Default market |
| `/trade/0x<base tokenId>`, `/trade/0x<base>/0x<quote>` | Resolved by token ID (`tokenIdToTokenName`, exact string); a missing or unknown quote means USDC; URL becomes the display path, observed for HYPE | Same, URL replaced; the boot-time order-book prefetch skips these addresses |
| `/trade/@107` | Default market (`e.startsWith('@')`), observed | Opens `@107` and replaces the URL with `/trade/HYPE/USDC` (deviation, see below) |
| `/trade/UBTC/USDC`, `/trade/FART/USDC` (protocol or old Sairn names) | Default market, observed | Default market |
| `/trade/FOO/USDC`, `/trade/0xdeadbeef`, `/trade/@107/USDC` | Default market (`/trade/HYPE`), observed | Default market (`/trade/BTC`, `DEFAULT_MARKET_NAME`) once the catalog is authoritative; a malformed one- or two-segment path at once; if the default market itself is missing, the not-found page |
| `/trade/pump-26/usdc` | Default market (not upper-cased because of the `-`, then no exact match), observed | Opens `PUMP-26/USDC` (case-insensitive match) |
| `/trade/FOOBAR` (no such perp) | `/trade`, showing HYPE (`b8`), observed | Default market (`/trade/BTC`) |
| `/trade/HYPE/USDH` and other USDH-quoted pairs | Default market (`Ine=['USDH']`), observed | Opens the pair (not adopted; separate decision) |
| `/trade/a/b/c` | Catch-all `Navigate` to `/trade` | Application not-found route, unchanged |

Every redirect uses replace navigation and keeps `?scope=all`; the official pushes a history entry for the default-market redirect and for a coin change.

Deviations and why:

- `@N` addresses keep working because [the route contract](architecture/trade-single-route-migration.md#route-contract) lists `/trade/%40107`, `/` redirects a spot selection to its API coin before the catalog loads, the nav Trade link does the same, and earlier duplicate pairs were linked as `/trade/@N`. They now end on the display path like every other spot address.
- The default market is this terminal's `DEFAULT_MARKET_NAME` (BTC), not the official HYPE.
- Case-insensitive matching is a superset of the official upper-casing: every address the official resolves opens the same market here, except where two display names differ only in case (none on mainnet).

Addresses whose meaning changed on mainnet (`spotMeta` 2026-11-01): `/trade/PEAR/USDC` now opens `@1118` instead of `@114`; `DZ`, `FART`, `HNIL`, `HPENGU`, `HSEI`, `MEGA`, `MMOVE`, `ONEAR`, `PAIR`, `VIRT`, `WLD` and `WMNT` against USDC used to open a market and now go to the default market; `2Z`, `ANSEM`, `ANSEM-19`, `FARTCOIN`, `MNT`, `MOG`, `MON`, `MONPRO`, `MOVE`, `NEAR`, `NIL`, `PEAR-71`, `PENGU`, `PUMP`, `PUMP-26`, `SEI`, `SPYX`, `UMEGA`, `UMOG`, `USPYX`, `UWLD` and `VIRTUAL` against USDC used to answer 404 and now open their pair.

## Re-sync and verification

The table is copied by hand; nothing fetches official assets at runtime.

1. Download the official production frontend (the `config-*.js` chunk of app.hyperliquid.xyz) and find the table: search for `l1Name:t,displayName:n`. Copy the `Mainnet` and `Testnet` `Rh(index, l1Name, displayName)` lists into `spot-token-display-names.ts` in the same order.
2. Save `spotMeta` for both networks and `meta` for mainnet, then rewrite the snapshot:

   ```bash
   curl -s https://api.hyperliquid.xyz/info -H 'Content-Type: application/json' -d '{"type":"spotMeta"}' -o mainnet-spot-meta.json
   curl -s https://api.hyperliquid-testnet.xyz/info -H 'Content-Type: application/json' -d '{"type":"spotMeta"}' -o testnet-spot-meta.json
   curl -s https://api.hyperliquid.xyz/info -H 'Content-Type: application/json' -d '{"type":"meta"}' -o mainnet-meta.json
   node scripts/spot-meta-snapshot.mjs mainnet-spot-meta.json testnet-spot-meta.json mainnet-meta.json 2026-11-01 100,1474,1397
   ```

   The last argument lists the official testnet indexes left out of the table, so the contract test can show why.
3. Run `pnpm --dir apps/terminal exec vitest run src/lib/tests/spot-token-display-names-contract.test.ts`. It fails when an entry's protocol name is not the token at that index (leave the entry out and record it above), when a display name repeats on a network, when a mainnet token would need an index suffix (the official table has not caught up with a listing; record it), or when a market's address does not resolve back to it. The other tests that pin these rules are `market-catalog`, `market-route`, `market-route-canonical` and `trade-terminal-page-boot`.
4. Check the changed names read-only on the official site (no wallet): open `/trade/<BASE>/<QUOTE>` and compare `localStorage.activeCoin` with the pair's API coin.

Risk: the official team edits its table without notice; until the next sync this terminal shows the older names and may resolve a new or renamed address differently.
