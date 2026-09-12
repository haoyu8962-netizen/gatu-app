# Run the terminal locally and verify one change

This tutorial starts from an existing checkout and ends with deterministic
order-book and browser-fixture checks. The verification path uses synthetic data
and needs no account, wallet signature, funds or environment credentials. An
optional final step opens the real application for a read-only smoke check.

## 1. Prepare the checkout

Run commands from the repository root, the directory containing
[`pnpm-workspace.yaml`](../../pnpm-workspace.yaml). Use Node **22.15 or newer** and
the package-manager version pinned in [`package.json`](../../package.json),
**pnpm 10.21.0**. The browser command below uses an installed Google Chrome by
default.

```bash
node --version
pnpm --version
pnpm install --frozen-lockfile
```

Installation should finish without changing `pnpm-lock.yaml`. The workspace
packages are consumed from source, so there is no separate package build before
the dev server. Vite transpilation does not replace the explicit TypeScript check.

## 2. Run the deterministic checks

No application dev server or `.env.local` is needed for these tests:

```bash
pnpm --dir apps/terminal exec vitest run \
  src/lib/tests/orderbook.test.ts \
  src/lib/tests/vite-cache-isolation.test.ts \
  src/lib/tests/vite-development-cache.test.ts
pnpm --dir apps/terminal test:browser:orderbook-cls
```

The first command verifies order-book arithmetic, separate fixture caches and
development module revalidation. Expect all three files to pass. The second
starts its own Vite fixture server on `127.0.0.1:4179`, runs one Chromium test and
prints a `Mobile orderbook CLS` measurement followed by a passing result. The
[test](../../apps/terminal/tests/browser/mobile-orderbook-cls.pw.ts) exercises a
412 × 823 mobile layout, rejects external HTTP requests, checks fixed row geometry
and focus preservation, and compares layout shift against explicit budgets. It
does not mount the real wallet runtime or submit orders.

If Google Chrome is unavailable, install Playwright's Chromium once and select
the configuration's CI browser path:

```bash
pnpm exec playwright install chromium
CI=1 pnpm --dir apps/terminal test:browser:orderbook-cls
```

On Linux, install the browser's OS dependencies if Playwright requests them. With
`CI=1`, port 4179 must be free; the test will not reuse an existing server. Without
it, the configuration may reuse an existing fixture server, so confirm that any
server already on 4179 belongs to this checkout and this fixture configuration.
Failure screenshots and traces go under
`apps/terminal/test-results/shared-browser/`.

Passing these checks establishes the fixture's behavior, not live Hyperliquid,
Privy login or physical-device compatibility. See the exact
[Playwright configuration](../../apps/terminal/tests/browser/playwright.config.ts)
and [mock wiring](../../apps/terminal/tests/browser/vite.config.ts).

## 3. Optionally open the real application

The real terminal mounts Privy, unlike the fixture. Create
`apps/terminal/.env.local` from
[`.env.example`](../../apps/terminal/.env.example) only if it does not already
exist; retain an existing local configuration. Fill in `VITE_PRIVY_APP_ID` with
your project's public App ID. Do not substitute an App secret or a wallet key.
All `VITE_*` values are exposed to the client build.

| Variable | Role in this tutorial |
| --- | --- |
| `VITE_PRIVY_APP_ID` | Required for the real terminal's Privy runtime; unused by the fixture above. |
| `VITE_HYPERLIQUID_TESTNET` | Optional network default; the exact string `true` selects testnet. A saved local network choice takes precedence on localhost. |
| `VITE_ETHEREUM_RPC_URL` | Optional Ethereum RPC override; unnecessary for this read-only check. |
| `IPDATA_API_KEY` | Server-only geolocation credential, with no `VITE_` prefix. Not needed for normal Vite development: development mode supplies a GB verdict. Production builds use the real server lookup. |

Leave optional trading, pairing and deposit feature gates at their existing
values; none is required for this tutorial. The complete variable list and
default behavior are in `.env.example`,
[`getNetwork`](../../apps/terminal/src/lib/network.ts),
[`Privy configuration`](../../apps/terminal/src/config/privy.ts) and
[`getGeo`](../../apps/terminal/src/lib/geo/get-geo.ts).

Start **one** application server per checkout:

```bash
pnpm dev --port 3006
```

Open `http://localhost:3006` in the system browser. Alternatively,
`pnpm dev:browser --port 3006` starts that same application and opens the browser
automatically. If a server is already running, open its existing URL. Both paths
use strict port selection; an occupied port is an error, not permission to launch
another application server from the same checkout.

The root route redirects to the selected trade market. With a valid Privy App ID
and reachable public services, expect the terminal shell and public market data
to appear. Stay disconnected for this smoke check: resize across the inclusive
1000px mobile breakpoint, change theme and language, and inspect the book and
order form. Live prices and connectivity are not deterministic assertions; use
step 2 for a reproducible pass/fail result. Stop a server you started with Ctrl+C.

## 4. Choose verification for your actual change

The fixture above is a starting point. Select the focused unit/browser suite for
the surface you changed using [`AGENTS.md`](../../AGENTS.md) and the relevant
design document. For TypeScript changes, run:

```bash
pnpm exec biome check path/to/changed-file.tsx
pnpm --filter @gatu/terminal typecheck
```

Replace the example path with the actual changed files. Root `pnpm typecheck`
also checks `@gatu/hl-react` and `@gatu/ui`. Root `pnpm test` is broader: it checks
generated OG assets, terminal and website Vitest tests, and the cross-app brand
test. `pnpm build` compiles translations, builds the terminal, then validates
client chunk cycles and the bundle budget. Use `pnpm serve` only after a
successful build when you need the Nitro runtime; it is not the fixture server.
Commands are defined in the [root scripts](../../package.json) and
[terminal scripts](../../apps/terminal/package.json).

## Troubleshooting without changing application behavior

| Symptom | Check and recovery |
| --- | --- |
| Browser executable is missing | Install Playwright Chromium and use the `CI=1` command above, or install Chrome for the default command. |
| Port 3006 or 4179 is occupied | Identify the existing server and reuse only the matching one, or stop a server you own. Do not kill unrelated processes. |
| `Outdated Optimize Dep`, HTTP 504 or a blank lazy-loaded surface | Keep one application server per checkout. Restart that server if its optimizer cache was replaced, then reload. Do not delete a running server's cache or clear wallet storage. |
| Old modules persist after restart | Temporarily disable the HTTP cache in DevTools, reload and let lazy imports complete; restore normal caching and check a normal reload. |
| Privy iframe reports `ERR_BLOCKED_BY_CLIENT` | Try the existing URL in standalone Chrome or Safari and inspect the failed request. Embedded-preview restrictions are distinct from Vite cache failures; follow [wallet initialization debugging](../wallet-initialization-debugging.md). |
| Live prices do not arrive | Check public-service connectivity; missing snapshots are not evidence of an empty account. Return to the mocked fixture to isolate rendering behavior. |

The application uses `apps/terminal/node_modules/.vite`; the shared fixture uses
the sibling `.vite-browser`. Dedicated account, mobile order-entry and user-menu
fixtures have their own sibling caches and Playwright configurations. Changing a
port or HTML root alone does not isolate an optimizer cache. Preserve these
boundaries and use the dedicated commands in
[runtime guardrails](../runtime-guardrails.md#9-development-and-browser-test-caches)
when extending verification.
