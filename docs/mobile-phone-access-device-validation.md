# Mobile Phone Access Device Validation

Updated: 2026-09-11. Protocol: ticket API v2, envelope v2, draft v1.

## Release Rule

All 11 physical rows remain **Not run**. Automation and simulated cameras cannot mark them Pass. These rows are mandatory for the optional `prepare` / `promote` workflow when pairing is enabled. Ordinary `deploy.sh main` uses automated release verification without requiring this file; it does not claim device acceptance. See the [production release procedure](mobile-sync-production-readiness.md).

## Required Evidence

Copy the per-row templates below to the controlled external file `/opt/gatu/shared/mobile-sync-evidence/<release-id>.md`; keep this repository template as Not run. Use `deploy.sh main prepare` first, exercise that exact candidate on isolated HTTPS, and then use `deploy.sh main promote <release-id>` without rebuilding. Record tester, time, exact commit, release ID, HTTPS origin, network, compiled gates, ticket version, device/OS/browser/wallet versions, acceptance references and a reproducible result. `node scripts/validate-mobile-phone-access-device-validation.js --file <external-file> --commit <full-40-character-SHA> --release <release-id>` checks row evidence; production additionally validates the candidate identity table and artifact/configuration digests. Record all row flags exactly as compiled in the candidate. `--allow-incomplete` checks structure only.

Never record QR screenshots, URL fragments, keys, complete signatures or credential-bearing HAR files. Evidence may be redacted UI images or detailed non-sensitive notes. Consumer IDs are tab storage identifiers, not physical-device identities; opener-created tabs can inherit sessionStorage.

## Setup

1. Pass targeted mobile-sync, wallet-session, onboarding, i18n, typecheck and production-build checks. Run the final artifact through `deploy/mobile-sync-release.mjs attest`; test a real process restart. Record the actual tested build metadata.
2. Use an independent HTTPS staging origin accessible to both devices, the exact same origin on desktop and phone, and an isolated Hyperliquid **Testnet** owner. Mainnet and testnet production origins share one build; flags are not network-specific. Do not reuse a production Agent slot for tests.
3. On desktop connect the exact master through Privy, explicitly approve the Mobile Agent, verify its name/address/validUntil through owner Info, then reveal the QR. Issuing/consuming tickets, reload and recovery must not sign. No builder-fee approval belongs in Agent registration.
4. The phone parses and scrubs the fragment, verifies the owner/Agent/network, and waits for explicit Import. It does not need a pairing code or master-wallet login. Test sessionStorage default and explicit Stay Connected persistence separately.
5. Prepare Coinbase Wallet, MetaMask and a WalletConnect-compatible wallet through the Privy directory. Ordinary email trading uses the exact embedded owner and must not generate a Mobile/ordinary Agent as a side effect.
6. Record only non-sensitive approval outcomes and version information. After a QR is rendered the desktop recovery key is cleared; replacement may require a new explicit approval. Never assume retries always reuse an in-memory key.

## Candidate Identity

Copy this table into the external evidence file exactly once. Fill values from `mobile-sync-candidates/<release-id>/candidate.json`; copy the full SHA and matching release ID into every row. Install reviewed evidence as a regular read-only file (`0440`), outside Git and outside the candidate artifact; no symlinks. A digest proves consistency, not that physical testing occurred. Reviewers remain responsible for the actual test record.

| Field | Value |
| --- | --- |
| Schema | 1 |
| Git commit | <full 40-character candidate SHA> |
| Release ID | <candidate release ID> |
| Artifact SHA256 | <candidate sha256> |
| Configuration SHA256 | <candidate configurationSha256> |
| Ticket API version | 2 |
| Mobile create gate | <candidate createAndReveal> |
| Mobile import gate | <candidate importFromQr> |

## Required Device Matrix

| ID | Device and browser | Required result | Status | Evidence |
| --- | --- | --- | --- | --- |
| RD-1 | iOS Safari via native Camera app | Phone-access QR opens the clean route and waits for explicit Import. | Not run | |
| RD-2 | iOS Safari | Reload retains the bounded draft and consumer; rejected tickets clear the draft without activating access. | Not run | |
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

Preserve every required ID, matrix description and evidence field. Pass requires real-device observations, complete notes and exact acceptance references. Unsupported RD-6 may pass only with demonstrated fail-closed behavior and a verified external-browser route. Replace stale evidence after code changes. Before promoting a candidate with either gate enabled through the optional strict `prepare` / `promote` workflow, run the validator without `--allow-incomplete`; failed or missing rows block that promotion. Ordinary deployment follows the automated checks described in the Release Rule above.

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
| Acceptance 8: automated and production artifact checks | Setup step 1, release manifest |

## Test Cases

### TC-1: Native Camera Opens Agent QR

On desktop verify the owner against the active signing wallet, approval and Hyperliquid owner Info. Scan its approved QR on the phone: confirm network, clean address bar and explicit Import, with no automatic activation or signature. The phone does not display the owner before Import; after explicit Import, verify that the resulting account and remotely approved Agent match the desktop owner. Cancel and verify draft removal. Repeat direct load, SPA navigation and expired QR.

### TC-2: Draft, Retry and Lost Response

The phone tester performs reload and explicit retries; a separate operator controls the isolated staging proxy/network fault and server restart. Within ticket lifetime reload the same tab and retry after simulated network loss. A successful first consumption followed by storage failure may retry with the same consumer while the original server record exists. A different independent context receives 409 and clears only its current draft. After a real server restart both consumers receive 410; old registration remains 400. With unavailable storage fail closed. A network failure retains the bounded draft; expired/rejected state does not. Do not copy actual QR credentials into test artifacts.

### TC-3: Identity, PWA and Wallet Lifecycle

For RD-3 test installed iOS PWA and browser context boundaries, refresh, cancellation, background/foreground and pending Import. Test Android installed PWA as additional coverage. For RD-6 test the wallet browser or document the unsupported restriction and working external browser. For TW rows reconnect through Privy, verify the active account matches exactly, approve Mobile on desktop, and return without switching identities. Switch owner/logout during pending issuance or consumption: late results cannot reveal, persist or activate. Verify ordinary external-wallet trading and email embedded-owner trading maintain their separate legal/signer/funding gates; email login, status checks and refresh never sign or generate an Agent.

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
| Ticket API version | 2 |
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
| Ticket API version | 2 |
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
| Ticket API version | 2 |
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
| Ticket API version | 2 |
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
| Ticket API version | 2 |
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
| Ticket API version | 2 |
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
| Ticket API version | 2 |
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
| Ticket API version | 2 |
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
| Ticket API version | 2 |
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
| Ticket API version | 2 |
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
| Ticket API version | 2 |
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
