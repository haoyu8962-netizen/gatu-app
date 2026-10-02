# Support

Welcome to Sairn Support. This page helps you find answers, troubleshoot common issues, and get in touch with our team.

> _Last updated: October 1, 2026_

---

## Quick Links
- [Frequently Asked Questions](#frequently-asked-questions)
- [Troubleshooting](#troubleshooting)
- [Contact Support](#contact-support)
- [Reporting Bugs & Feedback](#reporting-bugs--feedback)
- [Response Times](#response-times)

---

## Frequently Asked Questions

### General

**What is Sairn?**
Sairn is a non-custodial trading terminal for the Hyperliquid decentralized exchange, supporting perpetual futures and spot markets with real-time data and advanced charting.

**Does Sairn hold my funds?**
No. Sairn is fully non-custodial. Your funds remain in your own account, and we never have access to your private keys.

**Is Sairn free to use?**
Using the interface is free to use. You remain responsible for network fees and any protocol or builder fees applied to your trades.

### Wallet & Sign-In

**How do I connect my wallet?**
Click **Connect Wallet** and choose an external wallet (e.g., browser extension or mobile wallet) or sign in with email to use an embedded wallet.

**What is the "agent" or "trading" wallet?**
With an external wallet, Sairn uses a delegated agent (API) wallet that you approve once with your main wallet, so orders are signed without a pop-up. The agent key can place and cancel orders but **cannot withdraw your funds**. If you signed in with email, your embedded wallet signs orders directly and no agent is created.

**I signed in with email — where is my wallet?**
Email sign-in creates an embedded wallet for you. You can view its address in the account menu.

### Trading

**How do I deposit funds?**
Open **Deposit** and send USDC from Arbitrum. The terminal moves it to your Hyperliquid trading account through Circle's CCTP.

**Why was my order rejected or not filled?**
Common reasons include insufficient margin, the price moving away from a limit order, or temporary network/exchange conditions. See [Troubleshooting](#troubleshooting).

**How do I withdraw?**
Open the account/deposit panel and follow the withdrawal flow. Withdrawals are signed by your main wallet.

### Mobile

**How do I link my phone?**
Where phone linking is available, click the QR code icon in the desktop header, approve the request with your main wallet, then reveal the QR code and scan it with your phone. The phone then trades with the trading key you approved; deposits, withdrawals and transfers still need your main wallet on desktop. Approving again replaces the phone's key, and you can remove it on the API Wallet page.

---

## Troubleshooting

### Wallet won't connect
- Refresh the page and try again.
- Ensure your wallet is unlocked and on a supported network.
- Disable conflicting wallet extensions.
- Try a different supported wallet or browser.

### Transactions failing or stuck
- Check that you have sufficient balance for the trade and network fees.
- With an external wallet, verify you approved the trading agent (the first trade requires a one-time approval).
- Wait for network congestion to clear, then retry.

### Prices or charts not updating
- Check your internet connection.
- Refresh the page to re-establish the real-time data connection.
- Disable browser extensions that may block real-time connections.

### Mobile link not working
- The QR code is short-lived and closes when you leave the window — reveal a new one and scan it right away.
- Make sure the phone opens the same network (mainnet or testnet) as the desktop.
- If importing fails, approve again on desktop and scan the new code.

> If an issue persists, please contact support with details (see below).

---

## Contact Support

- **Email:** support@sairn.ai
- **Help Center / Docs:** https://app.sairn.ai/docs
- **Community:** coming soon

When contacting us, please include:
- a clear description of the issue and what you expected to happen;
- steps to reproduce;
- your **wallet address** (never your private key or seed phrase);
- screenshots or error messages, if available;
- your browser, operating system, and device.

> **Security reminder:** We will never ask for your private key, seed phrase, or password. Ignore anyone who does.

---

## Reporting Bugs & Feedback

- **Bug reports:** support@sairn.ai
- **Feature requests & feedback:** support@sairn.ai
- **Security vulnerabilities:** please report responsibly to support@sairn.ai. Do not disclose publicly until we have had a reasonable opportunity to address the issue.

---

## Response Times

We aim to respond within the following target windows (business days, UTC):

| Channel | Target First Response |
|---|---|
| Critical security issues | Within 24 hours |
| General support email | 1–2 business days |
| Bug reports | 2–3 business days |
| Feature requests / feedback | As capacity allows |

These are targets, not guarantees, and may vary with support volume.
