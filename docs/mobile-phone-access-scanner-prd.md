# Mobile phone access and scanner requirements

> Correction, 2026-09-18: the server ticket (ticket API v2, envelope v2) described below was removed. Pairing became a client-only encrypted-fragment transfer with envelope v3; statements here about server issuance, ticket re-registration or proxy trust are history.
>
> Correction, 2026-09-24: the encrypted envelope, the phone draft, the duplicate check, the desktop recovery record and the revoke panel were removed with [ADR 0015](adr/0015-link-device-alignment.md) D8 ([simplification plan](link-mobile-device-simplification-plan.md)). The current protocol is a plain payload (version 4) in the URL fragment of `/mobile-agent-sync`, described in [trading onboarding](trading-onboarding.md); the acceptance criteria below were rewritten to match, and the physical checklist is now three rows.

Updated: 2026-09-11. This document replaces the retired pairing-code and application-owned WalletConnect scanner design. Current implementation uses a desktop-approved Agent QR, Privy as the wallet directory, ticket API v2, envelope v2 and draft v1.

## Product flow

The desktop connects the exact owner wallet, obtains an explicit Mobile Agent approval, verifies owner Info and reveals a short-lived QR only after server issuance. The phone scans through Link Desktop or a supported native camera, removes the fragment from the address bar, verifies the intended account/network/Agent and waits for explicit Import. The phone does not connect or sign with the master for this import.

Ordinary wallet/email login remains managed by Privy. Ordinary email trading uses the exact active embedded owner directly; login, refresh and verification never approve an Agent or builder fee. Link Desktop is an optional, fail-closed feature; missing configuration disables it.

## Acceptance criteria

1. **Acceptance 1:** A valid Agent QR opens the import page with the fragment already removed from the address bar and waits for an explicit Import.
2. **Acceptance 2:** A reload after the scrub asks for a new scan; an expired payload, one for another network, one dated ahead of the phone beyond the clock skew and any older envelope version fail closed with a message; an unreachable approval check imports nothing and an unapproved key keeps the loaded link for a retry.
3. **Acceptance 3:** Exact identity, registration epoch and lifecycle protections survive asynchronous requests, owner changes, logout, browser/PWA transitions and cancellation. No fallback wallet or late activation.
4. **Acceptance 4:** Import verifies approved Mobile name/address/validUntil and uses the existing persist/activate/verify/rollback pipeline. No phone pairing code or owner signature. Stay Connected defaults off.
5. **Acceptance 5:** Unsupported, wrong-type, wrong-origin and expired QR values fail closed with useful user-action feedback. No manual secret-paste fallback or silent wallet connection.
6. **Acceptance 6:** Physical scanner fits the viewport with cancel/back available; permission denial, pending permission, cancellation and background transitions do not leak video streams.
7. **Acceptance 7:** Privy external-wallet ordering and same-phone WalletConnect handoff remain available; exact embedded-owner email signing remains unchanged. No parallel wallet chooser/scanner.
8. **Acceptance 8:** Focused regressions, typecheck, Biome and the production build pass. Enabling pairing additionally requires the three rows of the [physical checklist](mobile-phone-access-device-validation.md) recorded for the release commit.

## Protocol and security constraints

Ticket issuance has no client-provided ID. Issued 128-bit CSPRNG IDs are scoped to origin and authenticated in the encrypted QR header. First consume expires after 60 seconds; the first consumer can retry until the original 11-minute record expires. The single-process store loses records on restart. Neither refresh nor import creates, extends or re-registers a ticket.

Only exact issue HTTP 200 with strict v2 JSON and consume HTTP 204 count as success. Deadline calculations deduct full request time and are checked before and after encryption/rendering. Old clients fail closed; v2 clients receiving incompatible responses ask users to refresh both devices.

The full QR remains a bearer credential containing the encrypted key and decryption material. This remediation prevents old-ticket re-registration; it does not prevent offline decryption or repackaging of a copied full QR. Do not log or capture the QR, fragment, signing key or full signature. Stronger confidentiality requires a separate protocol design.

## Verification and release

Use [the real-device checklist](mobile-phone-access-device-validation.md) (three rows since 2026-09-24; the earlier 11-row matrix was never run). Historical pairing-code/jsdom/scanner mock observations are not current physical acceptance evidence.

The ticket remediation plan and the EC2 production readiness procedure that this section used to cite were removed from the working tree on 2026-09-18 with the server ticket and the EC2 host (commit `5d393572` still holds them). The single build flag and its acceptance follow ADR 0015 D8 and the [simplification plan](link-mobile-device-simplification-plan.md); releases follow the [CloudFront deployment](../deploy/cloudfront/README.md). Production feature enablement is distinct from shipping with the flag off.
