# Mobile phone access and scanner requirements

Updated: 2026-09-11. This document replaces the retired pairing-code and application-owned WalletConnect scanner design. Current implementation uses a desktop-approved Agent QR, Privy as the wallet directory, ticket API v2, envelope v2 and draft v1.

## Product flow

The desktop connects the exact owner wallet, obtains an explicit Mobile Agent approval, verifies owner Info and reveals a short-lived QR only after server issuance. The phone scans through Link Desktop or a supported native camera, removes the fragment from the address bar, verifies the intended account/network/Agent and waits for explicit Import. The phone does not connect or sign with the master for this import.

Ordinary wallet/email login remains managed by Privy. Ordinary email trading uses the exact active embedded owner directly; login, refresh and verification never approve an Agent or builder fee. Link Desktop is an optional, fail-closed feature; missing configuration disables it.

## Acceptance criteria

1. **Acceptance 1:** Valid Agent QR opens a clean route and explicit Import; fragment scrubbing failure prevents import.
2. **Acceptance 2:** The bounded draft and same-tab consumer support retry while the original ticket record exists. 409/410 clear the current draft; transport failures retain it. Restart loses the ticket and rejects both consumers; no legacy registration is accepted.
3. **Acceptance 3:** Exact identity, registration epoch and lifecycle protections survive asynchronous requests, owner changes, logout, browser/PWA transitions and cancellation. No fallback wallet or late activation.
4. **Acceptance 4:** Import verifies approved Mobile name/address/validUntil and uses the existing persist/activate/verify/rollback pipeline. No phone pairing code or owner signature. Stay Connected defaults off.
5. **Acceptance 5:** Unsupported, wrong-type, wrong-origin and expired QR values fail closed with useful user-action feedback. No manual secret-paste fallback or silent wallet connection.
6. **Acceptance 6:** Physical scanner fits the viewport with cancel/back available; permission denial, pending permission, cancellation and background transitions do not leak video streams.
7. **Acceptance 7:** Privy external-wallet ordering and same-phone WalletConnect handoff remain available; exact embedded-owner email signing remains unchanged. No parallel wallet chooser/scanner.
8. **Acceptance 8:** Focused regressions, typecheck, Biome, production build and real HTTP/restart checks pass. Enabling pairing additionally requires every physical matrix row with evidence for the release commit.

## Protocol and security constraints

Ticket issuance has no client-provided ID. Issued 128-bit CSPRNG IDs are scoped to origin and authenticated in the encrypted QR header. First consume expires after 60 seconds; the first consumer can retry until the original 11-minute record expires. The single-process store loses records on restart. Neither refresh nor import creates, extends or re-registers a ticket.

Only exact issue HTTP 200 with strict v2 JSON and consume HTTP 204 count as success. Deadline calculations deduct full request time and are checked before and after encryption/rendering. Old clients fail closed; v2 clients receiving incompatible responses ask users to refresh both devices.

The full QR remains a bearer credential containing the encrypted key and decryption material. This remediation prevents old-ticket re-registration; it does not prevent offline decryption or repackaging of a copied full QR. Do not log or capture the QR, fragment, signing key or full signature. Stronger confidentiality requires a separate protocol design.

## Verification and release

Use [the real-device runbook](mobile-phone-access-device-validation.md) for TC-1–TC-6, RD-1–RD-8 and TW-1–TW-3. All 11 physical rows currently remain Not run. Historical pairing-code/jsdom/scanner mock observations are not current physical acceptance evidence.

Use [the remediation plan](mobile-sync-ticket-remediation-plan.md) and [production readiness procedure](mobile-sync-production-readiness.md) for build flags, proxy origin/IP trust, artifact evidence, the closed v2 baseline and rollback requirements. Production feature enablement is distinct from shipping the closed safety baseline.
