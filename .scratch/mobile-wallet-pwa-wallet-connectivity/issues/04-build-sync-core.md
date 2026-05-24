# Build Mobile Sync Core

Status: done

## Summary

Implement pure, testable modules for encrypted mobile sync payload creation, parsing, validation, encryption, decryption, expiry, and URL-fragment handling.

## Objective

Build the deep module that all mobile sync UI uses. The module should expose a small stable interface and keep crypto/payload rules out of React components.

## Dependencies

- `01-choose-wallet-connection-layer.md`
- `02-design-mobile-agent-sync.md`
- `03-define-security-model.md`

## Recommended Implementation

Use browser-native WebCrypto for encryption. Encode the encrypted payload into a URL fragment, not a query string. Require a one-time pairing code to decrypt.

## Acceptance Criteria

- Sync payloads can be encrypted and encoded for QR display.
- Sync payloads can be decoded and decrypted on phone/PWA using the pairing code.
- Expired payloads are rejected.
- Wrong-account or malformed payloads are rejected.
- Raw agent private keys never appear in query strings.
- URL cleanup helper removes the fragment after import.
- Unit tests cover success, malformed payloads, expiry, wrong account, wrong pairing code, and URL cleanup.

## Allowed Scope

- Pure utility modules.
- Unit tests.
- Minimal exports needed by later UI/agent issues.

Do not build UI in this issue.

## Verification

- Run the focused unit tests for the sync core.
- Run the relevant existing agent storage/signing tests if touched.

## Notes

Implemented:

- `apps/terminal/src/lib/mobile-sync/sync-core.ts`
- `apps/terminal/src/lib/tests/mobile-sync-core.test.ts`

The sync core now provides:

- fragment-only QR URL creation for `/mobile-agent-sync#ht-mobile-sync=...`
- WebCrypto PBKDF2-SHA-256 plus AES-256-GCM encryption/decryption
- 64-bit grouped pairing code generation and normalization
- envelope/plaintext validation for version, type, expiry, origin, env, user address, agent name, and private-key-derived agent address
- URL parsing that rejects query/path sync payloads and unknown fragment keys
- `readAndClearMobileSyncEnvelope` and `getMobileSyncCleanUrl` helpers for history-safe import cleanup

Verification run:

- `pnpm --filter @hypeterminal/terminal exec vitest run src/lib/tests/mobile-sync-core.test.ts`
- `pnpm exec biome check apps/terminal/src/lib/mobile-sync/sync-core.ts apps/terminal/src/lib/tests/mobile-sync-core.test.ts`
- `pnpm exec tsc --noEmit --target ES2022 --module ESNext --moduleResolution bundler --lib ES2022,DOM,DOM.Iterable --strict --skipLibCheck apps/terminal/src/lib/mobile-sync/sync-core.ts apps/terminal/src/lib/tests/mobile-sync-core.test.ts`

Existing agent storage/signing modules were not touched, so their focused tests were not required for this issue.

## Goal Prompt

```text
/goal Read .scratch/mobile-wallet-pwa-wallet-connectivity/PRD.md and issues 03 and 04 in .scratch/mobile-wallet-pwa-wallet-connectivity/issues. Implement only the mobile sync core module and tests. Do not build UI or Reown integration. Update issue 04 status and notes when done.
```
