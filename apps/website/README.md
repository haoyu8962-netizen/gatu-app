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

The terminal already deploys from this repo's root `vercel.json` to `app.gatu.ai`. The website is a **separate Vercel project** that points at this directory.

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

- `gatu.ai` (apex) → Vercel's apex IPs (`A` record `76.76.21.21`) or ALIAS to `cname.vercel-dns.com` if your DNS supports it.
- `www.gatu.ai` → CNAME `cname.vercel-dns.com`.
- `app.gatu.ai` already points at the terminal project — leave it alone.

### Why two projects, not one?

The terminal is a TanStack Start app that needs Nitro/Vercel functions. The website is fully static. Splitting them keeps the marketing build fast (~500ms), the app deploy isolated, and lets each domain have its own caching rules.

## Design notes

- **Theme:** uses the same token system as `@gatu/ui` (a trimmed subset is inlined into `src/styles/global.css` so the website has zero workspace dependencies).
- **Type:** Inter Variable everywhere. Numbers use `tabular-nums` via the `.tabular` utility.
- **Inspiration:** [midday.ai](https://midday.ai) — single-column layout, restrained motion, every section is a short headline + one-line subtitle + one visual.
