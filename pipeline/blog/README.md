# Hyperliquid Blog Pipeline

One file per blog idea. Each file is the full brief: angle, evidence, sources, draft notes — everything needed to ship that piece.

## Convention

- **One idea = one file.** Filename is a slug, e.g. `hip4-everything-exchange.md`.
- **Status lives in frontmatter** at the top of each file:
  - `status: pending` — backlog
  - `status: in-progress` — actively drafting
  - `status: published` — shipped (add the URL in the file)
  - `status: dropped` — no longer pursuing (keep file with reason)
- **New ideas:** create a new file. No central index needed beyond `ls`.
- **Done = update status to `published`** and append the live URL inside the file. Do not delete or move.
- **Research lives inside the file**, not in separate research docs. If a piece needs deep external data, cache raw outputs under `tmp/dataforseo/` and link from the file.

## Research workflow

When picking up a brief:

1. **Read the file's existing `Sources` and `Notes` sections.** Don't re-research what's already locked.
2. **Pull SEO + search-demand data via the `/dataforseo` skill.** Use it for:
   - **SERP** (`/v3/serp/google/organic/live/advanced`) — see who's already ranking for the topic, what angles they took, what's missing. Cache to `tmp/dataforseo/<slug>-serp.json`.
   - **Keyword volume** (`/v3/keywords_data/google_ads/search_volume/live`) — decide whether to optimize the title for search vs. for X/aggregator pickup. Cache to `tmp/dataforseo/<slug>-volume.json`.
   - **Google Trends** (`/v3/keywords_data/google_trends/explore/live`) — momentum check on a narrative.
3. **Fetch primary sources** (Tokenomist, DefiLlama, CoinGecko, on-chain trackers) via `WebFetch`. Quote numbers with the date you sourced them.
4. **Lock numbers in the file** under a `Locked numbers (sourced YYYY-MM-DD)` heading before drafting. Once they're frozen, the draft can be written without re-checking.
5. **Draft inline** under `Notes / draft scratch`. Keep iterations in the same file — `Draft v1`, `Draft v2`. Don't spawn separate doc files.

## Listing the backlog

```bash
# pending only
grep -l "status: pending" pipeline/blog/*.md

# everything with status
grep -H "^status:" pipeline/blog/*.md
```

## Tiers (in frontmatter `tier:`)

- **1** — 🔥 ship this week, breaking
- **2** — ⏳ sustained narrative
- **3** — 🧭 evergreen / contrarian / deep

## Global research

Search-demand reference (DataForSEO, 2026-05-03):

| Keyword | Vol/mo | Trend (MoM) |
|---|---|---|
| hyperliquid | 40,500 | +49% |
| hyperliquid price | 4,400 | +23% |
| hyperliquid api | 590 | +50% |
| hyperliquid airdrop | 320 | +56% |
| hyperliquid explorer | 320 | +50% |
| hyperliquid funding rate | 170 | +22% |

Raw cached API outputs: `./tmp/dataforseo/*.json` in repo root.

## Skip list

Don't write these — saturated or low-value:
- "Will HYPE hit $X" price-prediction posts (14+ outlets shipped this week)
- Generic "what is Hyperliquid" 101 (30+ pages compete)
- Whale-dump alerts (noise)

Last refreshed: 2026-05-03
