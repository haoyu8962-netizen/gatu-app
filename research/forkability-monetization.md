# Forkability & Builder Monetization

How to make HypeTerminal extremely forkable so builders can launch branded trading terminals on Hyperliquid and monetize via builder fees.

---

## Current State

HypeTerminal already has partial fork-friendliness:

- **Builder fee config** in `src/config/hyperliquid.ts` — address + fee rate (0.01%)
- **`VITE_BUILDER_ADDRESS` env var** — overrides the default builder address
- **Centralized branding** in `src/config/constants.ts` — `APP_NAME`, `SEO_DEFAULTS`, `UI_TEXT`, `GITHUB_URL`
- **CSS token system** in `src/styles.css` — all colors via variables, no hardcoded hex
- **PWA manifest** in `public/manifest.json` — app name, theme color
- **i18n support** — 6 locales via lingui

**What's missing**: a single config surface, documentation, CLI tooling, and monetization infrastructure beyond the raw builder fee.

---

## Manual Steps Builders Take Today

1. **Fork the repo** and clone locally
2. **Install dependencies** — `pnpm install`
3. **Update builder address** — edit `DEFAULT_BUILDER_CONFIG.b` in `src/config/hyperliquid.ts` or set `VITE_BUILDER_ADDRESS` in `.env`
4. **Set builder fee** — edit `DEFAULT_BUILDER_CONFIG.f` (integer, where 10 = 0.01%)
5. **Rename the app** — find and replace across multiple files:
   - `APP_NAME` in `src/config/constants.ts`
   - `PROJECT_NAME` in `src/config/hyperliquid.ts`
   - `UI_TEXT.TOP_NAV.BRAND_PREFIX` / `BRAND_SUFFIX` in `src/config/constants.ts`
   - `UI_TEXT.TRADING_AGENT.AGENT_NAME` in `src/config/constants.ts`
   - `SEO_DEFAULTS` (siteName, defaultTitle, twitterHandle, siteUrl) in `src/config/constants.ts`
   - `ROUTE_SEO` descriptions in `src/config/constants.ts`
   - `public/manifest.json` (short_name, name)
6. **Replace visual assets** — `public/favicon.ico`, `public/apple-touch-icon.png`, `public/icon.svg`, `src/logo.svg`
7. **Update colors** — edit CSS custom properties in `src/styles.css` (primary accent, scope colors, surface palette)
8. **Get WalletConnect project ID** — register at cloud.walletconnect.com, set `VITE_WALLET_CONNECT_PROJECT_ID`
9. **Get Thirdweb client ID** — register at thirdweb.com, set `VITE_THIRDWEB_CLIENT_ID`
10. **Update `GITHUB_URL`** in `src/config/constants.ts`
11. **Build and deploy** — `pnpm build` then deploy the SSR output (Node.js server via Nitro)

**Pain points**:
- Branding is scattered across 3+ files with 10+ touch points
- No validation that all branding was updated
- Theme customization requires understanding the full CSS token system
- No way to preview changes without running the dev server
- Builder fee is a raw integer — easy to misconfigure
- No guidance on deployment (Vercel, Railway, Fly, etc.)

---

## Technical Checklist

### Phase 1: Single Config Surface

- [ ] **Create `fork.config.ts`** — one file for all fork-specific settings:
  ```ts
  export const forkConfig = {
    name: "MyTerminal",
    brandPrefix: "MY",
    brandSuffix: "TERMINAL",
    url: "https://myterminal.xyz",
    github: "https://github.com/me/myterminal",
    twitter: "@myterminal",
    seoDescription: "...",
    builder: {
      address: "0x...",
      feeRate: 10, // 0.01%
    },
    walletConnect: { projectId: "..." },
    thirdweb: { clientId: "..." },
    theme: {
      primary: "oklch(0.55 0.2 260)",   // accent color
      scopePerp: "oklch(0.55 0.2 260)",
      scopeSpot: "oklch(0.55 0.2 170)",
      themeColor: "#0a0a0a",
    },
    assets: {
      favicon: "/favicon.ico",
      logo: "/logo.svg",
      appleTouchIcon: "/apple-touch-icon.png",
    },
  }
  ```
- [ ] **Wire existing constants to `fork.config.ts`** — `APP_NAME`, `PROJECT_NAME`, `SEO_DEFAULTS`, `UI_TEXT` brand strings, `DEFAULT_BUILDER_CONFIG`, manifest all read from this file
- [ ] **Generate `manifest.json` from config** at build time via Vite plugin
- [ ] **Inject CSS variables from config** — theme overrides applied via a generated CSS import or Vite define

### Phase 2: Fork CLI

- [ ] **`npx create-hypeterminal`** — interactive setup script:
  - Prompts for: app name, builder address, fee rate, primary color, wallet connect ID
  - Writes `fork.config.ts` and `.env`
  - Replaces asset placeholders
  - Runs `pnpm install && pnpm build` to validate
- [ ] **`pnpm fork:validate`** — checks all branding is customized, builder address is valid, assets exist, env vars are set
- [ ] **`pnpm fork:preview`** — generates a static HTML preview of the branded header/logo/colors without full dev server

### Phase 3: Theme System

- [ ] **Theme presets** — ship 4-5 preset color palettes (dark blue, green terminal, orange, minimal light) as importable configs
- [ ] **`fork.config.ts` theme section** accepts either a preset name or custom OKLCH values
- [ ] **Dark/light mode pairs** — ensure fork config can customize both modes
- [ ] **Font override** — allow swapping Figtree/Geist Mono for other variable fonts via config

### Phase 4: Monetization Infrastructure

- [ ] **Fee dashboard page** — `/admin` route showing:
  - Total fees earned (query Hyperliquid API for builder address transactions)
  - Volume routed through the terminal
  - Unique traders count
  - Fee rate configuration
- [ ] **Referral system** — optional `?ref=ADDRESS` query param:
  - Ref address stored in localStorage
  - Fee split logic: e.g., 60% builder / 40% referrer via Hyperliquid's native builder fee mechanism (if supported) or off-chain tracking
  - Referral stats page for referrers
- [ ] **Multi-tier builder fees** — config for different fee rates by:
  - Market type (perp vs spot vs builders-perp)
  - Volume tier (lower fees for high-volume traders)
  - Token-gated discounts (hold X token → reduced fee)
- [ ] **Fee transparency UI** — show builder fee in order confirmation:
  - Already partially done in `order-summary.tsx`
  - Add "Powered by [ForkName]" with fee rate disclosure
  - Link to builder address on explorer

### Phase 5: Deployment Templates

- [ ] **Vercel preset** — `vercel.json` with SSR config, env var mappings, build command
- [ ] **Docker** — `Dockerfile` + `docker-compose.yml` for self-hosted deployment
- [ ] **Railway / Fly.io one-click** — deploy button configs
- [ ] **GitHub Actions template** — CI/CD workflow for forked repos (build, type-check, deploy)
- [ ] **Custom domain guide** — DNS setup, SSL, manifest URL updates

### Phase 6: Plugin / Extension Points

- [ ] **Custom tabs** — allow forks to register additional position panel tabs (e.g., analytics, PnL calendar)
- [ ] **Custom header items** — configurable nav items and external links
- [ ] **Widget slots** — named insertion points in the layout where forks can mount custom React components
- [ ] **Event hooks** — `onOrderPlaced`, `onPositionOpened`, `onTradeExecuted` callbacks for forks to add custom logic (notifications, analytics, etc.)
- [ ] **Custom order types** — plugin interface for adding order type UI (e.g., chase orders, iceberg) that maps to Hyperliquid order primitives

### Phase 7: Builder Ecosystem

- [ ] **Fork registry** — optional opt-in directory of HypeTerminal forks (name, URL, builder address, fee rate)
- [ ] **Upstream sync guide** — documented process for pulling upstream updates without losing customizations (git rebase strategy, merge conflict hotspots)
- [ ] **Breaking change policy** — semver `fork.config.ts` schema; migration scripts for config changes between versions
- [ ] **Builder showcase** — landing page on hypeterminal.xyz featuring top forks by volume

---

## Monetization Models for Builders

| Model | Mechanism | Effort |
|---|---|---|
| **Builder fees** | 0.01-0.1% on every trade via Hyperliquid's native builder config | Already built — just set address |
| **Referral splits** | Share builder fee revenue with referrers who bring traders | Phase 4 — needs ref tracking |
| **Premium features** | Gate advanced tools (analytics, alerts, copy trading) behind token/NFT ownership | Phase 6 — needs plugin system |
| **White-label SaaS** | Charge projects a monthly fee to host a branded terminal for their token | Phase 5 — needs deployment automation |
| **Data/analytics** | Monetize aggregated trading data, leaderboards, or strategy insights | Independent feature work |
| **Ads / sponsorship** | Sell banner space or "featured market" slots in the market selector | Low effort — add slot in UI |

---

## Priority Order

1. **Single config surface** (Phase 1) — highest leverage, unblocks everything
2. **Fork CLI** (Phase 2) — removes friction, drives adoption
3. **Deployment templates** (Phase 5) — builders can't monetize if they can't ship
4. **Fee dashboard** (Phase 4, partial) — builders need to see their revenue
5. **Theme presets** (Phase 3) — differentiation without design skills
6. **Plugin system** (Phase 6) — long-term moat and ecosystem value
7. **Builder ecosystem** (Phase 7) — network effects

---

## Key Architectural Decisions

**Config as code, not GUI**: `fork.config.ts` is a TypeScript file, not a JSON blob. Builders get type safety, autocomplete, and can use expressions (e.g., derive SEO description from app name). Build-time validation catches errors before deploy.

**Don't abstract the SDK away**: Forks should import `@hyperliquid` SDK directly for custom features. HypeTerminal provides the trading UI shell; builders add value on top. Over-abstracting the exchange layer makes forks fragile to upstream changes.

**Keep the fork surface small**: Every file a builder must touch is a merge conflict waiting to happen. The ideal fork touches exactly one file (`fork.config.ts`) and optionally adds files in designated extension directories. Core components should never need editing for basic forks.

**Builder fee is the business model**: Hyperliquid's builder fee is the cleanest monetization — no payment infrastructure, no subscriptions, no token needed. Every trade generates revenue automatically. The entire forkability effort should optimize for "time to first builder fee earned."
