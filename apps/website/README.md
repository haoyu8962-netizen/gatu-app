# @sairn/website

Marketing site served at **sairn.ai**. Built with Astro + Tailwind v4. Static output, no JS framework on the client.

The trading app lives at **app.sairn.ai** (`apps/terminal`).

## Local

```bash
pnpm --filter @sairn/website dev      # http://localhost:3010
pnpm --filter @sairn/website test     # brand and copy contracts (tests/*.test.mjs)
pnpm --filter @sairn/website build    # → dist/
pnpm --filter @sairn/website preview
```

## Deploying

The website is a static build uploaded to a private S3 bucket behind CloudFront. Follow the [website release runbook](../../deploy/website/README.md): it lists the prerequisites for the sairn.ai domain, the cache groups, the upload and invalidation commands, the post-release checks and the rollback. Nothing in it is automated.

The terminal has a separate [CloudFront + S3 + Lambda deployment workflow](../../deploy/cloudfront/README.md); its `deploy.mjs` only handles the terminal build. `vercel.json` in this directory is left over from an earlier Vercel setup and is not used by CI or the current hosting.

### Why two deployments, not one?

The terminal is a TanStack Start application with edge API endpoints. The website is fully static. Separate delivery keeps their build, runtime and caching requirements independent.

## Content rules

- Product claims must match the terminal. `tests/copy-contract.test.mjs` fails on retired claims (open source, MIT, self-hosting, a hard-coded leverage maximum such as "50×" or "up to 40×", 19+ chains, LiFi, "no accounts", "no backend", a builder fee on "every order") and requires the builder fee next to quoted trading fees.
- Images that can change (the hero screenshots) live in `src/assets/` and are imported, so Astro emits them under content-hashed `_astro/` URLs. Files in `public/` keep a fixed URL; only put files there whose URL must stay stable (favicon, social card, robots.txt).

## Design notes

- **Theme:** uses the same token system as `@sairn/ui` (a trimmed subset is inlined into `src/styles/global.css` so the website has zero workspace dependencies).
- **Type:** Inter Variable for sans-serif text and Instrument Serif for display text, defined in `src/styles/global.css`. Numbers use `tabular-nums` via the `.tabular` utility.
- **Inspiration:** [midday.ai](https://midday.ai) — single-column layout, restrained motion, every section is a short headline + one-line subtitle + one visual.
