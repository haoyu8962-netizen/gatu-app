# Changelog

This project follows a lightweight Keep a Changelog style. Entries are grouped under `Unreleased` until a release version is cut.

## Unreleased

### Changed

- Enlarged the mobile market selector trigger, token icon, market name, and market-kind badge for better tap and scan ergonomics.
- Reworked mobile Trade and Markets layouts so long positions, orders, balances, and TWAP content can use page-level scrolling when panel-contained scrolling is too cramped.
- Updated mobile orderbook rendering to adapt the number of visible levels to the available ladder height.

### Fixed

- Bounded mobile market names so common pairs such as `HYPE-USDC` render fully while unusually long symbols fall back to truncation instead of pushing price content off-screen.
- Localized trade data tab labels and the wallet-disconnected mobile data empty state across the existing locale catalogs.
- Aligned the default mobile ticker price display with orderbook mid pricing.
- Classified additional Hyperliquid user WebSocket streams to avoid unknown-subscription reliability warnings.
- Stabilized root stylesheet placement in the document head to reduce hydration ordering mismatches.

### Notes

- The ticker and orderbook mid prices share the same default `l2Book` source, but a future follow-up should lift orderbook grouping state so the ticker can stay aligned after users change price grouping.
- SSR still renders the root document with the default `lang`/`dir`; true SSR locale parity requires a server-readable locale source such as a cookie.

### Verification

- Run `pnpm biome check` on touched files.
- Run Lingui extraction after adding or moving translatable strings.
- Manually verify 360px and 390px mobile widths, language switching, disconnected-wallet empty states, and Markets/Trade data panel scrolling.
