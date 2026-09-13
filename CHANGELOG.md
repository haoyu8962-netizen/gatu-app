# Changelog

This project follows a lightweight Keep a Changelog style. Entries remain under
`Unreleased` until a release version is cut. This is a summary of repository
changes, not evidence that a build has been deployed or accepted on real devices.

## Unreleased

### Added

- Cumulative order-book depth tooltips for mouse, keyboard and touch selection,
  preserving ordinary click-to-fill and touch scrolling. See
  [order-book interaction behavior](docs/orderbook-hover.md).
- A shared Animate Orderbook preference for new-level pulses and quantity-change
  feedback across desktop and mobile. System reduced-motion settings take
  precedence. See [animation behavior](docs/orderbook-new-level-animation.md).

- The production build now also prerenders a client-rendered application shell
  (`_shell.html`) and static HTML for the document routes, and
  `pnpm --filter @gatu/terminal serve:spa` serves the client output like a CDN.
  The Nitro server remains the deployed shape; static hosting still requires a
  host that routes `/api/*` to the server handlers. See
  [ADR 0005](docs/adr/0005-spa-static-shell.md).
- Geo checks call `/api/geo` and `/api/referral-geo` and client error reports
  post to `/api/client-error-report` instead of TanStack server functions, so
  the same handlers can run on an edge runtime. `/build-meta.json` is also
  written as a static file at build time. `serve:spa --api <origin>` proxies
  the server-only paths for local end-to-end checks.
- Runtime server rendering is off: the production server answers navigations
  from the prerendered shell and document pages, keeps the route-rule security
  headers, answers `/_serverFn/*` with 404 and keeps `POST /client-error-report`
  as a temporary alias. Deployment health checks now also probe `/api/geo`
  with the production IPdata key. See [ADR 0005](docs/adr/0005-spa-static-shell.md).

### Changed

- Desktop panels retain aligned chart, market-data, order-entry and account
  boundaries during resizing. Mobile order-entry and its adjacent book grow with
  the form, with the page owning vertical scrolling. See
  [layout behavior](docs/desktop-grid-layout.md).
- Desktop and mobile order forms share draft fields and summaries. TWAP puts
  quantity before duration and groups optional trigger and price controls behind
  Advanced Settings. See [order-form parity](docs/order-entry-surface-parity.md).
- Mobile market selection has larger touch targets and bounded market names;
  long Trade and Markets data lists use page-level scrolling where appropriate.
- Headline prices use the current asset context's midpoint, falling back to its
  mark price when the midpoint is absent. The compact book uses the server
  midpoint without that fallback. See [price-source reference](docs/price-source-audit.md).
- Account summaries use consistent mode names and metric scope across desktop
  and mobile, including eligible collateral and server LTV in portfolio leverage.
  Funding forms share exact-amount handling and clearer requested-action
  feedback. See [account overview](docs/account-overview.md),
  [deposits](docs/cctp-deposits.md) and [withdrawals](docs/withdrawals.md).
- The repository, documentation, root package and the API-skill installer now
  use the `gatu` name; the installer bin is `gatu-install-hyperliquid-api-skill`.
  An orphaned `hypeterminal:recent-wallets` browser-storage entry is removed on
  startup.

### Fixed

- Reduced repeated order-queue render code so deployment builds retain more
  room under the existing trading-page bundle budget, preserving status badges,
  warning priority and individual order feedback. See
  [performance acceptance criteria](docs/terminal-performance-baseline.md#order-queue-rendering-and-deployment-headroom).
- Loading, stale and recovering data retain quiet placeholders. Empty-account
  conclusions require complete, current snapshots, while action availability
  remains independently guarded. See [mobile data presentation](docs/mobile-data-presentation.md).
- Order-book rows remain complete at changing heights; grouped and fast/full
  feeds cannot contaminate one another, and stale or cached rows cannot fill an
  order. Compact books use the incremental feed with the public fast-feed fallback.
  See [layout rules](docs/orderbook-layout.md) and
  [transport remediation](docs/terminal-review-remediation.md).
- Late order results and session changes cannot erase newer drafts. Manually
  cleared limit prices stay empty until an explicit action rearms prefill, and
  slider commits use the actual quantity. See [draft lifecycle](docs/order-draft-lifecycle.md)
  and [slider interactions](docs/slider-interactions.md).
- Email trading uses the exact active embedded owner wallet; ordinary email
  trading no longer requires local Agent registration. Legal acceptance, signer
  readiness, funding and builder-fee approval remain separate gates. See
  [email signing](docs/email-trading-signing.md) and [onboarding](docs/trading-onboarding.md).
- Locale changes update mounted presentations, and document navigation preserves
  application providers. Root stylesheet placement remains stable during hydration.
  See [translation behavior](docs/i18n-presentation.md).
- Browser fixtures use separate dependency caches, and development modules
  revalidate after graph changes. Wallet testing can open the system browser via
  `pnpm dev:browser --port 3006`. See [local development](docs/tutorials/local-development.md).
- Mobile pairing rejects ticket re-registration and protects release switches
  with verified edge gating. Standard deployment and optional strict promotion
  have distinct evidence requirements. See [production release procedure](docs/mobile-sync-production-readiness.md).

### Notes

- The price-source entry above supersedes the earlier Unreleased claim that the
  ticker and book midpoint share default `l2Book` data. Grouped ladder prices are
  not the headline-price source; lifting grouping state into the ticker is no
  longer the proposed follow-up.
- SSR starts with the default English catalog and `lang`/`dir`; the browser
  restores the persisted locale. Server-rendered locale parity still requires a
  server-readable locale source.
- Pairing flags remain off when unset. Automated protocol and release checks do
  not establish real-device camera, PWA or wallet approval success; those results
  belong in the [device validation record](docs/mobile-phone-access-device-validation.md).
