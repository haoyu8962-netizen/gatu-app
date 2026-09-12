# @gatu/website

Marketing site served at **gatu.ai**. Built with Astro + Tailwind v4. Static output, no JS framework on the client.

The trading app lives at **app.gatu.ai** (`apps/terminal`).

## Local

```bash
pnpm --filter @gatu/website dev      # http://localhost:3010
pnpm --filter @gatu/website build    # → dist/
pnpm --filter @gatu/website preview
```

## Deploying to Vercel (apex domain)

The website's Vercel configuration points at this directory. The terminal has a separate [Node/systemd/Caddy deployment workflow](../../deploy/README.md); do not infer its deployment target from the website configuration. Domain assignments below describe the intended website setup, not a live DNS verification.

### One-time setup

1. In Vercel, **New Project** → import the same Git repo.
2. **Root Directory:** `apps/website`
3. Framework: auto-detected as Astro (or set manually).
4. Install Command: leave default — `apps/website/vercel.json` overrides it.
5. Build Command: leave default — same.
6. Output Directory: leave default — same.
7. After first deploy, **Settings → Domains** → add `gatu.ai` (apex) and `www.gatu.ai`.
8. Set the apex as the Production Domain.

### DNS

At your registrar:

- For `gatu.ai` and `www.gatu.ai`, use the exact record types and targets shown by the website project's Domains configuration. This repository does not establish the current DNS targets.
- Configure only the website domains here; terminal domain and proxy configuration belong to the [terminal deployment workflow](../../deploy/README.md).

### Why two projects, not one?

The terminal is a TanStack Start application with Nitro server endpoints. The website is fully static. Separate delivery keeps their build, runtime and caching requirements independent.

## Design notes

- **Theme:** uses the same token system as `@gatu/ui` (a trimmed subset is inlined into `src/styles/global.css` so the website has zero workspace dependencies).
- **Type:** Inter Variable for sans-serif text and Instrument Serif for display text, defined in `src/styles/global.css`. Numbers use `tabular-nums` via the `.tabular` utility.
- **Inspiration:** [midday.ai](https://midday.ai) — single-column layout, restrained motion, every section is a short headline + one-line subtitle + one visual.
