# Spot Asset Information

The terminal uses different sources for different market types:

- HIP-3 descriptions come from Hyperliquid's public `perpAnnotation` endpoint.
- Native perpetual descriptions remain project-owned local copy.
- Spot descriptions and social links are generated from a reviewed snapshot of Hyperliquid's official frontend data. Hyperliquid does not expose those spot descriptions through a documented public API.

The browser never scrapes or requests Hyperliquid frontend bundles at runtime. Refresh the checked-in spot data with:

```bash
pnpm asset-info:generate /absolute/path/to/hyperliquid_asset_info_snapshot.json
```

The generator accepts only `hyperliquid-asset-info-snapshot/v1`, imports trust-tier 1 official i18n descriptions, imports trust-tier 3 curated social links, and adds the official issuer-level X and website links to trust-tier 2 Unit-enabled spot assets. It rejects truncated descriptions and non-HTTPS external links. Runtime lookup verifies the API pair plus its underlying base and quote token names so a reused `@index` cannot display stale metadata.

Description data is loaded only when the asset information dialog opens. Social links are limited to spot markets. Desktop renders the source display name above its social links in a dedicated column between the market selector and market statistics; the mobile market bar follows the official compact layout and omits them.
