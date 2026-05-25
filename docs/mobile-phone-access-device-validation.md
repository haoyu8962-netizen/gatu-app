# Mobile Phone Access Device Validation

Date: 2026-05-25

This runbook covers the physical-device checks that cannot be proven by jsdom tests, browser automation, or a headless camera mock. Completion of the mobile phone-access scanner PRD requires filling this runbook with passing evidence from real devices.

## Release Rule

Do not treat `docs/mobile-phone-access-scanner-prd.md` as fully complete until every required row in the device matrix and target-wallet matrix has a pass result, device/browser/wallet details, and enough notes or artifacts for another engineer to understand what was verified.

## Required Evidence

For each run, record:

| Field | Value |
| --- | --- |
| Tester | |
| Date and time | |
| Git commit | |
| App origin | |
| Environment | Mainnet or Testnet |
| Device model | |
| OS version | |
| Browser or wallet app | |
| Wallet connector | |
| Result | Pass or fail |
| Evidence | Screenshot, screen recording, or detailed notes |

Copy this block for each RD or TW row that is executed, replacing `RD-N` with the exact row ID such as `RD-1` or `TW-1`:

```md
### RD-N Evidence

| Field | Value |
| --- | --- |
| Tester | |
| Date and time | |
| Git commit | |
| App origin | |
| Environment | |
| Device model | |
| OS version | |
| Browser or wallet app | |
| Wallet connector | |
| Related test case | TC-N |
| Related PRD acceptance | Acceptance N |
| Result | Pass or fail |
| Evidence | |

Notes:
- Observed route or scanner state:
- Wallet handoff behavior:
- Temporary draft cleanup or persistence:
- Screenshot or recording reference:
```

## Setup

1. Confirm local verification has passed:

   ```sh
   pnpm check apps/terminal/src/lib/tests/mobile-agent-sync-route.test.tsx apps/terminal/src/lib/tests/mobile-agent-sync-modal.test.tsx apps/terminal/src/routes/mobile-agent-sync.tsx apps/terminal/src/lib/tests/wallet-modal.test.tsx apps/terminal/src/components/trade/components/wallet-modal.tsx apps/terminal/src/components/trade/components/mobile-agent-sync-modal.tsx apps/terminal/src/lib/mobile-sync/draft-storage.ts apps/terminal/src/lib/mobile-sync/qr-classification.ts apps/terminal/src/lib/tests/mobile-sync-draft-storage.test.ts apps/terminal/src/lib/tests/qr-classification.test.ts
   git diff --check -- docs/mobile-phone-access-scanner-prd.md docs/mobile-phone-access-device-validation.md
   git diff --no-index --check /dev/null docs/mobile-phone-access-scanner-prd.md || test $? -eq 1
   git diff --no-index --check /dev/null docs/mobile-phone-access-device-validation.md || test $? -eq 1
   pnpm test:mobile-device-validator
   pnpm validate:mobile-device -- --allow-incomplete
   pnpm template:mobile-device
   pnpm init:mobile-device
   pnpm --filter @hypeterminal/terminal test
   pnpm --filter @hypeterminal/terminal build
   ```

   The `git diff --check` command covers tracked docs. The `--no-index` commands cover newly added docs before they are staged; exit code 1 is expected when the only difference is that the file exists.
   The `--allow-incomplete` validation checks that the runbook structure is parseable before physical testing begins. Run `pnpm validate:mobile-device` without `--allow-incomplete` after RD-1 through RD-8 and TW-1 through TW-3 are filled; it must pass before this PRD can be treated as complete.
   Use `pnpm template:mobile-device` to print all evidence-section templates, or `pnpm validate:mobile-device -- --print-template --id RD-1` to print one row's template.
   Use `pnpm init:mobile-device` to insert any missing evidence-section templates into this runbook without changing `Not run` statuses.

2. Expose the app on an HTTPS origin that both desktop and phone can reach. Use a deployed preview or an HTTPS tunnel to the local dev server. Avoid generating a phone link from `localhost` if the phone will open a different origin, because origin mismatch is intentionally rejected.

3. Use a low-risk test owner wallet. Prefer Testnet when possible. If Mainnet is required, use an account with only the minimum needed for the approval test and revoke test agents after validation.

4. Install or prepare the target wallets:
   - Coinbase Wallet
   - MetaMask
   - WalletConnect-compatible wallet used by the product team

5. On desktop, open the same app origin as the phone will use. Connect the owner wallet and create a phone-access link from the mobile access modal.

6. Record the desktop-side details:

   | Field | Value |
   | --- | --- |
   | Phone link expiry | |
   | Pairing code | |
   | Agent address | |
   | Owner wallet | |
   | Network | |

## Required Device Matrix

| ID | Device and browser | Required result | Status | Evidence |
| --- | --- | --- | --- | --- |
| RD-1 | iOS Safari via native Camera app | Phone-access QR opens the route and shows `Phone link loaded`. | Not run | |
| RD-2 | iOS Safari | Pairing code can be typed and pasted before wallet connection. | Not run | |
| RD-3 | iOS Safari plus target wallet | Wallet handoff returns to the route without losing loaded link or code. | Not run | |
| RD-4 | iOS Chrome | Full phone-access flow works from scan/open through successful import. | Not run | |
| RD-5 | Android Chrome | Full phone-access flow works from scan/open through successful import. | Not run | |
| RD-6 | iOS wallet in-app browser, if supported | Full phone-access flow works or unsupported behavior is documented. | Not run | |
| RD-7 | Physical phone camera in WalletConnect scanner | A real `wc:` desktop QR scans, pairs, and connects. | Not run | |
| RD-8 | Physical phone WalletConnect scanner | Phone-access and unsupported QRs show clear wrong-QR feedback. | Not run | |

## Target Wallet Coverage

| ID | Wallet connector | Required result | Status | Evidence |
| --- | --- | --- | --- | --- |
| TW-1 | Coinbase Wallet | Wallet handoff returns to the route without clearing the loaded phone link or typed code. | Not run | |
| TW-2 | MetaMask | Wallet handoff returns to the route without clearing the loaded phone link or typed code. | Not run | |
| TW-3 | WalletConnect-compatible wallet used by the product team | Same-phone WalletConnect deep-link handoff remains available and returns without clearing the loaded phone link or typed code. | Not run | |

## Matrix Update Rules

1. Replace `Not run` with `Pass` only when the required result was verified on a real device and the Evidence cell includes enough detail to reproduce the run.
2. Use `Fail` for any row where the required result was attempted and did not pass. Add the observed failure, device, browser or wallet app, and any screenshot or recording reference.
3. Do not use browser automation, jsdom, or mocked camera evidence to pass RD-1 through RD-8 or TW-1 through TW-3. Those tools can support local regression confidence, but they do not close this release gate.
4. If a target wallet does not support an in-app browser flow for RD-6, mark RD-6 `Pass` only after documenting the unsupported behavior and confirming the normal external-browser flow still works.
5. If a row is rerun after a code change, replace stale evidence with the latest device/browser/wallet details.
6. Replace template placeholders such as `TC-N`, `Acceptance N`, and `Pass or fail` in every evidence block. Use the test case and acceptance references from the Acceptance Coverage Map.
7. Record `Git commit` as a commit hash, `Date and time` as a parseable timestamp, and `App origin` as an HTTP(S) origin without a path.
8. Fill every note bullet in each evidence block. Plain `N/A`, `none`, `todo`, and `tbd` are not valid evidence; use `N/A - <reason>` only when a note truly does not apply to that row.
9. In each matrix Evidence cell and evidence-block `Evidence` field, name the concrete screenshot, screen recording, artifact link, or detailed notes that prove the row was run.
10. For TW-1, TW-2, and TW-3, keep the target wallet name in both the matrix row and the evidence `Wallet connector` field.
11. Do not rename, remove, duplicate, or reword the matrix ID, device/browser or wallet connector, or required-result cells. The validator treats that wording as part of the release contract.
12. Do not duplicate evidence sections. Each required row must have exactly one matching evidence section once it is marked `Pass`.
13. Do not duplicate or add custom rows in the evidence field table. Add extra context under `Notes` instead.
14. After all rows are updated, run `pnpm validate:mobile-device`. The command must pass before release.

## Acceptance Coverage Map

| PRD acceptance | Required physical evidence |
| --- | --- |
| 1. Scanning a valid phone-access QR on a phone visibly shows `Phone link loaded`. | RD-1 plus TC-1 |
| 2. The pairing-code input can be focused, typed into, and pasted into before wallet connection. | RD-2 plus TC-2 |
| 3. Returning from wallet connection does not lose the scanned phone-link envelope. | RD-3 plus TC-3; RD-4, RD-5, and RD-6 extend this across target browsers |
| 4. Import succeeds after connecting the correct owner wallet and entering the correct pairing code. | RD-4 and RD-5 plus TC-4 |
| 5. Scanning a phone-access QR in the WalletConnect scanner produces a useful action or message. | RD-8 plus TC-6 |
| 6. The mobile scanner view fits within the viewport with cancel/back visible. | RD-7 and RD-8 plus TC-6 |
| 7. Existing same-phone WalletConnect deep-link connection remains available. | RD-3, RD-4, RD-5, RD-6, and TW-3 wallet-handoff notes |
| 8. Regression tests and focused build checks pass. | Setup step 1 command output |

| Target-wallet requirement | Required physical evidence |
| --- | --- |
| Coinbase Wallet return does not clear the loaded phone link or typed code. | TW-1 plus TC-3 |
| MetaMask return does not clear the loaded phone link or typed code. | TW-2 plus TC-3 |
| WalletConnect-compatible wallet return and same-phone deep-link behavior remain available. | TW-3 plus TC-3, Acceptance 3, and Acceptance 7 |

## Test Cases

### TC-1: Native Camera Opens Phone Link

1. Display the desktop phone-access QR at normal laptop viewing distance.
2. Scan with the phone's native camera app.
3. Open the detected link in the target browser.
4. Confirm the browser lands on `/mobile-agent-sync`.
5. Confirm the URL no longer contains `#ht-mobile-sync=`.
6. Confirm the page shows `Phone link loaded`, expiry, network, owner wallet step, and pairing-code step.

Pass criteria: the phone screen visibly changes to the loaded-link state and does not show a missing-link or invalid-link error.

### TC-2: Pairing Code Before Wallet Connection

1. Start from the loaded-link state with no wallet connected.
2. Tap the pairing-code field.
3. Type a lowercase, spaced, or hyphenated code.
4. Clear it, copy the desktop pairing code, then paste using the native long-press paste menu.
5. If Clipboard API permission is available, use `Paste code`.
6. Confirm the code normalizes to uppercase groups of four.
7. Confirm `Import phone access` remains disabled until a wallet is connected.

Pass criteria: the field is focusable before wallet connection, typing and paste work, and missing wallet state is communicated by text rather than only by a disabled button.

### TC-3: Reload and Wallet Handoff Recovery

1. Enter the pairing code while still disconnected.
2. Reload the page.
3. Confirm `Recovered after reload` is shown and the pairing code remains present.
4. Tap `Connect wallet`.
5. Start a wallet connection that leaves the browser or opens another app.
6. Return to the browser route.
7. Confirm the loaded link and pairing code are still present.
8. Repeat the handoff on the wallets represented by TW-1 through TW-3.

Pass criteria: route state survives reload and realistic app switching until the link expires.

### TC-4: Correct Owner Import

1. Connect the same owner wallet used on desktop.
2. Enter the correct pairing code.
3. Tap `Import phone access`.
4. Confirm the success state shows `Phone access ready`.
5. Open the terminal and confirm the mobile agent is available through the existing agent-storage path.
6. Reload and confirm the temporary import draft is not restored.

Pass criteria: correct owner plus correct code imports once, clears the temporary draft, and persists only through the normal agent storage path.

### TC-5: Negative Import Checks

Run these as separate attempts with fresh links:

| Case | Expected message |
| --- | --- |
| Wrong connected wallet plus correct code | `Connect the same wallet used on desktop.` |
| Correct wallet plus wrong code | `Pairing code does not match this link.` |
| Link generated on a different origin | `This link was created for a different site.` |
| Link generated on a different network | `This link was created for a different network.` |
| Unapproved or stale agent | `This phone link is not approved on Hyperliquid.` |

Pass criteria: no negative case imports the agent, and the temporary draft remains recoverable unless the link is explicitly reset, replaced, expired, or successfully imported.

### TC-6: WalletConnect Scanner With Real Camera

1. On a second device or desktop wallet, show a WalletConnect QR.
2. On the phone, open `Connect wallet`, then `Link desktop wallet`.
3. Confirm wallet rows and `New to wallets?` are hidden.
4. Confirm `Scan WalletConnect QR`, camera preview, `Paste WalletConnect URI`, and `Back` are visible.
5. Scan the `wc:` QR.
6. Confirm pairing activates and the wallet connects.
7. Repeat with a phone-access QR in this scanner.
8. Repeat with an unrelated QR.

Pass criteria: valid `wc:` connects, phone-access QR shows phone-access-specific wrong-QR text, unrelated QR shows `This is not a WalletConnect QR code.`, repeated reads do not spam the UI, and Back/camera cleanup works.

### TC-7: Camera Failure Recovery

1. Deny camera permission and open `Link desktop wallet`.
2. Confirm a clear permission-denied message.
3. Use `Paste WalletConnect URI` to connect manually.
4. Repeat in a browser or mode where camera access is unavailable if feasible.

Pass criteria: camera failure does not block wallet linking because manual paste remains available.

## Evidence Sections

### RD-1 Evidence

| Field | Value |
| --- | --- |
| Tester | <tester name> |
| Date and time | <YYYY-MM-DDTHH:mm:ssZ> |
| Git commit | <7-40 character commit hash> |
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

1. Revoke any test mobile agents created during validation.
2. Clear browser site data for the test origin.
3. Remove or close temporary HTTPS tunnels.
4. Attach screenshots or recordings to the release issue or PR.
