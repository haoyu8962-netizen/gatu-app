# Mobile Phone Access and QR Scanner PRD

Date: 2026-05-25

## Problem Statement

Mobile phone access currently feels unreliable during setup. A user can create a phone access QR on desktop, scan it on a phone, and still land on a screen that appears stuck because the pairing-code input is disabled until the owner wallet is connected. If the user opens the wallet connection flow first, the mobile WalletConnect scanner can also be confused with the phone-access QR scanner. When the wrong QR type is scanned, the scanner gives no feedback and appears to do nothing.

The result is that users cannot tell whether the phone link was scanned, whether the pairing code is needed yet, whether the wallet must be connected first, or whether they are using the wrong scanner.

## Evidence and Findings

1. The mobile import route disables the pairing-code input until a wallet, a parsed phone-link envelope, and no load error are present.
   - Current behavior: `Pairing code` is disabled when no wallet is connected, even if a valid phone-link QR was scanned.
   - User impact: the input cannot be focused, typed into, or pasted into, so it looks broken.
   - Code path: `apps/terminal/src/routes/mobile-agent-sync.tsx`.

2. The phone-link envelope is held only in React state after it is read from the URL hash.
   - Current behavior: `readAndClearMobileSyncEnvelope()` immediately removes the hash from the URL and returns the parsed envelope to component state.
   - User impact: if wallet connection opens another app, redirects, reloads the tab, or restores the page, the encrypted envelope can be lost because the URL was already cleaned.
   - Security intent is reasonable because the encrypted payload is not sent to the server, but the client needs a short-lived recovery path.
   - Code path: `apps/terminal/src/lib/mobile-sync/sync-core.ts` and `apps/terminal/src/routes/mobile-agent-sync.tsx`.

3. The route does not clearly show that a phone link has been loaded.
   - Current behavior: after a QR URL is parsed, the hash is removed and the page mostly shows the same import form.
   - User impact: after scanning, there is no strong "Phone link loaded" state, so scanning can feel like nothing happened.

4. The current mobile import page forces a strict order that is hostile to mobile usage.
   - Current order: scan/open phone link, connect owner wallet, then type pairing code.
   - Better order: scan/open phone link, type or paste pairing code whenever convenient, connect owner wallet whenever convenient, then import once all requirements are met.
   - User impact: pairing code entry should not be blocked by wallet connection.

5. There is no dedicated paste affordance for the pairing code.
   - Current behavior: the input normalizes typed content, but mobile users have no explicit paste button and the disabled state prevents the native paste menu.
   - User impact: moving a desktop-visible code to a phone is cumbersome.

6. The WalletConnect desktop-wallet scanner and phone-access QR flow are easy to confuse.
   - Current behavior: the `Link desktop wallet` scanner only accepts `wc:` WalletConnect URIs.
   - If it sees a non-WalletConnect QR, including a HypeTerminal phone-access link, it silently continues scanning.
   - User impact: scanning the phone-access QR inside this scanner appears to do nothing.
   - Code path: `apps/terminal/src/components/trade/components/wallet-modal.tsx`.

7. The scanner UI is visually cramped inside the wallet drawer.
   - Current behavior: scanner content is inserted into the wallet list; the original `Link desktop wallet` row and wallet rows remain visible, and the footer can visually compete with the scanner.
   - User impact: the camera preview is large but not purposefully framed, controls can fall below the fold, and the user does not get a focused scanning mode.

8. Browser smoke test matched the reported UI structure.
   - `/mobile-agent-sync` shows `Pairing code` disabled without a wallet.
   - Opening `Connect wallet` on mobile shows `Link desktop wallet`.
   - Opening the scanner inserts `Scan desktop wallet QR` into the drawer while wallet rows remain below it.

## Goals

1. Make scanning a desktop-generated phone-access QR visibly change the phone screen.
2. Let users type or paste the pairing code before connecting a wallet.
3. Preserve the scanned phone-link envelope through wallet connection handoffs and reloads without storing decrypted agent secrets.
4. Make the WalletConnect scanner reject or reroute wrong QR types with clear feedback.
5. Redesign the mobile camera scanner into a focused, reliable scanning surface.
6. Add regression coverage for the full mobile setup sequence.

## Non-Goals

1. Do not change the cryptographic envelope format unless absolutely required.
2. Do not store decrypted agent private keys before the final import succeeds.
3. Do not make phone access work without the owner wallet approval and account match checks.
4. Do not remove the WalletConnect desktop-wallet scanner.

## User Stories

1. As a desktop trader, I want to create a phone-access QR and pairing code, so that I can move a trading agent to my phone.
2. As a phone user, I want scanning the phone-access QR to show a clear loaded state, so that I know the scan worked.
3. As a phone user, I want to paste or type the pairing code before connecting my wallet, so that I can complete setup in whatever order is easiest.
4. As a phone user, I want the app to remember the scanned link while I connect my wallet, so that returning from a wallet app does not lose the setup.
5. As a phone user, I want a clear error when I scan the wrong QR, so that I know what to do next.
6. As a phone user, I want the scanner to use a full, focused camera view with obvious controls, so that I can aim and cancel without fighting the drawer layout.
7. As a support engineer, I want deterministic tests around phone-link import and scanner QR classification, so that regressions are caught before release.

## Functional Requirements

### Phone-access import route

1. When a valid phone-access QR/link is opened, show a visible `Phone link loaded` state with expiry, network, and owner-wallet verification state. The pre-decrypt state must not require exposing the owner account as unencrypted envelope metadata.
2. Persist the encrypted envelope in `sessionStorage` after successful parse, with TTL metadata and sync ID.
3. Clear the persisted envelope only after successful import, explicit link reset, expiration, or invalid payload replacement.
4. Keep the pairing-code field enabled whenever a valid envelope is loaded, even if the wallet is not connected.
5. Allow pairing-code input while disconnected. Disable only the final `Import phone access` action until wallet, envelope, and 16-character code are present.
6. Preserve typed pairing code through wallet modal open/close and likely wallet app handoffs.
7. Add a visible `Paste code` action next to the pairing-code field using the Clipboard API when available.
8. Accept hyphenated, spaced, and unhyphenated 16-character hex codes, normalize to uppercase groups of four, and keep the cursor behavior usable on mobile.
9. Keep the manual `Phone link` paste fallback available when no envelope is loaded or when the stored envelope is invalid/expired.
10. If the URL hash is missing after a reload but a valid stored envelope exists, restore the envelope and show that the link was recovered.

### QR scanner behavior

1. Introduce QR classification before action:
   - `walletconnect`: values starting with `wc:`.
   - `phoneAccessLink`: HypeTerminal mobile sync links containing `#ht-mobile-sync=`.
   - `unsupported`: any other QR value.
2. In the WalletConnect scanner, scanning a `phoneAccessLink` must not silently fail.
   - Preferred behavior: close wallet modal and navigate to the phone-access import route.
   - Acceptable fallback: show an error that this is a phone-access QR and tell the user to open it with the phone camera or browser.
3. In the WalletConnect scanner, scanning `unsupported` must show a non-blocking error such as `This is not a WalletConnect QR code.`
4. Avoid repeated error spam by throttling repeated wrong-QR feedback.

### Scanner UX

1. When `Link desktop wallet` is selected on mobile, replace the wallet list with a focused scanner mode instead of inserting the scanner inside the connector list.
2. Keep `Cancel` or `Back` fixed and visible.
3. Hide the `New to wallets?` footer while scanning.
4. Keep the camera preview within the visible viewport with a stable aspect ratio.
5. Show one primary instruction at a time:
   - `Scan WalletConnect QR`
   - `Looking for a WalletConnect QR code`
   - `Wrong QR type`
   - `Connecting`
6. Provide a manual `Paste WalletConnect URI` fallback for users whose camera or QR detection fails.
7. Preserve existing mobile WalletConnect deep-link behavior as a separate connector row.

## Implementation Decisions

1. Add a small mobile-sync draft storage module that stores only the encrypted envelope, sync ID, created/expiry times, and optionally the typed pairing-code draft in session storage.
2. Keep decrypted agent material entirely in memory during import and persist it only through the existing agent storage path after verification succeeds.
3. Split QR parsing/classification into a pure utility that can be unit-tested without camera APIs.
4. Keep the WalletConnect scanner and phone-access import as separate flows, but make them aware of each other's QR types to prevent silent failures.
5. Treat the scanner UI as a mode inside the wallet modal, not as an extra row inside the connector list.

## Ordered Fix Plan

1. Add regression tests for the current failures.
   - Phone access route allows code input with a loaded envelope and no wallet.
   - Loaded envelope survives a simulated reload or wallet-connect handoff.
   - Wallet scanner reports wrong QR type instead of silently ignoring non-`wc:` values.

2. Add phone-link draft persistence.
   - Save parsed encrypted envelope to session storage.
   - Restore it on `/mobile-agent-sync` load.
   - Clear it on success, expiration, or explicit reset.

3. Fix the pairing-code input flow.
   - Enable the input when an envelope is loaded, regardless of wallet connection.
   - Preserve the typed code through wallet modal interactions.
   - Add paste support and better mobile input attributes.

4. Add an explicit loaded-link state.
   - Show `Phone link loaded`.
   - Show expiry and next required step.
   - Make the required steps visible as state, not disabled mystery controls.

5. Add QR classification and wrong-QR handling.
   - Classify `wc:`, phone-access links, and unsupported QR values.
   - Navigate or instruct when a phone-access link is scanned in the wallet scanner.
   - Show clear wrong-QR feedback for unsupported values.

6. Redesign the mobile scanner mode.
   - Replace the connector list with a scanner view while active.
   - Keep camera preview and cancel/back visible.
   - Hide footer and repeated wallet rows while scanning.
   - Add manual WalletConnect URI paste fallback.

7. Run end-to-end validation.
   - Agent-browser mobile smoke test for route states and scanner states.
   - Real iOS Safari/Chrome checklist for camera permission, QR recognition, wallet handoff, paste menu, and reload recovery.

## Detailed Audit Checklist

Every item in this section should be explicitly checked during implementation, even if the final decision is to leave behavior unchanged.

### Desktop phone-link creation

1. Confirm the desktop flow shows the pairing code after wallet signing succeeds.
2. Confirm the phone-link QR contains the full fragment URL and not a truncated link.
3. Confirm the QR is large enough, high contrast, and scannable from a typical phone camera distance.
4. Confirm the desktop modal has a copy action for the phone link.
5. Check whether the desktop modal should also have a copy action for the pairing code.
6. Confirm the expiry time is visible and understandable.
7. Confirm expired links cannot be imported and produce a clear message.
8. Confirm creating a new phone link invalidates or supersedes any stale UI state from an older link.

### Mobile phone-link landing page

1. Confirm opening a valid QR link changes the screen to a clear loaded-link state.
2. Confirm the loaded-link state survives closing and reopening the wallet modal.
3. Confirm the loaded-link state survives a page reload while the link has not expired.
4. Confirm the loaded-link state is cleared after successful import.
5. Confirm an expired stored link is cleared and replaced with an actionable error.
6. Confirm an invalid stored link is cleared and does not trap the user.
7. Confirm manual phone-link paste still works when no QR link is loaded.
8. Confirm manual phone-link paste replaces any old loaded-link state.
9. Confirm the phone-link input has correct mobile attributes for URL entry and paste.
10. Confirm the page explains the next required action without relying only on disabled controls.

### Pairing-code input

1. Confirm the pairing-code input is enabled once a valid envelope is loaded, even before wallet connection.
2. Confirm native paste works from the long-press menu.
3. Confirm the explicit paste button works when Clipboard API permission is available.
4. Confirm the explicit paste button degrades gracefully when Clipboard API is unavailable or denied.
5. Confirm lowercase codes normalize to uppercase.
6. Confirm codes with hyphens, spaces, or no separators normalize correctly.
7. Confirm non-hex characters are rejected or ignored predictably.
8. Confirm the cursor does not jump in a way that makes mobile editing painful.
9. Confirm the input uses a keyboard that is reasonable on iOS and Android.
10. Confirm the final import button stays disabled until the normalized code has exactly 16 hex characters.
11. Confirm a wrong code shows `Pairing code does not match this link.`
12. Confirm the code remains present after opening and closing wallet connection.
13. Confirm the code remains present after returning from a wallet app when feasible.

### Wallet connection during phone import

1. Confirm the connect-wallet callout opens the wallet modal on mobile.
2. Confirm the user can connect the same owner wallet used on desktop.
3. Confirm connecting a different wallet shows a clear account-mismatch message.
4. Confirm the wallet modal closing does not clear the loaded phone link or typed code.
5. Confirm WalletConnect same-phone deep links still work.
6. Confirm desktop-wallet linking remains available but does not confuse the phone-access flow.
7. Confirm returning from Coinbase Wallet, MetaMask, or WalletConnect does not reset the import route unexpectedly.

### Phone-access import and verification

1. Confirm correct owner wallet plus correct code imports the agent.
2. Confirm wrong owner wallet plus correct code does not import.
3. Confirm correct owner wallet plus wrong code does not import.
4. Confirm correct code plus wrong environment does not import.
5. Confirm links created on another origin do not import.
6. Confirm unapproved or stale agents fail verification.
7. Confirm successful import persists the mobile agent through the existing storage path.
8. Confirm successful import clears temporary envelope and code drafts.
9. Confirm no decrypted private key is stored in temporary draft storage.

### WalletConnect scanner QR behavior

1. Confirm scanning a valid `wc:` URI still pairs and connects.
2. Confirm scanned WalletConnect pairings are activated before `connectAsync`.
3. Confirm cancelling the scanner cannot start a late connection.
4. Confirm scanning a phone-access link in the WalletConnect scanner does not silently do nothing.
5. Decide and implement whether phone-access links auto-navigate to `/mobile-agent-sync` or show an explanatory error.
6. Confirm unsupported QR values show an actionable wrong-QR message.
7. Confirm repeated wrong QR reads do not spam the UI.
8. Confirm manual WalletConnect URI paste is available if camera scanning fails.

### Scanner UI and camera behavior

1. Confirm scanner mode replaces the wallet list rather than being inserted between rows.
2. Confirm `Back` or `Cancel` is always visible.
3. Confirm the wallet education footer is hidden while scanning.
4. Confirm camera preview fits within the visible viewport on small iPhones.
5. Confirm preview area has a stable aspect ratio and does not push controls below the fold.
6. Confirm instructions are short and specific to the current state.
7. Confirm camera permission denied shows a clear recovery message.
8. Confirm browsers without `getUserMedia` show a clear fallback.
9. Confirm browsers without `BarcodeDetector` use the `jsqr` fallback.
10. Confirm low-light or no-QR states do not look like a frozen UI.
11. Confirm video tracks stop when scanner closes.
12. Confirm scanner does not keep running after modal close.

### Real-device coverage

1. iOS Safari: scan phone-access QR from the native camera app.
2. iOS Safari: paste pairing code into the route.
3. iOS Safari: connect wallet and return to the route.
4. iOS Chrome: repeat the same phone-access flow.
5. Android Chrome: repeat the same phone-access flow.
6. iOS in-app wallet browser if supported by target wallets.
7. Desktop browser responsive mode through agent-browser for fast regression checks.
8. Real camera scan for WalletConnect QR on at least one physical phone.

### Accessibility and usability

1. Confirm all interactive controls have accessible names.
2. Confirm error messages use alert semantics where appropriate.
3. Confirm focus moves to scanner mode or error messages in a useful way.
4. Confirm disabled controls are not the only way to communicate missing requirements.
5. Confirm text fits on narrow screens without clipping.
6. Confirm touch targets are large enough for mobile.
7. Confirm color-only states also have text labels.

## Testing Decisions

1. Unit-test QR classification as a pure module.
2. Unit-test mobile-sync draft storage with fake `sessionStorage` and expiry clocks.
3. Add route/component tests for disabled/enabled pairing-code behavior.
4. Add wallet modal tests for:
   - WalletConnect QR still connects.
   - Phone-access QR is not silently ignored.
   - Unsupported QR shows an error.
   - Scanner mode hides connector list/footer while active.
5. Keep browser smoke tests for:
   - `/mobile-agent-sync` empty state.
   - loaded-link state with no wallet.
   - scanner open state and camera activation.
6. Keep at least one manual real-device test before release because browser automation cannot fully reproduce iOS camera app scanning and wallet app handoff behavior.

## Acceptance Criteria

1. Scanning a valid phone-access QR on a phone visibly shows `Phone link loaded`.
2. The pairing-code input can be focused, typed into, and pasted into before wallet connection.
3. Returning from wallet connection does not lose the scanned phone-link envelope.
4. Import succeeds after connecting the correct owner wallet and entering the correct pairing code.
5. Scanning a phone-access QR in the WalletConnect scanner produces a useful action or message.
6. The mobile scanner view fits within the viewport with cancel/back visible.
7. Existing same-phone WalletConnect deep-link connection remains available.
8. Regression tests and focused build checks pass.

## Implementation Status

Local implementation is complete for the code paths that can be covered in automated tests and browser automation. Physical phone validation is still required before release for native camera scanning and wallet app handoff behavior. Use `docs/mobile-phone-access-device-validation.md` as the release validation runbook.

### Acceptance status

| Acceptance criterion | Current evidence | Status |
| --- | --- | --- |
| 1. Scanning a valid phone-access QR on a phone visibly shows `Phone link loaded`. | Route tests and browser smoke prove valid fragment links load, clear the hash, persist the draft, and show `Phone link loaded`; RD-1 must still prove native iOS camera handoff. | Local pass; physical validation pending |
| 2. The pairing-code input can be focused, typed into, and pasted into before wallet connection. | Route tests prove the input is enabled with a loaded envelope before wallet connection, supports typed normalization, explicit Clipboard API paste, and fallback errors; RD-2 must still prove native mobile paste UX. | Local pass; physical validation pending |
| 3. Returning from wallet connection does not lose the scanned phone-link envelope. | Route tests and browser smoke prove wallet-modal open/close and reload recovery preserve the envelope and pairing-code draft; RD-3, RD-4, RD-5, and RD-6 must still prove real wallet app handoff. | Local pass; physical validation pending |
| 4. Import succeeds after connecting the correct owner wallet and entering the correct pairing code. | Route/import tests prove correct owner plus correct code succeeds and clears temporary drafts, while wrong owner/code/environment/origin/unapproved branches fail; RD-4 and RD-5 must still prove the full physical-device flow. | Local pass; physical validation pending |
| 5. Scanning a phone-access QR in the WalletConnect scanner produces a useful action or message. | QR classification and wallet-modal tests prove phone-access values show a phone-access-specific alert and do not connect. | Local pass |
| 6. The mobile scanner view fits within the viewport with cancel/back visible. | Wallet-modal tests and browser smoke prove scanner mode replaces the wallet list, hides the footer, focuses the scanner panel, constrains the 4:3 preview, and keeps Back plus manual paste visible; RD-7 and RD-8 must still prove real camera usability. | Local pass; physical validation pending |
| 7. Existing same-phone WalletConnect deep-link connection remains available. | Wallet-modal tests prove the standard mobile WalletConnect connector row remains available alongside `Link desktop wallet`. | Local pass |
| 8. Regression tests and focused build checks pass. | Automated test/check commands listed below pass for the focused PRD surface; full build/test remains the release preflight in the device runbook. | Local pass |

### Completed in code

1. Desktop phone-link creation now has regression coverage for wallet approval, full-fragment QR generation, visible pairing code, expiry display, copy phone-link, and copy pairing-code actions.
2. The mobile import route now stores only the encrypted envelope metadata plus an optional pairing-code draft in `sessionStorage`; decrypted agent material is not stored in temporary draft storage.
3. Opening a valid phone-access hash now clears the hash, persists the encrypted draft, and shows a visible `Phone link loaded` panel with sync ID, expiry, network, owner-wallet verification state, and pairing-code step state.
4. The route restores valid stored drafts after reload, clears expired or invalid drafts, and keeps manual phone-link paste available for empty, expired, invalid, and replacement states.
5. The pairing-code field is enabled once a valid envelope is loaded, even with no connected wallet. The final import action remains disabled until wallet, envelope, and a complete 16-character code are present.
6. Pairing-code input and paste normalize lowercase, spaced, hyphenated, and unhyphenated hex codes to uppercase groups of four; invalid or incomplete clipboard content shows an alert.
7. Wallet modal open/close does not clear the loaded phone link or typed code, and reload recovery preserves the code draft for likely wallet handoffs.
8. Successful import clears the temporary envelope and pairing-code draft; wrong owner, wrong environment, wrong origin, unapproved agent, and wrong pairing-code branches show explicit errors and do not import.
9. QR classification is split into a pure utility for `walletconnect`, `phoneAccessLink`, and `unsupported` values.
10. The WalletConnect scanner pairs valid `wc:` QR values, activates the WalletConnect pairing topic before `connectAsync`, rejects phone-access QRs with a clear message, rejects unsupported QR values, and avoids repeated same-message feedback within a short throttle window.
11. Mobile `Link desktop wallet` now enters a focused scanner mode that replaces the wallet list, hides the wallet education footer, focuses the scanner panel, keeps a visible Back control, constrains the camera preview to a stable 4:3 viewport, and provides manual WalletConnect URI paste.
12. Camera fallback paths now show clear messages for unavailable camera access, denied permission, unavailable QR decoding, and `jsqr` fallback usage. Scanner cleanup stops tracks on Back, modal close, and late detection cancellation.

### Automated evidence

1. `apps/terminal/src/lib/tests/mobile-agent-sync-modal.test.tsx` covers desktop phone-link creation, full-fragment high-contrast QR generation, expiry, copy link, copy code, and ready-state reset on modal close.
2. `apps/terminal/src/lib/tests/mobile-sync-draft-storage.test.ts` covers encrypted draft storage, pairing-code draft updates, expiry clearing, invalid draft clearing, and explicit clearing.
3. `apps/terminal/src/lib/tests/mobile-agent-sync-route.test.tsx` covers empty-route disabled setup controls, loaded-link state, same-route QR hash handling, reload recovery, manual paste, valid replacement, replacement cancellation, invalid replacement cleanup, explicit reset cleanup, expiry, invalid links, mobile input attributes, paste-button behavior, wallet modal preservation, import success, import cleanup, and user-facing import errors with alert semantics and focus management.
4. `apps/terminal/src/lib/tests/qr-classification.test.ts` covers WalletConnect, phone-access, and unsupported QR classification plus repeated wrong-QR feedback throttling.
5. `apps/terminal/src/lib/tests/wallet-modal.test.tsx` covers standard mobile WalletConnect availability, focused scanner mode, valid QR pairing, manual URI paste for both valid and wrong QR values, `jsqr` fallback, late-cancel protection, wrong-QR feedback with alert semantics, camera fallback messages with alert semantics, and camera track cleanup.
6. Existing `mobile-sync-core` and `mobile-sync-import` tests cover fragment-only encrypted URLs, no unencrypted owner-wallet metadata in the envelope, cryptographic rejection for wrong account, environment, origin, expired payload, wrong code, malformed payloads, and unapproved remote agents.
7. 2026-05-25 local preflight passed:
   - `pnpm check apps/terminal/src/lib/tests/mobile-agent-sync-route.test.tsx apps/terminal/src/lib/tests/mobile-agent-sync-modal.test.tsx apps/terminal/src/routes/mobile-agent-sync.tsx apps/terminal/src/lib/tests/wallet-modal.test.tsx apps/terminal/src/components/trade/components/wallet-modal.tsx apps/terminal/src/components/trade/components/mobile-agent-sync-modal.tsx apps/terminal/src/lib/mobile-sync/draft-storage.ts apps/terminal/src/lib/mobile-sync/qr-classification.ts apps/terminal/src/lib/tests/mobile-sync-draft-storage.test.ts apps/terminal/src/lib/tests/qr-classification.test.ts`
   - `git diff --no-index --check /dev/null docs/mobile-phone-access-scanner-prd.md || test $? -eq 1`
   - `git diff --no-index --check /dev/null docs/mobile-phone-access-device-validation.md || test $? -eq 1`
   - `pnpm test:mobile-device-validator` passed 21 fixture tests for the release validator.
   - `pnpm validate:mobile-device -- --allow-incomplete` passed the device-runbook structure check and reported RD-1 through RD-8 plus TW-1 through TW-3 as incomplete.
   - `pnpm template:mobile-device` printed validator-compatible evidence-section templates with explicit result placeholders for all required rows.
   - `pnpm init:mobile-device` is available to insert missing evidence-section templates without changing `Not run` statuses.
   - `pnpm --filter @hypeterminal/terminal test` passed 44 files with 1 skipped file, and 260 tests with 1 skipped test.
   - `pnpm --filter @hypeterminal/terminal build` passed with existing dependency directive, pure annotation, TanStack export, and chunk-size warnings.

### Browser smoke evidence

1. 2026-05-25 browser smoke at a 390 x 844 viewport verified `/mobile-agent-sync` empty state keeps phone-link paste available and pairing-code, paste-code, and import controls disabled until a link is loaded.
2. Same-route hash smoke used a real `createMobileAgentSyncUrl` encrypted fragment and verified opening it after the empty route is already loaded shows `Phone link loaded`, clears the hash, and enables pairing-code entry without a wallet.
3. Pairing-code smoke verified typing `abcd 1234 ef56 7890` normalizes to `ABCD-1234-EF56-7890`, marks the pairing-code step `Ready`, and keeps `Import phone access` disabled until a wallet is connected.
4. Reload smoke verified the cleaned URL restores the stored draft, shows `Recovered after reload`, and preserves the typed pairing-code draft.
5. Mobile viewport smoke verified `Connect wallet` opens the wallet drawer and `Link desktop wallet` enters scanner mode with wallet rows and footer hidden, manual paste visible, Back visible, and camera fallback messaging present in headless mode.
6. Modal close smoke verified backing out of scanner mode and closing the wallet drawer does not clear the loaded phone link or typed pairing code.
7. 2026-05-25 live browser smoke at a 390 x 844 viewport re-verified the loaded-link route, pairing-code normalization, reload recovery, focused scanner mode, headless camera fallback, phone-access QR wrong-type feedback, and unsupported QR feedback through the manual scanner fallback.

### Physical-device validation still required

1. iOS Safari: scan phone-access QR from the native camera app, paste pairing code, connect wallet, return to route, and verify reload recovery.
2. iOS Chrome: repeat the same phone-access flow.
3. Android Chrome: repeat the same phone-access flow.
4. iOS in-app wallet browser: validate the flow if supported by target wallets.
5. Real camera WalletConnect scan: verify at least one physical phone can scan a desktop WalletConnect QR and complete wallet handoff.
6. Target wallets: verify Coinbase Wallet, MetaMask, and a WalletConnect-compatible wallet return to the route without clearing the loaded link or typed code.
7. Record RD and TW results in `docs/mobile-phone-access-device-validation.md` before release.
8. Run `pnpm validate:mobile-device`; it must pass before this PRD can be marked complete.

## Resolved Decisions

1. Phone-access QRs scanned inside the WalletConnect scanner show an explanatory wrong-QR error instead of auto-navigation. This keeps wallet connection and phone-access import as separate flows and avoids silently changing route from inside the wallet drawer.
2. The pairing-code draft is stored in `sessionStorage` alongside the encrypted envelope metadata to improve handoff and reload recovery. Decrypted private key material remains out of temporary draft storage.
3. The desktop phone-access modal now includes `Copy code` in addition to `Copy phone link`.
4. The phone import page keeps manual phone-link paste as the fallback for this slice. A dedicated phone-link camera scanner remains a future enhancement, not a release blocker for this PRD.
