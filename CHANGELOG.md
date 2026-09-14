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
  headers, answers `/_serverFn/*` with 404, answers wrong-method or unknown
  server paths with 405/404 instead of a page, and keeps
  `POST /client-error-report` as a temporary alias. Deployment health checks now also probe `/api/geo`
  with the production IPdata key. See [ADR 0005](docs/adr/0005-spa-static-shell.md).
- The same API handlers can run on an AWS Lambda function URL behind CloudFront
  (`pnpm --filter @gatu/terminal build:lambda`), and `deploy/cloudfront/` holds the
  CloudFront Functions, header policies, distribution generator and static deployment
  script for the S3 + Lambda target that retires the EC2 server. Browser `POST`
  requests to the same-origin API now carry `x-amz-content-sha256`, which CloudFront's
  signed Lambda origin requires. The first CloudFront release is live on the
  `*.cloudfront.net` domains only; `app.gatu.ai` still points at the EC2 server until
  the certificate is issued and DNS is switched. The edge now serves the shell and
  document pages from cache for a minute with background refresh, and TradingView's
  content-hashed bundles are immutable instead of revalidated on every chart load.
  The build writes the trade startup chunks into the shell as `modulepreload` links,
  the bootstrap entry prefetches `/api/geo` before the wallet runtime loads, and the
  Lambda answers `GET /api/health` for a five-minute keep-warm schedule. The shell also
  preloads the TradingView loader on desktop widths and hands surface-specific startup chunks
  and the chart iframe's main bundles to the bootstrap entry, so phones no longer download
  desktop panels or chart bundles up front; the loader is cached as immutable behind its
  commit query. Dashboard routes now hydrate against the prerendered terminal skeleton
  instead of discarding it (no more recoverable-error reports per dashboard navigation),
  the bootstrap entry stays dependency-free until the mobile credential scrub, and the
  leaderboard API is cached at the edge with a 30 s function timeout so the first load no
  longer times out.

- Repository cleanup: removed eleven modules nothing imported (three wallet icons, the
  superseded leverage control, four unused UI hooks, the close-toast helper, the
  `order-entry-calcs` re-export barrel and the unused hl-react test provider), the root
  `vercel.json` left over from the terminal's Vercel period, and moved the mobile wallet
  PWA scratch notes under `research/`. `pnpm check` is clean again (compiled Lingui
  catalogs are ignored, `createLazyComponent` no longer uses `any`) and now runs in CI.

- A stricter candidate Content-Security-Policy (image sources limited to known hosts, no
  `blob:` scripts) can be sent in report-only mode by the edge, with violations logged by a
  dedicated report receiver Lambda; the edge sends the header whenever
  `deploy/cloudfront/edge-config.json` names the receiver URL. See ADR 0007.
- The report-only policy names the prerendered pages' inline scripts by `sha256` hash instead
  of `'unsafe-inline'`: the build lists the hashes, the release writes the current and previous
  sets into the CloudFront Function, `deploy.mjs sync` refuses to upload pages the live policy
  does not allow, and `verify` checks every page against the live header. The edge enforces the
  hashed `script-src` (no `'unsafe-inline'`, no `blob:`, violations reported) and the narrowed
  `img-src` (known hosts only) since the same day; `cspScriptHashes` and `cspImageSources` in
  the edge config switch either back to report-only, and the report-only header is omitted while
  it would repeat the enforced policy. See ADR 0007 and
  [the inline script hash plan](docs/csp-inline-script-hashes-plan.md).

### Changed

- All-market statistics now arrive on the public WebSocket's compact `pac`/`sac` channels (one
  compressed frame each, about a sixth of the bytes of `allDexsAssetCtxs`/`spotAssetCtxs`) whenever
  the browser can inflate them; a stream that cannot be decoded falls back to the plain channels for
  the session and reports once. Spot contexts are matched by market name.
- The order book no longer waits for a new WebSocket connection and a subscribe round trip after
  the terminal renders: trade routes open the pooled full-book stream for the URL market while the
  market catalog loads, and the panel that subscribes next receives the freshest snapshot at once.
- The first real terminal render no longer waits on React's Suspense fallback throttle: the
  client runtime gate switches synchronously once the wallet runtime module has loaded, and the
  trade entry routes resolve every lazy piece of the first render (user menu, panels, chart,
  default positions tab, footer, overlays) while the market catalog loads. The market-loading
  workspace draws the same frame as the shell instead of empty panels.
- The prerendered application shell now draws the terminal's real frame (navigation,
  market header, order book and order-entry chrome, account tabs, footer) with `-`
  placeholders instead of an empty grid, so the first paint already looks like the terminal
  while the runtime loads. Labels are English until the localized page replaces the frame.
- The header shows `Connect Wallet` immediately for visitors without a stored Privy session;
  `Connecting...` now appears only when a session is being restored or recovery is due.

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

- The TradingView loader is served under a content-hashed file name
  (`charting_library.<hash>.js`) that the build emits and the shell preloads. The previous
  immutable `?v=<commit>` object could pin a stale library body for a year, because the edge
  cache key ignores the query string; the plain `charting_library.js` revalidates again.
- The Portfolio summary shows a dash for Max Drawdown again instead of a fabricated `0.00%`; the
  metric stays intentionally unavailable until a cash-flow-adjusted series exists.
- A wallet runtime chunk that failed to load after hydration left the static shell on screen
  forever, because the runtime gate's store snapshot did not change on failure; the loader now
  publishes every outcome as a new snapshot so the error boundary receives the failure.
- The order book's replayed first snapshot keeps its original receipt time and ignores frames of
  other coins sharing the same transport, so a replay never counts as newer than it is and cannot
  be poisoned by another market; the subscription confirmation no longer resets that time to the
  present, and the stale flag is computed when the data is committed.
- The CloudFront release keeps every inline-script hash the edge still serves:
  `deploy.mjs functions --origin <origin>` reads the live pages and retains their hashes next to
  the new build's set, so an upload that failed between two releases can no longer leave a served
  page blocked by the enforced Content-Security-Policy. `reupload` rewrites object metadata as an
  in-bucket copy instead of uploading the local body, so it cannot publish an unguarded shell.
- The CSP report receiver keeps only the origin and path of reported URLs (query strings,
  credentials and referral codes are dropped, `/join/<code>` collapses to `/join/*`), accepts at
  most ten reports per request, and meters its per-minute budget by reports instead of requests.
- The leaderboard API waits for a stale refresh inside a Lambda invocation instead of starting a
  background refresh the runtime may freeze, falling back to the stale snapshot when the refresh
  fails; the edge's stale-while-revalidate keeps responses fast.
- The shell preload injector is idempotent (a second run reproduces the same shell), the static
  startup budget closure includes the `preload-trade-terminal-surface` chunk so the shell preloads
  it, and dashboard routes no longer prefetch the desktop trade panels and chart bundles.
- The compact market-context streams are decoded as a complete snapshot followed by changed-field
  deltas that merge into one accumulated view (the first release treated every frame as complete),
  validate every consumed field, decode strictly in order with a bounded backlog, stop decoding once
  unsubscribed, reject a frame that fails before the server confirmation, reset on a transport
  disconnect so every reconnect must deliver a complete snapshot, treat any malformed delta entry as
  a format change that triggers the fallback, and keep that fallback to the plain channels for the
  whole page session; the runtime market-loading frame renders its labels through Lingui.

- The TradingView chart no longer inserts Google Analytics on the 2% of loads the vendored
  library samples: its internal feature flag `14851` is disabled in `CHART_DISABLED_FEATURES`
  (the chart Content-Security-Policy already blocked the loader). See
  [runtime guardrails §4](docs/runtime-guardrails.md).
- Zod's JIT parser is disabled before any schema exists: application and `hl-react` modules
  import Zod through `src/lib/zod.ts` and `packages/hl-react/src/zod.ts`, which switch it off
  first. Building the first object schema no longer probes `new Function`, which the edge
  Content-Security-Policy blocked and reported as an `eval` violation on every page even though
  Zod fell back to its ordinary parser.

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
