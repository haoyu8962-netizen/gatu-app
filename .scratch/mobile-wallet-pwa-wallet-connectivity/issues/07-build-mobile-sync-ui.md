# Build Mobile Sync UI

Status: done

## Summary

Build the user-facing desktop and phone/PWA flows for linking a mobile device with the encrypted QR payload and pairing code.

## Objective

Let a desktop user approve a mobile agent, reveal a QR, and let the phone/PWA import and verify the agent safely.

## Dependencies

- `04-build-sync-core.md`
- `05-build-agent-rotation.md`

## Acceptance Criteria

- Desktop UI exposes "Link mobile device" from an appropriate account/wallet surface.
- Desktop flow approves or prepares the `Mobile` agent.
- Desktop shows QR only after explicit reveal.
- Desktop shows pairing code separately from the QR.
- Mobile/PWA import route reads URL fragment, asks for pairing code, decrypts, verifies, stores, and clears URL/history.
- Error states exist for expired QR, wrong code, malformed payload, wrong account, and unapproved agent.
- Mobile UI fits iPhone and Android viewports.

## Allowed Scope

- Desktop link-device UI.
- Mobile import route/view.
- QR rendering/scanning or copy-link support.
- UI tests where practical.

Do not change wallet connector architecture in this issue.

## Verification

- Run focused UI/unit tests.
- Run manual desktop-to-mobile import with a local URL if feasible.
- Verify no raw agent key appears in query string.

## Implementation Notes

- Added `Link mobile device` to the connected wallet/account menu.
- Added a desktop link-device modal that approves a `Mobile` agent, creates the encrypted sync URL, shows the pairing code separately, and only renders the QR after explicit reveal.
- Added lazy QR rendering with `qrcode` so the QR library is loaded after reveal instead of on initial account-menu load.
- Added `/mobile-agent-sync` mobile/PWA import route that reads and clears the URL fragment, asks for the pairing code, decrypts the payload, verifies the imported agent against Hyperliquid `extraAgents`, stores the agent, and shows import success/error states.
- Added import verification helper and tests for approved import, wrong account, missing remote approval, and remote name/expiry mismatch.
- Regenerated TanStack route metadata for `/mobile-agent-sync`.

## Verification Notes

- `pnpm --filter @hypeterminal/terminal exec vitest run src/lib/tests/mobile-sync-core.test.ts src/lib/tests/mobile-agent-lifecycle.test.ts src/lib/tests/mobile-sync-import.test.ts`
- `pnpm exec biome check apps/terminal/src/components/trade/components/mobile-agent-sync-modal.tsx apps/terminal/src/components/trade/header/user-menu.tsx apps/terminal/src/routes/mobile-agent-sync.tsx apps/terminal/src/lib/mobile-sync/import-verification.ts apps/terminal/src/lib/tests/mobile-sync-import.test.ts`
- `pnpm --filter @hypeterminal/terminal build`
- The sync core tests assert the sync URL is fragment-only and does not contain the raw agent private key.
- Physical desktop-to-phone QA is deferred to issue 08.

## Goal Prompt

```text
/goal Read .scratch/mobile-wallet-pwa-wallet-connectivity/PRD.md and .scratch/mobile-wallet-pwa-wallet-connectivity/issues/07-build-mobile-sync-ui.md. Build only the mobile sync UI using the sync core and agent lifecycle modules. Update the issue status and notes when done.
```
