# Spot Asset Information

The terminal uses different sources for different market types:

- HIP-3 descriptions come from Hyperliquid's public `perpAnnotation` endpoint.
- Native perpetual descriptions remain project-owned local copy.
- Spot descriptions and social links are generated from a reviewed snapshot of Hyperliquid's official frontend data. Hyperliquid does not expose those spot descriptions through a documented public API.

The browser never scrapes or requests Hyperliquid frontend bundles at runtime. Refreshing the checked-in spot data also cross-checks every snapshot pair against Hyperliquid's mainnet `spotMeta` response. The generator fetches that response by default; pass a saved response as the optional second argument for a reproducible offline run:

```bash
pnpm asset-info:generate /absolute/path/to/hyperliquid_asset_info_snapshot.json
pnpm asset-info:generate /absolute/path/to/hyperliquid_asset_info_snapshot.json /absolute/path/to/spot-meta.json
```

The generator accepts only `hyperliquid-asset-info-snapshot/v1`, imports trust-tier 1 frontend descriptions, imports trust-tier 3 curated social links, and adds issuer-level X and website links to trust-tier 2 Unit-enabled spot assets. It rejects empty text, trailing-backslash artifacts, Unicode replacement characters, non-HTTPS URLs, and unauditable URL shorteners. Social destinations are classified by hostname, so only `t.me` or `telegram.me` links receive a Telegram label.

Generated records contain the base and quote token IDs from `spotMeta`. Runtime lookup requires the pair name, token names, and both token IDs to match. A reused `@index`, testnet collision, or UI remapping therefore fails closed instead of displaying stale mainnet metadata.

Description data is loaded only when the asset information dialog opens. Snapshot copy is used only when it contains the active application locale; it never replaces Hindi or Arabic text with English, nor does it fall back to an unrelated language. Unit provider copy is rendered separately from the underlying asset description. Social links are limited to spot markets and are shown in both desktop and expanded mobile market headers.

The frontend snapshot is a provenance record, not a documented Hyperliquid API contract or a license grant. Keep its source URL, retrieval timestamp, and generated hash with each refresh. Do not publish refreshed verbatim copy without confirming that the project is permitted to redistribute it; use project-owned summaries when that permission is unavailable.
