# hypeterminal

## What this codebase does

A client-side trading terminal for [Hyperliquid](https://hyperliquid.xyz)
(perps, spot, and builder-deployed perp DEXes). Pure frontend: TanStack
Start + Vite SSR for the shell, React 19 in the browser. There is **no
application backend** — all trading actions are signed in the user's
browser (wagmi-connected wallet or a locally-generated *agent wallet*)
and submitted directly to Hyperliquid's REST/WS API. Funds and authority
live on-chain; this app never custodies anything but it does mint and
store agent-wallet private keys in `localStorage`.

Monorepo: `apps/terminal` (web app), `packages/hl-react` (Hyperliquid
bindings — transports, signing, agent-wallet lifecycle, hooks),
`packages/ui` (design system). Wraps `@nktkas/hyperliquid`.

## Auth shape

There is no server-side auth. Trust boundaries are:

- **User wallet (wagmi)** — `useConnection()` in `apps/terminal/src/providers/root.tsx` wires `WagmiProvider` → `HyperliquidProvider`. Source of the user's main signing key.
- **Agent wallets** — `packages/hl-react/src/signing/`: `l1-agent-wallet.ts` signs L1 actions, `agent-storage.ts` reads/writes the private key in `localStorage` under `hyperliquid_agent_<env>_<address>`. Keys are validated through Zod (`privateKeySchema` = `/^0x[0-9a-fA-F]{64}$/`). `useAgentRegistration` mints + registers agents with Hyperliquid.
- **Builder config** — `DEFAULT_BUILDER_CONFIG` in `apps/terminal/src/config/hyperliquid.ts` controls fee routing on every order. Treat its provenance and integrity as security-critical.
- **Network selection** — `getNetwork()` in `apps/terminal/src/lib/network.ts` picks Mainnet vs Testnet; the agent-wallet storage key is namespaced by env so a testnet/mainnet mix-up surfaces as missing-key, not silent cross-env signing.
- **Mock connectors** — `isMockConnector()` in `apps/terminal/src/lib/wallet-utils.ts` short-circuits real wallet flows. Production builds must not expose the mock path.

## Threat model

Highest-impact attackers want to (1) exfiltrate an *agent-wallet
private key* from `localStorage` (full trading authority for that
sub-account until revoked), (2) tamper with builder-fee config or
order-submission code so user trades route value to attacker-controlled
addresses, or (3) trick the user into signing a transaction on the
wrong network or against a malicious RPC. Anything that injects DOM
(XSS via third-party data, unescaped market metadata, persisted-state
hydration) is a key-exfil vector. Supply-chain compromise of
`packages/hl-react`, `@nktkas/hyperliquid`, or wagmi connectors is
near-equivalent to a direct compromise of user funds.

## Project-specific patterns to flag

- **Agent private-key handling outside `packages/hl-react/src/signing/`.** Any code that touches `localStorage` keys starting with `hyperliquid_agent_`, reads `AgentWallet.privateKey`, or constructs a viem account from raw hex *outside* this directory is suspect — these keys must never leave the signing module's surface (no logging, no telemetry, no `JSON.stringify` into RQ persisted cache).
- **TanStack Query persisted cache (`PersistQueryClientProvider` in `providers/root.tsx`).** Only queries whose key starts with `PERSISTED_QUERY_PREFIX` are dehydrated. New persisted queries that include wallet-scoped or sensitive payloads need a separate review — `localStorage` is readable by any same-origin script.
- **Builder-fee config & order construction.** Order/transfer flows in `apps/terminal/src/lib/trade/` and the exchange hooks in `packages/hl-react/src/hooks` must use `DEFAULT_BUILDER_CONFIG` (or an explicitly-passed one) — flag any hardcoded builder address, fee bps override, or `Big()` arithmetic that drops decimals on `sz`/`px`/`limitPx`.
- **SSR vs client boundaries.** Module-level `localStorage`/`window`/`navigator` access outside an `if (typeof window === "undefined")` guard, or outside `ClientOnly`/`createClientOnlyFn`, will execute on the SSR server (TanStack Start + Nitro). Server-side reads of agent storage are nonsensical and indicate a leak path.
- **External URL handling.** Explorer links (`apps/terminal/src/lib/explorer.ts`), bridge/LiFi quote results (`apps/terminal/src/lib/lifi/`, `apps/terminal/src/lib/bridge/`), and any market metadata rendered as a link need `rel="noopener noreferrer"` and a URL-scheme check — `javascript:` in an asset name or builder URL is a realistic XSS path.

## Known false-positives

- **Mock wallet plumbing** — `apps/terminal/src/lib/wallet-utils.ts` (`registerMockWallet`, `getMockWalletConfig`, `isMockConnector`) and `apps/terminal/src/lib/tests/l1-agent-signing.test.ts` are test-only. The mock connector deliberately bypasses real signing.
- **`agent-storage.ts` exporting `snapshotCache`** — Marked `@internal`, only used by tests; the in-memory cache holding private keys is intentional (matches the localStorage persistence model). Documented in-file.
- **Empty `catch {}` blocks in `agent-storage.ts` / `wallet-utils.ts`** — Intentional "silent fail" around storage access (quota, private-mode, parse errors). Not error-swallowing in a security-sensitive path.
- **`localStorage.removeItem(STORAGE_KEYS.LEGACY_METADATA)` in `providers/root.tsx`** — One-time migration cleanup, not a deletion of live data.
- **Service-worker registration in `routes/__root.tsx`** — `/sw.js` is the app's own SW (used for offline shell + asset cache), scope `/`. Not a third-party SW takeover.
