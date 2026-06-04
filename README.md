# HypeTerminal

A trading terminal for [Hyperliquid](https://hyperliquid.xyz) — perps, spot, and builder-deployed perp DEXes — with real-time market data, full order-type support, and multi-wallet / agent-wallet signing.

## Why this exists

Hyperliquid is an open blockchain, and serious users should have open-source clients and tooling they can inspect instead of relying only on closed trading interfaces. HypeTerminal keeps the trading surface reproducible: market data, order flow, signing, wallet flows, and UI primitives live in one public monorepo.

This repo is a pnpm monorepo. The `apps/terminal` web app is the product; the `packages/*` are the pieces it's built from. Each package/app has its own README with depth — this file is the map.

## Monorepo map

```
hypeterminal/
├── apps/
│   └── terminal/                         # the web app (TanStack Start + Vite + SSR)
│       └── README.md  ───────────────▶   apps/terminal/README.md
├── packages/
│   ├── hl-react/                         # @hypeterminal/hl-react — React bindings for Hyperliquid
│   │   └── README.md  ───────────────▶   packages/hl-react/README.md
│   ├── ui/                               # @hypeterminal/ui — design system (Base UI + Tailwind v4 + CVA)
│   │   └── README.md  ───────────────▶   packages/ui/README.md
│   └── hyperliquid-api/                  # Agent Skill for AI tools (NOT a runtime dep)
│       └── SKILL.md   ───────────────▶   packages/hyperliquid-api/SKILL.md
└── .claude/rules/                        # coding conventions — see "Conventions" below
```

**Source-shipped packages.** `hl-react` and `ui` have `"main": "./src/index.ts"` — no build step. The Vite dev server type-checks, transpiles, and HMRs directly from source.

## How the pieces fit

```
┌──────────────────────────────────────────────────────────────────┐
│ apps/terminal                                                    │
│   React 19 + TanStack Start (SSR) + Vite 7 + Tailwind v4         │
│   Routes · Stores (Zustand) · Order entry · Chart · Orderbook    │
└──────────┬──────────────────────────────────────────┬────────────┘
           │ imports hooks                            │ imports primitives
           ▼                                          ▼
┌─────────────────────────────────────┐   ┌──────────────────────────────┐
│ @hypeterminal/hl-react              │   │ @hypeterminal/ui             │
│ ─ HttpTransport + WebSocketTransport│   │ ─ Base UI primitives         │
│ ─ useInfo / useSub / useExchange    │   │ ─ CVA variants               │
│ ─ Agent-wallet lifecycle            │   │ ─ Tailwind v4 `@theme` tokens│
│ ─ WS reliability + payload guards   │   │ ─ Phosphor icons             │
└─────────────┬───────────────────────┘   └──────────────────────────────┘
              │ wraps
              ▼
       @nktkas/hyperliquid  ──▶  Hyperliquid API (REST + WS)
```

- `hl-react` owns **everything about talking to Hyperliquid**: transports, hook types (info/sub/exchange), signing, agent wallets, WS reliability.
- `ui` owns **everything about how the app looks**: primitives, tokens, variants. Design-system only — no app logic.
- `terminal` composes the two into the product: routes, state, business rules, pages.

## Quick start

Prereqs: **Node 20+**, **pnpm 9+**.

```bash
git clone https://github.com/your-org/hypeterminal.git
cd hypeterminal
pnpm install
pnpm dev                    # runs apps/terminal at http://localhost:3000
```

### Root scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Dev server for `apps/terminal` (HMR across workspace) |
| `pnpm build` | Lingui catalog compile + Vite production build |
| `pnpm serve` | Preview the built app |
| `pnpm test` | Vitest across the workspace |
| `pnpm lint` / `format` / `check` / `fix` | Biome |
| `pnpm i18n:extract` / `i18n:compile` | Lingui catalog management |

Per-package commands live in each subpackage — see their READMEs.

## Conventions

All project rules live in `.claude/rules/` and apply across packages:

| File | Scope |
|---|---|
| `code-style.md` | Component structure, comment policy, hook usage (React 19 compiler → no manual `useMemo`) |
| `hyperliquid.md` | Keep Hyperliquid API strings as strings; use `big.js` only when math is needed |
| `ui-library.md` | `packages/ui` is design-system only; app components live in `apps/terminal/src/components/` |
| `design-tokens.md` | Semantic tokens only (no hex); background elevation model (sunken→base→raised→overlay) |
| `style-ui-guide.md` | Border / focus conventions |
| `ssr.md` | SSR-safe module boundaries (no `window`/`document` at import time) |
| `git.md` | Commits: `type(scope): subject`, ≤72 chars, lowercase, imperative |

Commit types: `feat`, `fix`, `refactor`, `perf`, `style`, `test`, `build`, `ci`, `docs`, `chore`, `revert`, `i18n`.

## Further reading

- **[apps/terminal/README.md](apps/terminal/README.md)** — app architecture, routes, directory layout, order flow
- **[packages/hl-react/README.md](packages/hl-react/README.md)** — hook taxonomy, transport layer, agent-wallet lifecycle, WS reliability internals
- **[packages/ui/README.md](packages/ui/README.md)** — design tokens, component inventory, CVA patterns
- **[packages/hyperliquid-api/SKILL.md](packages/hyperliquid-api/SKILL.md)** — Agent Skill for AI tools working with the Hyperliquid API

## License

[MIT](LICENSE)

## Acknowledgments

- [Hyperliquid](https://hyperliquid.xyz) — the protocol
- [@nktkas/hyperliquid](https://github.com/nktkas/hyperliquid) — the TS SDK we build on
- [TanStack](https://tanstack.com), [Base UI](https://base-ui.com), [Tailwind](https://tailwindcss.com)
