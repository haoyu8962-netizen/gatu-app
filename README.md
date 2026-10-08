# Sairn

A trading terminal for [Hyperliquid](https://hyperliquid.xyz) — perps, spot, and builder-deployed perp DEXes — with real-time market data, full order-type support, and multi-wallet / agent-wallet signing.

## Why this exists

Hyperliquid is an open blockchain, and serious users should have open-source clients and tooling they can inspect instead of relying only on closed trading interfaces. Sairn keeps the trading surface reproducible: market data, order flow, signing, wallet flows, and UI primitives live in one public monorepo.

This repo is a pnpm monorepo. `apps/terminal` is the trading product, `apps/website` is the marketing site, and `packages/*` supplies shared libraries. Start with the [documentation map](docs/README.md) for current contracts, design decisions, tutorials and work records.

## Monorepo map

```
gatu-app/
├── apps/
│   ├── terminal/                         # the web app (TanStack Start SPA shell + Vite)
│   │   └── README.md  ───────────────▶   apps/terminal/README.md
│   └── website/                          # static marketing site (Astro)
├── packages/
│   ├── hl-react/                         # @sairn/hl-react — React bindings for Hyperliquid
│   │   └── README.md  ───────────────▶   packages/hl-react/README.md
│   ├── ui/                               # @sairn/ui — design system (Base UI + Tailwind v4 + CVA)
│   │   └── README.md  ───────────────▶   packages/ui/README.md
│   └── hyperliquid-api/                  # Agent Skill for AI tools (NOT a runtime dep)
│       └── SKILL.md   ───────────────▶   packages/hyperliquid-api/SKILL.md
└── .claude/rules/                        # coding conventions — see "Conventions" below
```

**Source-shipped packages.** `hl-react` and `ui` have `"main": "./src/index.ts"` — no separate package build step. Vite transpiles and HMRs their source; run `pnpm typecheck` separately for TypeScript validation.

## How the pieces fit

```
┌──────────────────────────────────────────────────────────────────┐
│ apps/terminal                                                    │
│   React 19 + TanStack Start (SPA shell) + Vite 7 + Tailwind v4   │
│   Routes · Stores (Zustand) · Order entry · Chart · Orderbook    │
└──────────┬──────────────────────────────────────────┬────────────┘
           │ imports hooks                            │ imports primitives
           ▼                                          ▼
┌─────────────────────────────────────┐   ┌──────────────────────────────┐
│ @sairn/hl-react                     │   │ @sairn/ui                    │
│ ─ HttpTransport + WebSocketTransport│   │ ─ Base UI primitives         │
│ ─ useInfo · useSubscription         │   │ ─ CVA variants               │
│ ─ useExchange (signed actions)      │   │ ─ Tailwind v4 `@theme` tokens│
│ ─ Agent-wallet lifecycle            │   │ ─ Phosphor icons             │
│ ─ WS reliability + payload guards   │   │                              │
└─────────────┬───────────────────────┘   └──────────────────────────────┘
              │ wraps
              ▼
       @nktkas/hyperliquid  ──▶  Hyperliquid API (REST + WS)
```

- `hl-react` owns **everything about talking to Hyperliquid**: transports, hook types (info/sub/exchange), signing, agent wallets, WS reliability.
- `ui` owns **everything about how the app looks**: primitives, tokens, variants. Design-system only — no app logic.
- `terminal` composes the two into the product: routes, state, business rules, pages.

## Quick start

Prereqs: **Node 22.15+**, **pnpm 10.21+**.

```bash
git clone https://github.com/zora4523-bot/gatu-app.git
cd gatu-app
pnpm install
pnpm dev --port 3000        # runs apps/terminal at http://localhost:3000
```

Configure `VITE_PRIVY_APP_ID` before starting the app. The [local development tutorial](docs/tutorials/local-development.md) walks through configuration, expected results and an isolated fixture path without wallet credentials.

For wallet testing, use `pnpm dev:browser --port 3006` instead of `pnpm dev`.
It opens the system browser. If the server is already running, open its existing
URL in Chrome or Safari without starting another server. Embedded previews may
block Privy's external wallet iframe even when email login succeeds; see
[wallet initialization troubleshooting](docs/wallet-initialization-debugging.md).

### Root scripts

| Command | What it does |
|---|---|
| `pnpm dev --port 3000` | Dev server for `apps/terminal` at the explicit port (HMR across workspace) |
| `pnpm dev:browser --port 3006` | Start on the requested port and open the system browser; fail if that port is occupied |
| `pnpm build` | Compile terminal translations, build with Vite, check client chunk cycles and bundle budgets; excludes the marketing site |
| `pnpm serve` | Preview the built app |
| `pnpm test` | OG asset checks, terminal tests, website tests and cross-app brand tests |
| `pnpm typecheck` | TypeScript checks for hl-react, ui and terminal |
| `pnpm lint` / `format` / `check` / `fix` | Biome |
| `pnpm i18n:extract` / `i18n:compile` | Lingui catalog management |

Per-package commands live in each subpackage — see their READMEs.

## Conventions

Durable product contracts live in [AGENTS.md](AGENTS.md), the implementation map in [agent.md](agent.md), and how agents work with the operator in the [agent handbook](docs/agent-handbook.md). Coding rules live in `.claude/rules/` and apply across packages:

| File | Scope |
|---|---|
| `code-style.md` | Component structure, comment policy, hook usage (React 19 compiler → no manual `useMemo`) |
| `hyperliquid.md` | Keep Hyperliquid API strings as strings; use `big.js` only when math is needed |
| `ui-library.md` | `packages/ui` is design-system only; app components live in `apps/terminal/src/components/` |
| `design-tokens.md` | Semantic tokens only (no hex); background elevation model (sunken→base→raised→overlay) |
| `style-ui-guide.md` | Border / focus conventions |
| `ssr.md` | Module boundaries that stay safe for the build-time prerender and dev server (no `window`/`document` at import time) |
| `startup-rendering.md` | Blank-until-ready startup: empty fallback, persisted locale and fonts before the first real render |
| `git.md` | Commits: `type(scope): subject`, ≤72 chars, lowercase, imperative |

Commit types: `feat`, `fix`, `refactor`, `perf`, `style`, `test`, `build`, `ci`, `docs`, `chore`, `revert`; commitlint also requires a scope.

## Further reading

- **[Documentation map](docs/README.md)** — current designs, references, tutorials, release notes and historical material
- **[Documentation system](docs/documentation-system.md)** — document roles, review requirements and evidence boundaries
- **[Historical work index](notes/index.md)** — retained original reviews and documentation audit records; ongoing task tooling uses the project work-memory entry point
- **[apps/terminal/README.md](apps/terminal/README.md)** — app architecture, routes, directory layout, order flow
- **[packages/hl-react/README.md](packages/hl-react/README.md)** — hook taxonomy, transport layer, agent-wallet lifecycle, WS reliability internals
- **[packages/ui/README.md](packages/ui/README.md)** — design tokens, component inventory, CVA patterns
- **[packages/hyperliquid-api/SKILL.md](packages/hyperliquid-api/SKILL.md)** — Agent Skill for AI tools working with the Hyperliquid API
- **[docs/runtime-guardrails.md](docs/runtime-guardrails.md)** — runtime boundaries for wallet/agent state, funding, TradingView, mobile layout, market mapping, and WS subscriptions
- **[docs/spot-asset-information.md](docs/spot-asset-information.md)** — source, refresh, trust, and rendering boundaries for spot descriptions and social links

## License

This checkout does not contain a repository-level `LICENSE` file. The intended repository license still needs to be documented.

## Acknowledgments

- [Hyperliquid](https://hyperliquid.xyz) — the protocol
- [@nktkas/hyperliquid](https://github.com/nktkas/hyperliquid) — the TS SDK we build on
- [TanStack](https://tanstack.com), [Base UI](https://base-ui.com), [Tailwind](https://tailwindcss.com)
