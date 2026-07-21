# gatu Documentation

Welcome to the official documentation for **gatu**, a professional trading terminal for the Hyperliquid decentralized exchange.

> _Last updated: June 15, 2026_

---

## What is gatu?

gatu is a fast, non-custodial trading terminal for Hyperliquid. It provides a professional interface for trading perpetual futures and spot markets — with real-time market data, advanced charting, and a streamlined order-execution workflow — while keeping you in full control of your funds and private keys.

Guiding principles:

- **Non-custodial** — gatu never holds your funds or private keys. You trade directly from your own wallet.
- **Fast** — orders are signed locally by a delegated trading key (agent wallet), so you can trade without a wallet pop-up on every action.
- **Professional** — real-time order books, depth, charts, and account management in a single workspace.

---

## Core Features

### Trading
- **Perpetual futures** — trade perps with leverage, market and limit orders, and advanced order types (TWAP, take-profit/stop-loss, reduce-only).
- **Spot markets** — trade spot pairs with real-time order books and instant execution.
- **Builder markets** — access builder-deployed perpetual markets.

### Market Data & Charting
- Real-time order book, trades, and price updates over a live data connection.
- Advanced candlestick charts with multiple intervals and drawing tools.
- Market overview, favorites, and quick token switching.

### Wallet & Account
- **Flexible sign-in** — connect an existing wallet (e.g., browser extension or mobile wallet) or sign in with email to use an embedded wallet.
- **Agent (API) wallet** — approve a delegated trading key once to enable seamless, pop-up-free order signing. The agent key can place and cancel orders but cannot withdraw your funds.
- **Deposits & withdrawals** — manage your exchange balance directly from the terminal.

### Cross-Chain Bridging
- Move assets from supported networks into your trading account using an integrated bridge.

### Mobile Device Linking
- Securely link a mobile device using an encrypted, time-limited pairing flow protected by a separate pairing code.

---

## Getting Started

Follow these steps to place your first trade:

1. **Open gatu** — navigate to https://app.gatu.ai.
2. **Connect your wallet** — click **Connect Wallet** and choose your preferred method (external wallet or email sign-in).
3. **Fund your account** — deposit funds directly, or use the built-in bridge to move assets from another network.
4. **Approve the trading agent** — the first time you trade, approve the agent (API) wallet. This is a one-time signature that enables fast order signing.
5. **Place a trade** — select a market, choose your order type and size, and submit.

> **Tip:** Sensitive actions such as agent approval, builder-fee acknowledgement, deposits, and withdrawals are signed by your **main wallet**. Routine order placement and cancellation are signed by the **local agent key** for speed.

---

## Common Use Cases

- **Active perps trading** — manage leverage, positions, and risk with advanced order types.
- **Spot trading & swaps** — trade spot markets or swap tokens with real-time pricing.
- **Funding & bridging** — move assets into your trading account from supported networks.
- **Mobile trading** — link your phone to trade away from your desktop.
- **Portfolio monitoring** — track positions, balances, open orders, funding, and trade history.

---

## Table of Contents (Detailed Guides)

> The sections below are placeholders for more detailed documentation. Replace each link as your docs expand.

1. **Getting Started**
   - [Connecting a Wallet](#)
   - [Depositing & Withdrawing](#)
   - [Approving the Trading Agent](#)
2. **Trading**
   - [Placing Orders](#)
   - [Order Types & Time-in-Force](#)
   - [Leverage & Margin](#)
   - [TWAP Orders](#)
   - [Take-Profit & Stop-Loss](#)
3. **Markets**
   - [Perpetuals](#)
   - [Spot](#)
   - [Builder Markets](#)
4. **Account Management**
   - [Positions & Balances](#)
   - [Order & Trade History](#)
   - [Funding Payments](#)
5. **Bridging & Transfers**
   - [Cross-Chain Bridge](#)
   - [Internal Transfers](#)
6. **Mobile**
   - [Linking a Device](#)
   - [Security Model](#)
7. **Reference**
   - [Fees](#)
   - [Supported Networks](#)
   - [Glossary](#)
   - [Keyboard Shortcuts](#)

---

## Help & Legal

- Need help? See the [Support](/support) page or email support@gatu.ai.
- [Terms of Service](/terms)
- [Privacy Policy](/privacy)
- [Risk Disclosure](/risk)
