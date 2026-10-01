# Sairn static OG cards

`cards.html` is the repository-owned source for the two static social cards that ship with the product:

- `terminal` → `apps/terminal/public/og-terminal-1200x630.png`
- `website` → `apps/website/public/og-website-1200x630.png`

The source intentionally excludes the position, market-pair, and stock examples from the original design handoff. Those cards contain illustrative dynamic data and are not product assets.

The template has no network dependencies. Its Barlow, Barlow Condensed, and card-specific Noto Sans SC subset are vendored in `fonts/`. The Sairn lockup and mark are inlined as the logo kit's outlined paths (`brand/svg/*/sairn-*-on-dark.svg`), so the logo needs no font; the colours are the dark theme of `brand/tokens/sairn.tokens.json`.

The Noto Sans SC subset only contains the glyphs of the Terminal card's Chinese copy (永续 · 现货交易终端, 低延迟 · 自托管 · 链上结算). New Chinese text needs a new subset from the same source, recorded in `font-sources.json`; otherwise the browser falls back to a system font and `og:check` becomes platform-dependent. Run the repository generator rather than taking a manual screenshot so the viewport, font readiness, opacity, and output paths stay consistent.

```bash
pnpm exec playwright install chromium
pnpm og:generate
pnpm og:check
```

`--generate` atomically updates the two PNGs and writes `output-manifest.json` last as the commit point. `--check` first requires exact source and deployed-output hashes from that manifest, then renders into a temporary directory, confirms both deployed files are 1200×630 and fully opaque, and allows only cross-platform font-rasterization differences. It does not modify repository files.

## Font sources

All four files are distributed under the SIL Open Font License 1.1. The full license texts are committed next to the fonts.

| Local file | Upstream | SHA-256 |
| --- | --- | --- |
| `barlow-regular-latin.woff2` | Google Fonts Barlow v13, Latin regular 400 | `7a686e76312866b7d506c103e51a829d4c96a0b4576835128d3b7b53801c095a` |
| `barlow-condensed-regular-latin.woff2` | Google Fonts Barlow Condensed v13, Latin regular 400 | `0e2a408159b32d8105bcd1a0a4d6222fcee375a84fb62703c614ce34d8bb68bb` |
| `barlow-condensed-semibold-latin.woff2` | Google Fonts Barlow Condensed v13, Latin semibold 600 | `5bc49d41f32810a114765314392332ce2acae2276635eee265a50319a12c1b49` |
| `noto-sans-sc-regular-og-subset.woff2` | Google Fonts Noto Sans SC v40, regular 400, subset for the Terminal card copy | `06c94c143ce7b1f51fc442cb4891a5237cf334fef9bdba033b41d7df45725ad6` |

The exact upstream download URLs and hashes are recorded in `font-sources.json` so the checked-in binaries can be audited without requiring the generator to access the network.
