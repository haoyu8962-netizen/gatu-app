# Email Trading Signer and Registration

## Decision and Evidence

Ordinary email sessions use the exact authenticated Privy embedded owner
wallet to sign both Hyperliquid L1 trading actions and user-signed actions.
External wallets continue to approve a local Agent; Agent-only desktop-link
sessions continue to use their verified imported key. Agent readiness always
means a real approved Agent, not an alias for an authenticated email session.

Sources checked on 2026-09-09:

- [Hyperliquid onboarding](https://hyperliquid.gitbook.io/hyperliquid-docs/onboarding/how-to-start-trading): email OTP proceeds to deposit; external wallets separately enable trading.
- [Hyperliquid nonces and API wallets](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/nonces-and-api-wallets): L1 actions can be signed by the user or an authorized API wallet.
- [Privy typed-data signing](https://docs.privy.io/wallets/using-wallets/ethereum/sign-typed-data): provide the exact signing address.
- [Privy confirmation UI](https://docs.privy.io/recipes/react/manage-wallet-UIs): per-call `showWalletUIs` overrides provider configuration; hiding UI still produces a signature.
- [Hyperliquid SDK v0.33.3 signing](https://github.com/nktkas/hyperliquid/tree/v0.33.3/src/signing): L1 and user-signed typed-data domains differ; the L1 primary type `Agent` does not identify the actual signer.

The official terminal's publicly served `config-Bpe33jOl.js` selects the
Privy wallet directly in the email trading branch, while external wallets use
their local Agent. `index-EmwO7V05.js` disables wallet confirmation UI and signs
`acceptTerms2` after application policy acknowledgement. These are observed
frontend implementation details, not a stable public API. A fresh email login,
explicit policy acceptance and session restoration were observed without a
second wallet confirmation. No order, transfer or funding transaction was
submitted for this audit; trading signer selection was verified in public code.
No real user email address, OTP, wallet secret, authentication token or live
signature belongs in this document or regression fixtures. Tests use invented
identities and stub or fixture-generated signatures.

## Implementation Boundaries

1. Provide an explicit embedded-owner signing strategy to the shared SDK layer.
   A missing embedded signer fails closed and never falls back to an Agent or
   an unrelated browser wallet. Keep real Agent state separate from trading
   signer readiness.
2. Construct owner clients per live authenticated session, not in the global
   address-keyed Agent client cache. Bind signatures to the authenticated user,
   selected owner, active wallet, exact embedded wallet, environment and live
   provider lifetime. Revalidate before signing, after signing and at submission.
3. Preserve every shared execution guard and order scheduler. Retain the SDK's
   nonce source and serialize requests as before. Do not hand-build signatures
   or emulate official frontend signing prewarm.
4. Hide only duplicate embedded-wallet confirmations for explicit application
   actions. Policy acceptance still needs both acknowledgements; builder fees
   still require the first relevant trading action. Explicit Agent management
   and desktop-link approvals retain their own permission review and verification;
   the desktop-link dialog's reviewed approval and revocation and the API wallet
   page's reviewed authorize and remove actions pass `applicationReview:
   "confirmed"` and therefore sign without the Privy prompt.
5. Route desktop, mobile, shared trading dialogs, referrals and vault actions
   through trading signer readiness. Agent management continues to query real
   Agent approval. Preserve exact owner signing for withdrawals and other funds
   actions, including existing dedicated confirmation and environment gates.
6. Preserve Privy's email OTP registration and exact-wallet activation. Keep
   `users-without-wallets`, wallet/email login only, and no parallel registration
   form. A fresh email login may create a once-only deposit intent; restoration
   must not recreate it. Bind intent to user, owner and environment, wait for
   legal success and complete current funding snapshots, and preserve all
   existing deposit eligibility and routing requirements.

## Authentication UI Recovery

Use `usePrivy().ready` for authentication UI and `useWallets().ready` plus the
exact active owner for signing. An authenticated identity menu remains
accessible during wallet-directory initialization; an auth-ready logged-out
session can start login without waiting for the wallet directory.

After 30 seconds of unresolved authentication or an authenticated user's
unresolved wallet-directory initialization, offer an explicit **Reload
page** action; the authenticated menu uses a neutral wallet indicator until
ready. Readiness or identity changes reset the timer. Wallet reconnection
and secure disconnect remain disabled while the wallet directory is
unresolved. This application affordance is not an official SDK retry or a
reproduced Hyperliquid timeout. It uses normal Privy session restoration
only after the user clicks; do not automatically reload, log out, remount
the provider, mark readiness complete, sign, approve, or change funding
decisions. Do not expose raw errors or a warning banner. The synchronized
contract and Privy readiness and session references are in [trading
onboarding](trading-onboarding.md).

## Validation Matrix

- Fresh email user and returning email login; delayed embedded-wallet creation
  and activation; refresh without repeat setup or signing. Verify independent
  identity-menu access, explicit reload after 30 seconds, and timer reset on
  readiness or identity changes.
- Exact owner match, account/user/environment switch during signing, missing
  wallet, logout, provider unmount, and no fallback to a stored Agent.
- L1 order/cancel/leverage selection; user-signed builder fee remains separate;
  legal, policy and execution invalidation guards remain effective.
- External wallet and Agent-only flows retain real registration, verification,
  persistence and cancellation behavior.
- Terms acceptance produces one silent signature only after explicit review.
- First-login deposit waits for legal, funding and geo readiness; funded, stale,
  failed, mismatched, restored and dismissed sessions do not open a deposit.
- Desktop/mobile CTA parity and shared action consumers; no real financial
  transaction is required for automated tests or browser verification.

## Implementation Map

- `use-privy-owner-signer.ts` and `privy-owner-signer.ts` select the exact Privy
  owner and apply per-call confirmation settings. `HyperliquidOwnerSignerBridge`
  supplies that strategy without remounting the authentication provider.
- `owner-signer-provider.tsx` binds the current session;
  `owner-signer-client.ts` shares its guarded SDK client across actions.
  `useTradingStatus` reports signer readiness separately from Agent approval.
- `useTradingGuard` resumes an action only from its explicit, successful
  authorization promise and the same live session. Readiness changes cannot
  execute a retained action.
- `useExplicitTermsAcceptance` preserves the application policy review and
  rechecks the same signing session before the final `acceptTerms2` request.
- `PrivyLoginMethodObserver` records the fresh-login intent;
  `TradingOnboardingGate` consumes it after the legal gate and account checks.
  Deposit routing and sponsored submission checks remain in the existing
  deposit flow.

The owner signer/status and trading-guard tests exercise the real Hyperliquid
SDK against a stub transport, including L1 order/cancel/leverage and
user-signed builder approval. Privy signer tests verify exact address selection,
silent per-call UI and invalidation on session changes. Observer/onboarding
tests render the login and funding transitions, including delayed wallets,
failed snapshots and dismissed deposits.

## Verification Record — 2026-09-09

- The complete terminal suite (`pnpm --dir apps/terminal exec vitest run
  --maxWorkers=4`) passed: 504 files and 5,036 tests; the opt-in long-running
  WebSocket soak test was skipped. The final run includes the adapted builder
  status and client-root theme mocks as well as the new signing regressions.
- `@sairn/hl-react` and terminal typechecks passed. Biome passed for all changed
  TypeScript files.
- The complete production build passed using Node 22.15.0 and the fixed build
  identity from `terminal-performance-baseline.md`. It verified 379 client
  chunks without circular static imports. Total client gzip was 3,110,380 B,
  44,327 B below the existing baseline; static trade startup was 1,553,948 B,
  with mobile/desktop increments of 111,258 B and 198,270 B. No budget or
  dependency version was changed.
- At `localhost:3006/trade/HYPE`, a fresh anonymous browser loaded desktop and
  390 × 844 mobile layouts, switched Market/Limit, opened the desktop Privy
  directory, and followed mobile Connect → Email. The mobile drawer closed
  before the Privy email form appeared. No runtime errors were captured.
- Read-only inspection of the existing local authenticated email session
  showed account data and the ordinary order form without an Agent onboarding
  dialog. Existing form values and positions were left untouched.
- Browser verification did not submit an order, transfer, withdrawal, builder
  approval or new Agent approval. The new signed-action paths were exercised
  with the real SDK and stub transport in automated tests.


## Mobile Agent QR client-only transfer (payload v4)

Optional Link mobile device moves the desktop-approved Agent key to the phone without any server state ([ADR 0015](adr/0015-link-device-alignment.md) D7 option B and D8; [simplification plan](link-mobile-device-simplification-plan.md)). The desktop dialog has one instruction, one warning and one action: the exact owner approves a `Mobile valid_until <ms>` Agent (30 days) with a single explicit click, holds for 2 seconds to reveal (the button counts down), and the QR closes after 60 seconds, on window blur or when the page is hidden. The QR is a same-origin `/mobile-agent-sync` link whose fragment carries the plain JSON payload (version 4: network, owner, Agent key, Agent expiry, creation time and a 2-minute expiry). The fragment never leaves the browser, and encrypting it with a key carried in the same link would not protect against anyone holding the link, so the payload is not encrypted; there is no server ticket, draft storage, duplicate check or desktop `extraAgents` polling.

The phone parses the fragment before its first paint and removes it from the address bar. It refuses a payload for another network, an expired payload, one created ahead of the phone beyond the 60-second clock skew, and any older envelope version (answered with a refresh-both-devices message on the import page and in the in-app scanner). It imports only on an explicit tap: one exact `extraAgents` verification of address, name base and `validUntil`, then registration-epoch capture, persistence in the local storage scope, owner activation and verification, with the existing epoch-aware rollback on failure. A reload after the scrub asks for a new scan; an unreachable verification reports itself and imports nothing; an unapproved key keeps the loaded link for a retry.

These limits bind honest clients only: anyone who obtains the complete QR or URL (a screenshot, a photo, or a system-camera scan that leaves the URL in browser history or history sync) holds the Agent private key until the Agent expires (30 days) or the owner replaces it by approving again or removes it from the API wallet page. The in-app scanner opens the link itself and is the recommended path. Reveal, import, verification and refresh never sign or approve a builder fee. Explicit Mobile Agent approval still requires the exact master on desktop; the importing phone does not connect the master or enter a pairing code. Ordinary email trading continues to use the exact active Privy embedded owner without generating an Agent.

The transfer works on the static CloudFront + S3 host; `/mobile-agent-sync-ticket` no longer exists (the viewer-request function and the Lambda handler answer 404). The single build flag `VITE_MOBILE_PAIRING_ENABLED` defaults off and must stay off in production until the [physical-device checklist](mobile-phone-access-device-validation.md) has been run and recorded.
