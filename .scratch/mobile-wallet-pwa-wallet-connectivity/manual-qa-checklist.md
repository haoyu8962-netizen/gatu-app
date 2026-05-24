# Mobile Wallet Manual QA Checklist

Status: ready-for-device-qa

Use this checklist to produce the physical-device evidence required by `issues/08-end-to-end-qa.md`.

## QA Run Metadata

- Tester:
- Date:
- Commit SHA:
- App URL:
- Environment: Mainnet / Testnet
- Desktop browser and version:
- iOS device, iOS version:
- Android device, Android version:
- MetaMask Mobile version:
- Coinbase Wallet version:
- Ledger device and wallet software:
- Trezor device and wallet software:

Use Testnet for agent approval and trading behavior unless the run explicitly requires Mainnet wallet metadata. Do not paste mobile sync import links into issue comments, chat, analytics tools, or logs.

## Environment Setup

1. Use an HTTPS app URL reachable from the phones. A staged deployment is preferred.
2. Confirm `VITE_WALLET_CONNECT_PROJECT_ID` is configured for the build.
3. Use fresh browser profiles or clear app storage for the app origin before each platform run.
4. Confirm the phone can install and open the PWA from the same app URL.
5. Keep the desktop and phone clocks reasonably current; mobile sync links expire after 10 minutes.
6. Record screenshots or screen recordings for each pass/fail result, but do not capture the QR after reveal unless the recording stays private.

## Required Result Matrix

| Area | Platform | Wallet / Backing | Expected Result | Result | Evidence |
| --- | --- | --- | --- | --- | --- |
| Wallet connect | iOS Safari | MetaMask Mobile | Connects and returns to HypeTerminal with the selected address visible. | Not run | |
| Wallet connect | iOS Safari | Coinbase Wallet | Connects and returns to HypeTerminal with the selected address visible. | Not run | |
| Wallet connect | iOS PWA | MetaMask Mobile | Connects and returns to the installed PWA with the selected address visible. | Not run | |
| Wallet connect | iOS PWA | Coinbase Wallet | Connects and returns to the installed PWA with the selected address visible. | Not run | |
| Wallet connect | Android Chrome | MetaMask Mobile | Connects and returns to HypeTerminal with the selected address visible. | Not run | |
| Wallet connect | Android Chrome | Coinbase Wallet | Connects and returns to HypeTerminal with the selected address visible. | Not run | |
| Wallet connect | Android PWA | MetaMask Mobile | Connects and returns to the installed PWA with the selected address visible. | Not run | |
| Wallet connect | Android PWA | Coinbase Wallet | Connects and returns to the installed PWA with the selected address visible. | Not run | |
| Hardware approval | Desktop or mobile wallet software | Ledger-backed account | Main wallet creates a `Mobile` phone link; phone imports agent; routine trading uses the agent. | Not run | |
| Hardware approval | Desktop or mobile wallet software | Trezor-backed account | Main wallet creates a `Mobile` phone link; phone imports agent; routine trading uses the agent. | Not run | |
| Relink | Phone/PWA | Any required wallet | Linking a new phone/browser profile replaces the older mobile access. | Not run | |
| Reset | Desktop plus linked phone/PWA | Any required wallet | Reset signs a short-lived replacement and the old phone no longer has valid mobile access. | Not run | |

## WalletConnect Run Steps

Run these steps for each iOS/Android browser and PWA row in the matrix.

1. Open the app URL on the phone.
2. Open the wallet connection modal.
3. Select WalletConnect or the relevant wallet option.
4. Verify the UI exposes a pairing/deep-link fallback when the wallet does not open automatically.
5. Complete the connection in MetaMask Mobile or Coinbase Wallet.
6. Verify the flow returns to the browser or installed PWA instead of stranding the user in the wallet app.
7. Verify the connected address is visible in the HypeTerminal account surface.
8. Disconnect, clear recent wallet state if needed, and repeat for the next wallet/platform row.

Record failures with:

- Browser/PWA context.
- Wallet app and version.
- Whether the QR, deep link, or copy-link fallback was used.
- The visible app error, wallet error, or the step where control did not return.

## Mobile Sync Import Steps

Run this from a desktop session connected with the main wallet and a phone/PWA session for import.

1. On desktop, open the connected account menu and select `Link mobile device`.
2. Confirm the modal shows the connected wallet and network as a compact context line.
3. Click `Create phone link`.
4. Approve phone access in the main wallet.
5. Confirm the QR is hidden until `Show QR` is clicked.
6. Confirm the pairing code is shown separately from the QR.
7. Show the QR and scan it with the phone, or copy the phone link directly to the phone without logging it.
8. On the phone, confirm the app opens `/mobile-agent-sync`, clears the URL fragment from the address bar, and asks for the pairing code.
9. Enter the pairing code.
10. Confirm import success and that the linked phone can reach the trading surface without another wallet signature for routine trading actions.
11. Confirm deposits, withdrawals, builder fee approval, and agent rotation still require the main wallet path.

Negative checks:

- Enter a wrong pairing code and expect an import error.
- Wait longer than 10 minutes and expect the import link to be expired.
- Try importing while connected to a different account and expect an account mismatch.
- Try importing while the app is set to the wrong Hyperliquid environment and expect an environment mismatch.

## Relink Steps

1. Complete a successful mobile sync import on phone/profile A.
2. From desktop, run `Link mobile device` again and create a new `Mobile` phone link.
3. Import the new link on phone/profile B.
4. Return to phone/profile A and refresh the app.
5. Confirm phone/profile A detects stale mobile access, clears or disables the old agent, and requires relinking before routine trading.
6. Confirm phone/profile B remains usable through the new mobile agent.

## Reset Steps

1. Start from a linked phone/PWA session with a valid imported mobile agent.
2. On desktop, open `Link mobile device`.
3. Click `Reset mobile access`.
4. Approve the short-lived replacement `Mobile` agent with the main wallet.
5. Confirm the desktop modal reports reset success and a short expiry.
6. Refresh the linked phone/PWA.
7. Confirm the old phone agent is no longer valid and the phone must relink before routine trading.
8. Confirm a desktop local-registration agent, if present, is not removed by the reset action.

## Hardware Wallet Approval Steps

Run once with a Ledger-backed account and once with a Trezor-backed account where available.

1. Connect the hardware-backed account through supported wallet software such as Ledger Live, Trezor Suite, MetaMask, Rabby, or another WalletConnect/injected surface.
2. Open `Link mobile device`.
3. Approve `Mobile` with the hardware-backed main wallet.
4. Import the mobile sync link on the phone/PWA using the pairing code.
5. Confirm routine trading on the phone uses the imported agent without repeated hardware-wallet prompts.
6. Confirm sensitive account actions still require the hardware-backed main wallet.
7. Run `Reset mobile access` and confirm the hardware-backed main wallet is used for reset approval.

## Pass Criteria

`issues/08-end-to-end-qa.md` can move from `blocked` to `done` only after every required matrix row has a passing result or a documented product decision removes that row from scope.
