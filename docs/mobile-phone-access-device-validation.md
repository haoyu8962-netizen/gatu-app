# Mobile Phone Access Device Validation

Updated: 2026-09-18. Protocol: client-only transfer, envelope v3, draft v1 ([ADR 0015](adr/0015-link-device-alignment.md) D7, option B; [plan](mobile-sync-ticketless-transfer-plan.md)). There is no pairing server endpoint.

> **Revised 2026-09-18.** The former ticket-API field, the 409/410 and server-restart cases and the EC2 `prepare` / `promote` workflow were removed with the ticket endpoint. Every row below remains Not run; nothing in this template has been executed on a physical device.

## Release Rule

All 11 physical rows remain **Not run**. Automation and simulated cameras cannot mark them Pass. These rows are mandatory before either pairing build flag (`VITE_MOBILE_PAIRING_CREATE_ENABLED`, `VITE_MOBILE_PAIRING_IMPORT_ENABLED`) is enabled for a production build; see the acceptance list in the [implementation plan](mobile-sync-ticketless-transfer-plan.md). A release with both flags off does not need this file and does not claim device acceptance. Production is served by CloudFront + S3 + Lambda ([release procedure](../deploy/cloudfront/README.md)); the former EC2 [release procedure](mobile-sync-production-readiness.md) is retired history.

## Required Evidence

Copy the per-row templates below to a controlled file outside the repository; keep this repository template as Not run. Build once with a fixed `GATU_RELEASE_ID`, publish that exact build to an HTTPS origin through the CloudFront release procedure, and exercise it there without rebuilding between testing and release. Read the commit, release ID and compiled gates from the published `/build-meta.json`. Record tester, time, exact commit, release ID, HTTPS origin, network, compiled gates, envelope version, device/OS/browser/wallet versions, acceptance references and a reproducible result. `node scripts/validate-mobile-phone-access-device-validation.js --file <external-file> --commit <full-40-character-SHA> --release <release-id>` checks row evidence. Record all row flags exactly as compiled. `--allow-incomplete` checks structure only.

Never record QR screenshots, URL fragments, keys, complete signatures or credential-bearing HAR files. Evidence may be redacted UI images or detailed non-sensitive notes. The imported-`syncId` record is a per-browser localStorage entry, not a physical-device identity; opener-created tabs can inherit sessionStorage.

## Setup

1. Pass targeted mobile-sync, wallet-session, onboarding, i18n, typecheck and production-build checks. On the published origin confirm that `/build-meta.json` reports the tested commit, release ID and gates, that `/mobile-agent-sync` serves the application shell and that `/mobile-agent-sync-ticket` answers 404. Record the actual tested build metadata.
2. Use an independent HTTPS staging origin accessible to both devices, the exact same origin on desktop and phone, and an isolated Hyperliquid **Testnet** owner. Mainnet and testnet production origins share one build; flags are not network-specific. Do not reuse a production Agent slot for tests.
3. On desktop connect the exact master through Privy, explicitly approve the Mobile Agent, verify its name/address/validUntil through owner Info, then reveal the QR. Reveal, import, reload and recovery must not sign and must not call any pairing server endpoint. No builder-fee approval belongs in Agent registration.
4. The phone parses and scrubs the fragment, verifies the owner/Agent/network, and waits for explicit Import. It does not need a pairing code or master-wallet login. Test sessionStorage default and explicit Stay Connected persistence separately.
5. Prepare Coinbase Wallet, MetaMask and a WalletConnect-compatible wallet through the Privy directory. Ordinary email trading uses the exact embedded owner and must not generate a Mobile/ordinary Agent as a side effect.
6. Record only non-sensitive approval outcomes and version information. After a QR is rendered the desktop recovery key is cleared; replacement may require a new explicit approval. Never assume retries always reuse an in-memory key.

## Build Identity

Copy this table into the external evidence file exactly once. Fill values from the published `/build-meta.json`; copy the full SHA and matching release ID into every row. Keep reviewed evidence outside Git. The table proves consistency, not that physical testing occurred. Reviewers remain responsible for the actual test record.

| Field | Value |
| --- | --- |
| Schema | 2 |
| Git commit | <full 40-character build SHA> |
| Release ID | <build release ID> |
| Envelope version | 3 |
| Mobile create gate | <build-meta mobileSync.createAndReveal> |
| Mobile import gate | <build-meta mobileSync.importFromQr> |

## Required Device Matrix

| ID | Device and browser | Required result | Status | Evidence |
| --- | --- | --- | --- | --- |
| RD-1 | iOS Safari via native Camera app | Phone-access QR opens the clean route and waits for explicit Import. | Not run | |
| RD-2 | iOS Safari | Reload retains the bounded draft; an expired or already-imported QR clears the draft without activating access. | Not run | |
| RD-3 | Installed iOS PWA | PWA and browser contexts remain isolated; cancel and background recovery never import or sign automatically. | Not run | |
| RD-4 | iOS Chrome | Desktop-approved Agent imports without phone owner login or pairing code; owner and remote approval match. | Not run | |
| RD-5 | Android Chrome | Desktop-approved Agent imports without phone owner login or pairing code; owner and remote approval match. | Not run | |
| RD-6 | iOS wallet in-app browser, if supported | Explicit import works or unsupported behavior is documented with a working external-browser path. | Not run | |
| RD-7 | Physical phone camera in Link Desktop scanner | Real Agent QR scans within the viewport; cancel, denied or pending camera permission and background cleanup release all tracks. | Not run | |
| RD-8 | Physical phone Link Desktop scanner | WalletConnect, expired, foreign-origin and unsupported QRs fail closed with actionable feedback. | Not run | |

## Target Wallet Coverage

| ID | Wallet connector | Required result | Status | Evidence |
| --- | --- | --- | --- | --- |
| TW-1 | Coinbase Wallet | Privy reconnect activates the exact owner; desktop Mobile approval matches; ordinary mobile trading keeps its signing contract. | Not run | |
| TW-2 | MetaMask | Privy reconnect activates the exact owner; desktop Mobile approval matches; ordinary mobile trading keeps its signing contract. | Not run | |
| TW-3 | WalletConnect-compatible wallet used by the product team | Privy same-phone WalletConnect handoff returns to the exact owner; no parallel application wallet scanner is required. | Not run | |

## Matrix Update Rules

Preserve every required ID, matrix description and evidence field. Pass requires real-device observations, complete notes and exact acceptance references. Unsupported RD-6 may pass only with demonstrated fail-closed behavior and a verified external-browser route. Replace stale evidence after code changes. Before enabling either pairing build flag for production, run the validator without `--allow-incomplete`; failed or missing rows block enabling the flags. A release with both flags off follows the ordinary automated checks described in the Release Rule above.

## Acceptance Coverage Map

| PRD acceptance | Required physical evidence |
| --- | --- |
| Acceptance 1: fragment scrub and explicit Import | RD-1, TC-1 |
| Acceptance 2: bounded draft and idempotent retry | RD-2, TC-2 |
| Acceptance 3: exact identity and lifecycle preservation | RD-3, RD-6, TW-1–TW-3, TC-3 |
| Acceptance 4: verified Agent import without phone master signing | RD-4, RD-5, TC-4 |
| Acceptance 5: wrong/expired/foreign QR rejection | RD-8, TC-6 |
| Acceptance 6: camera viewport, cancellation and resource cleanup | RD-7, TC-6 |
| Acceptance 7: Privy same-phone external wallets and email contract | TW-3, TC-3; email check below |
| Acceptance 8: automated and production artifact checks | Setup step 1, published `build-meta.json` |

## Test Cases

### TC-1: Native Camera Opens Agent QR

On desktop verify the owner against the active signing wallet, approval and Hyperliquid owner Info. Scan its approved QR on the phone: confirm network, clean address bar and explicit Import, with no automatic activation or signature. The phone does not display the owner before Import; after explicit Import, verify that the resulting account and remotely approved Agent match the desktop owner. Cancel and verify draft removal. Repeat direct load, SPA navigation and expired QR. After a native-camera import, inspect the phone browser history (and a second signed-in device when history sync is enabled) and record whether the complete QR URL was retained there; the in-app scanner never navigates to the QR URL.

### TC-2: Draft, Retry and Duplicate Import

The phone tester performs reload and explicit retries; a separate operator controls the network fault. Within the envelope lifetime (2 minutes) reload the same tab and retry after simulated network loss: a network failure while Hyperliquid approval is being verified retains the bounded draft, an expired envelope does not. After a successful import, open the same QR again in the same phone browser: Import is refused as already imported and only the current draft is cleared. A second phone that scans the same QR within the envelope lifetime is **not** rejected; that property was given up together with the ticket endpoint (ADR 0015 D7), so verify instead that desktop revocation removes that access. A QR produced by an older page (envelope v2) is rejected with the refresh-both-devices message on the import page and in the in-app scanner. A QR whose creation time is ahead of the phone beyond one minute is refused with the check-date-and-time message. With unavailable storage fail closed. Do not copy actual QR credentials into test artifacts.

### TC-3: Identity, PWA and Wallet Lifecycle

For RD-3 test installed iOS PWA and browser context boundaries, refresh, cancellation, background/foreground and pending Import. Test Android installed PWA as additional coverage. For RD-6 test the wallet browser or document the unsupported restriction and working external browser. For TW rows reconnect through Privy, verify the active account matches exactly, approve Mobile on desktop, and return without switching identities. Switch owner/logout during a pending reveal or import: late results cannot reveal, persist or activate. Verify ordinary external-wallet trading and email embedded-owner trading maintain their separate legal/signer/funding gates; email login, status checks and refresh never sign or generate an Agent.

### TC-4: Explicit Import and Cleanup

Use iOS Chrome and Android Chrome. Verify approved remote name/address/validUntil using owner Info. Import without phone master login or pairing code. Check session-only default and opted-in persistent storage, post-write verification and epoch-aware rollback on failure. Exercise exact expiry, unavailable Info and replaced Agent: none can activate. Do not place trades or move funds for this test.

### TC-6: Physical Camera and Wrong QR

On a real phone scan an Agent QR in Link Desktop. Keep cancel/back visible. Exercise permission denied, permission left unanswered, unavailable camera, background/return and cancellation while camera startup is pending; all streams eventually stop. WalletConnect `wc:`, expired, foreign-origin and unsupported codes show actionable rejection; do not silently navigate or connect another wallet. Re-enter scanning and verify a fresh stream works.

## Evidence Sections

### RD-1 Evidence

| Field | Value |
| --- | --- |
| Tester | <tester name> |
| Date and time | <YYYY-MM-DDTHH:mm:ssZ> |
| Git commit | <7-40 character commit hash> |
| Release ID | <verified build release ID> |
| Envelope version | 3 |
| Mobile create gate | true |
| Mobile import gate | true |
| App origin | <https://preview.example> |
| Environment | Testnet |
| Device model | <device model> |
| OS version | <OS version> |
| Browser or wallet app | <browser or wallet app> |
| Wallet connector | <wallet connector or N/A - reason> |
| Related test case | TC-1 |
| Related PRD acceptance | Acceptance 1 |
| Result | <Pass or Fail> |
| Evidence | <screenshot, recording, artifact link, or detailed notes reference> |

Notes:
- Observed route or scanner state: <what was visible on the phone>
- Wallet handoff behavior: <what happened when leaving and returning to the browser>
- Temporary draft cleanup or persistence: <what persisted or cleared>
- Screenshot or recording reference: <artifact name or URL>

### RD-2 Evidence

| Field | Value |
| --- | --- |
| Tester | <tester name> |
| Date and time | <YYYY-MM-DDTHH:mm:ssZ> |
| Git commit | <7-40 character commit hash> |
| Release ID | <verified build release ID> |
| Envelope version | 3 |
| Mobile create gate | true |
| Mobile import gate | true |
| App origin | <https://preview.example> |
| Environment | Testnet |
| Device model | <device model> |
| OS version | <OS version> |
| Browser or wallet app | <browser or wallet app> |
| Wallet connector | <wallet connector or N/A - reason> |
| Related test case | TC-2 |
| Related PRD acceptance | Acceptance 2 |
| Result | <Pass or Fail> |
| Evidence | <screenshot, recording, artifact link, or detailed notes reference> |

Notes:
- Observed route or scanner state: <what was visible on the phone>
- Wallet handoff behavior: <what happened when leaving and returning to the browser>
- Temporary draft cleanup or persistence: <what persisted or cleared>
- Screenshot or recording reference: <artifact name or URL>

### RD-3 Evidence

| Field | Value |
| --- | --- |
| Tester | <tester name> |
| Date and time | <YYYY-MM-DDTHH:mm:ssZ> |
| Git commit | <7-40 character commit hash> |
| Release ID | <verified build release ID> |
| Envelope version | 3 |
| Mobile create gate | true |
| Mobile import gate | true |
| App origin | <https://preview.example> |
| Environment | Testnet |
| Device model | <device model> |
| OS version | <OS version> |
| Browser or wallet app | <browser or wallet app> |
| Wallet connector | <wallet connector or N/A - reason> |
| Related test case | TC-3 |
| Related PRD acceptance | Acceptance 3 |
| Result | <Pass or Fail> |
| Evidence | <screenshot, recording, artifact link, or detailed notes reference> |

Notes:
- Observed route or scanner state: <what was visible on the phone>
- Wallet handoff behavior: <what happened when leaving and returning to the browser>
- Temporary draft cleanup or persistence: <what persisted or cleared>
- Screenshot or recording reference: <artifact name or URL>

### RD-4 Evidence

| Field | Value |
| --- | --- |
| Tester | <tester name> |
| Date and time | <YYYY-MM-DDTHH:mm:ssZ> |
| Git commit | <7-40 character commit hash> |
| Release ID | <verified build release ID> |
| Envelope version | 3 |
| Mobile create gate | true |
| Mobile import gate | true |
| App origin | <https://preview.example> |
| Environment | Testnet |
| Device model | <device model> |
| OS version | <OS version> |
| Browser or wallet app | <browser or wallet app> |
| Wallet connector | <wallet connector or N/A - reason> |
| Related test case | TC-4 |
| Related PRD acceptance | Acceptance 4 |
| Result | <Pass or Fail> |
| Evidence | <screenshot, recording, artifact link, or detailed notes reference> |

Notes:
- Observed route or scanner state: <what was visible on the phone>
- Wallet handoff behavior: <what happened when leaving and returning to the browser>
- Temporary draft cleanup or persistence: <what persisted or cleared>
- Screenshot or recording reference: <artifact name or URL>

### RD-5 Evidence

| Field | Value |
| --- | --- |
| Tester | <tester name> |
| Date and time | <YYYY-MM-DDTHH:mm:ssZ> |
| Git commit | <7-40 character commit hash> |
| Release ID | <verified build release ID> |
| Envelope version | 3 |
| Mobile create gate | true |
| Mobile import gate | true |
| App origin | <https://preview.example> |
| Environment | Testnet |
| Device model | <device model> |
| OS version | <OS version> |
| Browser or wallet app | <browser or wallet app> |
| Wallet connector | <wallet connector or N/A - reason> |
| Related test case | TC-4 |
| Related PRD acceptance | Acceptance 4 |
| Result | <Pass or Fail> |
| Evidence | <screenshot, recording, artifact link, or detailed notes reference> |

Notes:
- Observed route or scanner state: <what was visible on the phone>
- Wallet handoff behavior: <what happened when leaving and returning to the browser>
- Temporary draft cleanup or persistence: <what persisted or cleared>
- Screenshot or recording reference: <artifact name or URL>

### RD-6 Evidence

| Field | Value |
| --- | --- |
| Tester | <tester name> |
| Date and time | <YYYY-MM-DDTHH:mm:ssZ> |
| Git commit | <7-40 character commit hash> |
| Release ID | <verified build release ID> |
| Envelope version | 3 |
| Mobile create gate | true |
| Mobile import gate | true |
| App origin | <https://preview.example> |
| Environment | Testnet |
| Device model | <device model> |
| OS version | <OS version> |
| Browser or wallet app | <browser or wallet app> |
| Wallet connector | <wallet connector or N/A - reason> |
| Related test case | TC-3 |
| Related PRD acceptance | Acceptance 3 |
| Result | <Pass or Fail> |
| Evidence | <screenshot, recording, artifact link, or detailed notes reference> |

Notes:
- Observed route or scanner state: <what was visible on the phone>
- Wallet handoff behavior: <what happened when leaving and returning to the browser>
- Temporary draft cleanup or persistence: <what persisted or cleared>
- Screenshot or recording reference: <artifact name or URL>

### RD-7 Evidence

| Field | Value |
| --- | --- |
| Tester | <tester name> |
| Date and time | <YYYY-MM-DDTHH:mm:ssZ> |
| Git commit | <7-40 character commit hash> |
| Release ID | <verified build release ID> |
| Envelope version | 3 |
| Mobile create gate | true |
| Mobile import gate | true |
| App origin | <https://preview.example> |
| Environment | Testnet |
| Device model | <device model> |
| OS version | <OS version> |
| Browser or wallet app | <browser or wallet app> |
| Wallet connector | <wallet connector or N/A - reason> |
| Related test case | TC-6 |
| Related PRD acceptance | Acceptance 6 |
| Result | <Pass or Fail> |
| Evidence | <screenshot, recording, artifact link, or detailed notes reference> |

Notes:
- Observed route or scanner state: <what was visible on the phone>
- Wallet handoff behavior: <what happened when leaving and returning to the browser>
- Temporary draft cleanup or persistence: <what persisted or cleared>
- Screenshot or recording reference: <artifact name or URL>

### RD-8 Evidence

| Field | Value |
| --- | --- |
| Tester | <tester name> |
| Date and time | <YYYY-MM-DDTHH:mm:ssZ> |
| Git commit | <7-40 character commit hash> |
| Release ID | <verified build release ID> |
| Envelope version | 3 |
| Mobile create gate | true |
| Mobile import gate | true |
| App origin | <https://preview.example> |
| Environment | Testnet |
| Device model | <device model> |
| OS version | <OS version> |
| Browser or wallet app | <browser or wallet app> |
| Wallet connector | <wallet connector or N/A - reason> |
| Related test case | TC-6 |
| Related PRD acceptance | Acceptance 5 |
| Result | <Pass or Fail> |
| Evidence | <screenshot, recording, artifact link, or detailed notes reference> |

Notes:
- Observed route or scanner state: <what was visible on the phone>
- Wallet handoff behavior: <what happened when leaving and returning to the browser>
- Temporary draft cleanup or persistence: <what persisted or cleared>
- Screenshot or recording reference: <artifact name or URL>

### TW-1 Evidence

| Field | Value |
| --- | --- |
| Tester | <tester name> |
| Date and time | <YYYY-MM-DDTHH:mm:ssZ> |
| Git commit | <7-40 character commit hash> |
| Release ID | <verified build release ID> |
| Envelope version | 3 |
| Mobile create gate | true |
| Mobile import gate | true |
| App origin | <https://preview.example> |
| Environment | Testnet |
| Device model | <device model> |
| OS version | <OS version> |
| Browser or wallet app | <browser or wallet app> |
| Wallet connector | Coinbase Wallet |
| Related test case | TC-3 |
| Related PRD acceptance | Acceptance 3 |
| Result | <Pass or Fail> |
| Evidence | <screenshot, recording, artifact link, or detailed notes reference> |

Notes:
- Observed route or scanner state: <what was visible on the phone>
- Wallet handoff behavior: <what happened when leaving and returning to the browser>
- Temporary draft cleanup or persistence: <what persisted or cleared>
- Screenshot or recording reference: <artifact name or URL>

### TW-2 Evidence

| Field | Value |
| --- | --- |
| Tester | <tester name> |
| Date and time | <YYYY-MM-DDTHH:mm:ssZ> |
| Git commit | <7-40 character commit hash> |
| Release ID | <verified build release ID> |
| Envelope version | 3 |
| Mobile create gate | true |
| Mobile import gate | true |
| App origin | <https://preview.example> |
| Environment | Testnet |
| Device model | <device model> |
| OS version | <OS version> |
| Browser or wallet app | <browser or wallet app> |
| Wallet connector | MetaMask |
| Related test case | TC-3 |
| Related PRD acceptance | Acceptance 3 |
| Result | <Pass or Fail> |
| Evidence | <screenshot, recording, artifact link, or detailed notes reference> |

Notes:
- Observed route or scanner state: <what was visible on the phone>
- Wallet handoff behavior: <what happened when leaving and returning to the browser>
- Temporary draft cleanup or persistence: <what persisted or cleared>
- Screenshot or recording reference: <artifact name or URL>

### TW-3 Evidence

| Field | Value |
| --- | --- |
| Tester | <tester name> |
| Date and time | <YYYY-MM-DDTHH:mm:ssZ> |
| Git commit | <7-40 character commit hash> |
| Release ID | <verified build release ID> |
| Envelope version | 3 |
| Mobile create gate | true |
| Mobile import gate | true |
| App origin | <https://preview.example> |
| Environment | Testnet |
| Device model | <device model> |
| OS version | <OS version> |
| Browser or wallet app | <browser or wallet app> |
| Wallet connector | WalletConnect |
| Related test case | TC-3 |
| Related PRD acceptance | Acceptance 3, Acceptance 7 |
| Result | <Pass or Fail> |
| Evidence | <screenshot, recording, artifact link, or detailed notes reference> |

Notes:
- Observed route or scanner state: <what was visible on the phone>
- Wallet handoff behavior: <what happened when leaving and returning to the browser>
- Temporary draft cleanup or persistence: <what persisted or cleared>
- Screenshot or recording reference: <artifact name or URL>


## Post-Run Cleanup

Explicitly revoke the isolated test Agent from the exact master and verify removal via owner Info. Clear test drafts and generated test keys, close test browser/PWA contexts and verify camera tracks are stopped. Retain only redacted evidence and build metadata. Record unknown revocation outcomes until reconciled; never mark them successful on a timeout.
