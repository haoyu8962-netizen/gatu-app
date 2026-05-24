# End To End Mobile Wallet QA

Status: blocked

## Summary

Verify the complete wallet connection and mobile sync feature across desktop, iOS, Android, and hardware-wallet-backed accounts.

## Objective

Catch integration problems that unit tests cannot cover, especially iOS deep-link/PWA behavior and hardware-wallet approval flows.

## Dependencies

- `06-integrate-headless-reown.md`
- `07-build-mobile-sync-ui.md`

## Acceptance Criteria

- iOS Safari wallet connect works.
- iOS PWA wallet connect and mobile sync import work.
- Android Chrome wallet connect works.
- Android PWA wallet connect and mobile sync import work.
- MetaMask mobile and Coinbase Wallet are manually tested.
- Ledger-backed approval path is manually tested through supported wallet software.
- Trezor-backed approval path is manually tested where available.
- Relinking a phone replaces older mobile access.
- Reset mobile access works.
- Build and test suite pass.

## Allowed Scope

- Bug fixes found during QA.
- Test and docs updates.

Avoid unrelated refactors.

## Verification

- Record manual QA results in this issue.
- Run full test/build checks before marking done.

## Implementation Notes

- Added a scoped QA fix for reset/rotation: the `Link mobile device` modal now exposes `Reset mobile access`.
- Reset uses the connected main wallet to approve a short-lived replacement `Mobile` agent and does not persist that throwaway key locally.
- Reset clears the local phone/PWA agent only when the current stored agent is a `mobile-sync` agent, so desktop local-registration agents are not deleted by this action.
- Fixed Vitest harness blockers for the full terminal test suite by keeping number-format locale resolution independent of Lingui `.po` catalog loading and by avoiding an untransformed Lingui macro default in `formatErrorForDisplay`.
- Fixed a wallet-modal crash found during local browser QA: opening `Connect Wallet` threw `regularConnectors is not defined` because the modal was still reading an old local variable after connector grouping changed. The modal now derives availability from `popular`, `other`, and `mockConnectors`.

## Automated QA Results

- Passed: `pnpm --filter @hypeterminal/terminal exec vitest run src/lib/tests/mobile-sync-core.test.ts src/lib/tests/mobile-agent-lifecycle.test.ts src/lib/tests/mobile-sync-import.test.ts src/lib/tests/wallet-utils.test.ts src/lib/tests/agent-snapshot-cache.test.ts src/lib/tests/l1-agent-signing.test.ts`
  - 6 test files passed.
  - 36 tests passed.
- Passed: `pnpm --filter @hypeterminal/terminal test`
  - 37 test files passed.
  - 199 tests passed.
  - 1 websocket soak test skipped.
- Passed: `pnpm exec biome check` on the mobile wallet, mobile sync, agent lifecycle, and test files touched by this work.
- Passed: `pnpm exec biome check apps/terminal/src/config/i18n.ts apps/terminal/src/lib/i18n.ts apps/terminal/src/stores/use-global-settings-store.ts apps/terminal/src/lib/errors.ts apps/terminal/src/components/trade/components/mobile-agent-sync-modal.tsx`
- Passed: `pnpm --filter @hypeterminal/terminal build`
- Passed: local dev-server smoke check for `http://localhost:3001/mobile-agent-sync`
  - `curl -I http://localhost:3001/mobile-agent-sync` returned `HTTP/1.1 200 OK`.
- Passed after adding the manual QA protocol: `pnpm --filter @hypeterminal/terminal exec vitest run src/lib/tests/mobile-sync-core.test.ts src/lib/tests/mobile-agent-lifecycle.test.ts src/lib/tests/mobile-sync-import.test.ts src/lib/tests/wallet-utils.test.ts`
  - 4 test files passed.
  - 24 tests passed.
- Passed after fixing the wallet-modal crash: `pnpm exec biome check apps/terminal/src/components/trade/components/wallet-modal.tsx apps/terminal/src/lib/wallet-utils.ts apps/terminal/src/lib/tests/wallet-utils.test.ts`
- Passed after fixing the wallet-modal crash: `pnpm --filter @hypeterminal/terminal build`
- Passed after adding wallet-modal regression coverage: `pnpm --filter @hypeterminal/terminal exec vitest run src/lib/tests/wallet-modal.test.tsx src/lib/tests/wallet-utils.test.ts`
  - 2 test files passed.
  - 4 tests passed.
- Passed after adding wallet-modal regression coverage: `pnpm exec biome check apps/terminal/src/lib/tests/wallet-modal.test.tsx apps/terminal/src/components/trade/components/wallet-modal.tsx apps/terminal/src/lib/wallet-utils.ts apps/terminal/src/lib/tests/wallet-utils.test.ts`
- Passed local browser smoke checks with `agent-browser`:
  - `http://localhost:3001/mobile-agent-sync` renders the missing-link import state.
  - A malformed `#ht-mobile-sync=...` fragment is removed from the address bar by the import route.
  - At a 390x844 viewport, the import route renders without visible overlap; screenshot captured at `/tmp/hypeterminal-mobile-agent-sync-390x844.png`.
  - Opening `Connect Wallet` no longer throws and shows Coinbase Wallet, WalletConnect, and the dev mock wallet.
  - Connecting the dev mock wallet exposes `Link mobile device` from the account menu, and that modal shows `Reset` plus `Create phone link`.

## Automated Coverage Notes

- Mobile sync core tests cover fragment-only sync URLs, encrypted payload round trips, wrong pairing codes, wrong origin, wrong environment, expiration, malformed payloads, history-safe fragment clearing, and absence of the raw agent private key from the URL.
- Mobile agent lifecycle tests cover first-time mobile agent approval, relinking/replacing older mobile access, stale mobile agent cleanup, local reset behavior, revocation approval payloads, and leaving non-mobile local agents intact.
- Import verification tests cover successful import readiness, wrong account, missing remote approval, wrong remote approval name, and wrong remote approval expiry.
- Wallet utility tests cover WalletConnect/Reown QR URI extraction and recent wallet persistence.
- Wallet modal regression coverage renders the connector groups with mocked wagmi connectors so an undeclared-variable crash in the modal render path fails in Vitest.

## Manual QA Status

Blocked in this environment because physical iOS/Android devices, installed mobile wallets, and hardware wallets are not available here.

- Not run: iOS Safari wallet connect.
- Not run: iOS PWA wallet connect and mobile sync import.
- Not run: Android Chrome wallet connect.
- Not run: Android PWA wallet connect and mobile sync import.
- Not run: MetaMask Mobile wallet connect and approval flow.
- Not run: Coinbase Wallet mobile connect and approval flow.
- Not run: Ledger-backed approval through Ledger Live or supported wallet software.
- Not run: Trezor-backed approval through Trezor Suite or supported wallet software.
- Not run on physical devices: relinking a phone replaces older mobile access.
- Not run on physical devices: reset mobile access works.

This issue should remain blocked until the manual device and hardware-wallet checklist above is executed and recorded.

Manual QA protocol: `../manual-qa-checklist.md`

## Goal Prompt

```text
/goal Read .scratch/mobile-wallet-pwa-wallet-connectivity/PRD.md and .scratch/mobile-wallet-pwa-wallet-connectivity/issues/08-end-to-end-qa.md. Run end-to-end verification for the completed mobile wallet feature, fix scoped bugs found during QA, and update the issue with results.
```
