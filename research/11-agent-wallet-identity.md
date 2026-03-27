# Agent Wallets, Identity & Permissions

## Executive Summary

- Hyperliquid's agent wallet system provides permissioned signers that can trade on behalf of a master account without holding funds, offering a clean security boundary for automated trading.
- Account limits are strict: 1 unnamed + 3 named agents per account, 2 named agents per subaccount. Named agents are replaceable by re-registering with the same name.
- Privy offers a turnkey integration path for embedded wallets with agent registration, sub-account management, and expiration-based agent scoping on Hyperliquid.
- AI agents holding crypto wallets create a new legal frontier: no KYC compliance path exists for autonomous agents, liability for losses is undefined, and regulatory frameworks lag behind the technology.
- Security approaches are maturing rapidly: TEE-based signing, HSM-backed root keys, hardware wallet verification (MoonPay + Ledger), and EIP-712 payload filtering all address different threat vectors.

---

## Hyperliquid Agent Wallet System

### Core Architecture

Hyperliquid's agent wallet (also called "API wallet") system is a permissioned signer model. An agent wallet is a separate Ethereum keypair that is authorized to sign exchange actions (placing orders, cancelling orders, managing positions) on behalf of a master wallet. The agent wallet never holds user funds and cannot initiate withdrawals.

This architecture is fundamentally different from giving a bot your private key. The master wallet retains full control: it can revoke agent access at any time, and the agent's permissions are limited to exchange operations. Funds remain custodied by the master account on the Hyperliquid L1.

### The `approveAgent` Action

Agent wallets are authorized via the `approveAgent` exchange endpoint, which uses EIP-712 typed data signing. The master wallet signs a message that grants a specific agent wallet address the right to act on its behalf.

Key parameters:
- `agentAddress`: the Ethereum address of the agent wallet
- `agentName`: optional name identifier (e.g., "trading-bot-alpha", "rabby-mobile")
- `nonce`: timestamp-based nonce for replay protection

When `agentName` is provided, re-registering with the same name replaces the previous agent. This enables key rotation without accumulating stale authorizations.

### Account Structure and Limits

The limits are well-defined and relatively tight:

| Scope | Unnamed Agents | Named Agents |
|-------|---------------|--------------|
| Master account | 1 | 3 |
| Per subaccount | 0 | 2 |

These limits mean a single Hyperliquid account can support a maximum of approximately 5 concurrent automated processes (1 unnamed + 3 named on master, plus 2 per subaccount). For a platform like HypeTerminal that may want to run multiple strategies per user, subaccount management becomes critical.

### Nonce Management

Hyperliquid requires careful nonce handling when multiple agents operate concurrently. The official recommendation is to use a separate API wallet per trading process to avoid nonce collisions. Nonces are timestamp-based (milliseconds since epoch), so concurrent operations from the same agent wallet can conflict.

---

## Permission Scoping

### What Agent Wallets Can Do

Agent wallets on Hyperliquid are authorized for exchange operations:
- Place orders (limit, market, trigger)
- Cancel orders
- Modify orders
- Manage positions (close, adjust leverage)
- Transfer between subaccounts (when authorized)
- Set referral codes

### What Agent Wallets Cannot Do

- Withdraw funds from the exchange
- Transfer funds off-chain
- Approve other agent wallets
- Modify account-level settings (e.g., margin mode changes require master signature in some cases)

This is a trade-only permission model. There is no granular permission scoping within trade operations --- an agent that can place orders can also cancel them, and there is no read-only mode for agents (read access is public via the info API).

### Implications for HypeTerminal

The lack of granular permissions means HypeTerminal cannot create "view-only" agent wallets or restrict an agent to specific markets. Any agent authorized for a master account can trade any asset on that account. Risk management must be implemented at the application layer, not the protocol layer.

---

## Privy Integration

### Overview

Privy provides an embedded wallet infrastructure that simplifies agent wallet creation and management for Hyperliquid. Their Hyperliquid recipe covers the full lifecycle: master wallet creation, agent wallet registration, and trading client setup.

### Integration Flow

1. **Master Wallet**: Privy creates an embedded wallet on Ethereum for the user (no seed phrase management required).
2. **Agent Registration**: The application creates a new keypair, then uses the master wallet to sign an `approveAgent` transaction authorizing this keypair.
3. **Trading Client**: An exchange client is initialized with the agent wallet's private key, scoped to the master account.

### Sub-Account Management

Privy supports creating and managing Hyperliquid subaccounts:
- Master accounts can create subaccounts and approve separate agent wallets for each
- Each subaccount has its own margin and positions, providing strategy isolation
- Agent wallets for subaccounts are limited to 2 named agents per subaccount

### Agent Expiration

Agent wallets can be given an expiration timestamp by encoding it in the agent name (e.g., "Trading Bot valid_until 1720000000"). This is a convention, not a protocol-enforced mechanism --- the application must check and rotate expired agents.

### Benefits for HypeTerminal

- **No seed phrase UX**: Users sign up and get a wallet without managing mnemonics
- **Programmatic agent lifecycle**: Create, authorize, and revoke agents via API
- **Sub-account isolation**: Different strategies can run on different subaccounts with separate risk boundaries
- **Server-side signing**: Agent wallets can be managed server-side for always-on bots

---

## Multi-Sig and Approval Flows

### Hypersig

Hypersig (hypersig.xyz) is a multisig platform built specifically for Hyperliquid power users. It addresses scenarios where high-value operations require multiple approvals before execution.

### Approval Flow Patterns for Agent Trading

For HypeTerminal, several approval patterns are relevant:

1. **Pre-trade approval**: Agent proposes a trade, human approves before execution. High latency but maximum control.
2. **Post-trade notification**: Agent executes within pre-defined parameters, human is notified. Low latency, relies on parameter constraints.
3. **Threshold-based approval**: Trades below a dollar threshold execute automatically; above the threshold, human approval is required.
4. **Multi-party approval**: For shared accounts or fund management, multiple signers must approve large trades.

### Implementation Considerations

Hyperliquid's agent wallet system does not natively support approval flows. Any approval mechanism must be implemented at the application layer:
- Queue proposed trades in a database
- Require human signature (or multi-sig) before the agent wallet submits the order
- Use time-locks for large position changes

---

## Agent Identity and Reputation

### Performance Tracking

For agentic trading platforms, tracking agent performance is essential for trust:
- **P&L attribution**: Track realized and unrealized P&L per agent wallet
- **Win rate and Sharpe ratio**: Statistical measures of agent quality
- **Maximum drawdown**: Worst-case loss behavior
- **Trade frequency and volume**: Activity metrics
- **Strategy consistency**: Does the agent behave as described?

### Trust Scores

A trust score system could incorporate:
- Historical performance data (verifiable on-chain via Hyperliquid's trade history)
- Code audit status (for open-source agents)
- Runtime environment verification (TEE attestation)
- User ratings and reviews
- Time in operation (longer track record = higher trust)

### On-Chain Verifiability

Hyperliquid's transparent order book and trade history enable verifiable agent performance. Every trade executed by an agent wallet is attributable to that wallet address, creating an immutable track record. This is a significant advantage over opaque centralized platforms.

---

## API Key Management

### Current State

Hyperliquid's API key model is essentially the agent wallet system itself. There are no separate "API keys" --- the agent wallet's private key IS the API credential. This means:
- **Generation**: Create a new Ethereum keypair and authorize it via `approveAgent`
- **Rotation**: Register a new agent with the same name (replaces the old one)
- **Revocation**: Send an `approveAgent` with the agent address set to the zero address, or replace the named agent

### Best Practices

- Generate agent wallets in a secure environment (TEE, HSM, or at minimum encrypted storage)
- Use one agent wallet per trading process/strategy
- Rotate agent wallets regularly (weekly or monthly)
- Monitor agent wallet activity for unauthorized trades
- Never reuse agent wallet private keys across different services
- Store private keys encrypted at rest, decrypt only in memory during signing

### HypeTerminal Key Management Architecture

A recommended architecture for HypeTerminal:
1. User authenticates via Privy (embedded wallet or external wallet)
2. HypeTerminal generates an agent keypair server-side in a secure enclave
3. User's master wallet signs the `approveAgent` transaction
4. Agent private key is stored encrypted, accessible only by the trading engine
5. Rotation is triggered on a schedule or on-demand by the user
6. Revocation is immediate upon user request or anomaly detection

---

## Wallet Abstraction for Agent Onboarding

### The Onboarding Problem

Traditional crypto trading requires: install wallet extension, create wallet, backup seed phrase, bridge funds, connect to exchange, generate API keys. This is a 10+ step process with multiple failure points.

### Abstraction Layers

Modern wallet abstraction for agent onboarding:

1. **Social login to wallet**: Privy, Dynamic, Turnkey --- user signs in with email/Google/Apple, gets an embedded wallet.
2. **Automatic agent creation**: Upon first trade or bot activation, the platform creates and authorizes an agent wallet transparently.
3. **Gasless approvals**: Meta-transactions or relayers can sponsor the `approveAgent` transaction gas cost.
4. **One-click strategy deployment**: User selects a strategy, platform handles all wallet and agent plumbing.

### Turnkey Integration

Turnkey provides secure EIP-712 signing infrastructure specifically tested with Hyperliquid. Their approach uses hardware-backed key generation and policy-based signing rules --- the system can allow `approveAgent` payloads while rejecting unrelated signing requests.

---

## AI Agent Crypto Wallet Legal Risks

### The Legal Frontier

As reported by Yahoo Finance and CoinDesk, AI agents holding crypto wallets create unprecedented legal challenges:

- **No legal personhood**: AI agents cannot be legal entities. They cannot sign contracts, be sued, or be held liable. Responsibility falls on the deployer, operator, or platform.
- **KYC/AML compliance**: AI agents cannot satisfy Know Your Customer requirements. An agent that holds a wallet and transacts autonomously operates outside existing compliance frameworks.
- **Liability gap**: If an AI agent makes a trade that causes significant losses (to the user or to counterparties), the chain of liability is unclear. Is it the platform? The agent developer? The user who activated it?
- **Regulatory uncertainty**: No jurisdiction has established clear rules for autonomous AI agents in financial markets. The SEC, CFTC, and international regulators are still formulating approaches.

### Risk Mitigation for HypeTerminal

- **Agent wallets do not hold funds**: Hyperliquid's architecture helps --- the agent cannot withdraw, only trade. This limits the blast radius.
- **Clear user agreements**: Users must acknowledge that they are authorizing automated trading and accept the risks.
- **Audit trail**: Every agent action is logged on-chain, providing transparency.
- **Kill switches**: Immediate agent revocation must be available at all times.
- **Regulatory monitoring**: Stay current with evolving regulations in target jurisdictions.

### Emerging Solutions (2026)

- **MoonPay + Ledger**: MoonPay integrated Ledger hardware signing for AI agents, requiring hardware verification for every transaction. This addresses the "trust" problem by keeping humans in the signing loop.
- **Electric Capital framework**: Electric Capital published analysis on the legal frontier of AI agent wallets, advocating for new regulatory categories.
- **Insurance products**: Early-stage insurance offerings for AI agent trading losses are beginning to appear.

---

## Security: Key Storage, HSMs, and TEE-Based Signing

### Threat Model

For an agentic trading platform, the primary threats are:
1. **Key extraction**: Attacker obtains the agent wallet's private key
2. **Unauthorized trade execution**: Attacker sends trades via a compromised agent
3. **Prompt injection**: Attacker manipulates the AI agent's decision-making
4. **Man-in-the-middle**: Attacker intercepts and modifies trade instructions
5. **Infrastructure compromise**: Server breach exposes keys and trading logic

### Hardware Security Modules (HSMs)

HSMs protect cryptographic keys in tamper-resistant hardware. For agent wallet key management:
- Root keys (master wallet) stored in HSM
- Agent wallet keys can be derived from HSM-protected master keys
- Signing operations happen inside the HSM boundary
- Keys never exist in plaintext outside the hardware

### Trusted Execution Environments (TEEs)

TEEs (Intel SGX, AMD SEV, ARM CCA) provide isolated execution environments:
- Agent trading logic runs inside the TEE enclave
- Private keys are sealed to the enclave and inaccessible to the host OS
- Remote attestation proves the code running is unmodified
- Even the server operator cannot access keys or trading logic

The recommended architecture combines both: HSMs for root key storage, TEEs for hot-path signing and agent execution. This is the approach gaining traction in 2026, with the confidential computing market projected to reach $350B by 2032.

### Practical Security Tiers for HypeTerminal

| Tier | Approach | Cost | Security |
|------|----------|------|----------|
| Basic | Encrypted key in database | Low | Moderate |
| Standard | Cloud KMS (AWS/GCP) | Medium | Good |
| Advanced | TEE-based signing (Turnkey) | Medium-High | High |
| Maximum | HSM + TEE combination | High | Very High |

For an initial launch, Cloud KMS or Turnkey integration provides a strong security posture without the complexity of managing HSM infrastructure.

---

## Opportunities for HypeTerminal

1. **Seamless agent onboarding**: Abstract away all wallet complexity. User clicks "Enable AI Trading" and the platform handles agent wallet creation, authorization, and key management.
2. **Strategy marketplace**: Allow users to deploy pre-built or community-created trading agents with one click, each running on its own agent wallet with isolated risk.
3. **Transparent performance tracking**: Leverage on-chain trade history to build verifiable agent leaderboards and trust scores.
4. **Sub-account strategy isolation**: Use Hyperliquid subaccounts to run multiple strategies with independent margin and risk parameters.
5. **Graduated autonomy**: Start with human-approval-required mode, graduate to fully autonomous as the user gains confidence in an agent.
6. **Security as a feature**: TEE-based execution and hardware-backed signing as differentiators vs. platforms that store keys in plaintext.

---

## Risks & Challenges

- **Agent wallet limits**: 3 named agents per account constrains multi-strategy deployments. Workaround: heavy use of subaccounts.
- **No granular permissions**: Cannot restrict an agent to specific markets or position sizes at the protocol level. Must enforce in application.
- **Legal liability**: Unclear who is responsible when an AI agent causes losses. HypeTerminal as the platform may bear significant liability.
- **Key management complexity**: Secure key storage adds infrastructure cost and operational complexity.
- **Nonce collisions**: Concurrent agents on the same account require careful nonce management to avoid failed transactions.
- **Regulatory risk**: Regulations may restrict or prohibit AI-driven trading on crypto exchanges in certain jurisdictions.
- **User trust**: Users must trust the platform with agent wallet keys. Any breach would be catastrophic for reputation.

---

## Open Questions

1. Will Hyperliquid expand the agent wallet limit per account? The current 3 named agents may be insufficient for power users running many strategies.
2. Will Hyperliquid introduce granular permissions (e.g., per-market or per-size-limit agent scoping)? This would significantly improve the security model.
3. How should HypeTerminal handle liability for AI agent trading losses? What terms of service and disclaimers are needed?
4. Should agent wallet keys be stored server-side (always-on trading, higher risk) or client-side (user-controlled, requires browser to be open)?
5. What is the right balance between autonomous execution and human-in-the-loop approval for different user segments?
6. How will insurance products for AI agent trading evolve, and should HypeTerminal integrate or offer them?
7. Will the Agentic AI Foundation (AAIF) produce standards for AI agent identity that could apply to trading agents?
8. How should agent reputation/trust scores handle strategy changes --- does a previously profitable agent get reset if its strategy fundamentally changes?

---

## Sources

- [Privy: Agent Wallets for Hyperliquid](https://docs.privy.io/recipes/hyperliquid/agents-and-subaccounts)
- [Hyperliquid: Nonces and API Wallets](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/nonces-and-api-wallets)
- [Hyperliquid: Exchange Endpoint](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint)
- [Dwellir: approveAgent Documentation](https://www.dwellir.com/docs/hyperliquid/approveAgent)
- [Turnkey x Hyperliquid: Secure EIP-712 Signing](https://www.turnkey.com/blog/hyperliquid-secure-eip-712-signing)
- [Hypersig: Multisig for Hyperliquid](https://www.hypersig.xyz/)
- [Yahoo Finance: AI Agent Crypto Wallets Legal Risks](https://finance.yahoo.com/news/ai-agent-crypto-wallets-create-120215779.html)
- [CoinDesk: Crypto Wallets for AI Agents Legal Frontier](https://www.coindesk.com/business/2026/02/24/crypto-wallets-for-ai-agents-are-creating-a-new-legal-frontier-says-electric-capital)
- [CoinDesk: MoonPay Ledger-Secured AI Agents](https://www.coindesk.com/tech/2026/03/13/moonpay-introduces-ledger-secured-ai-crypto-agents-to-address-wallet-key-risks)
- [TRM Labs: Autonomous AI Agents and Financial Crime](https://www.trmlabs.com/resources/blog/autonomous-ai-agents-and-financial-crime-risk-responsibility-and-accountability)
- [Trezal Labs: TEE Complete Guide 2026](https://www.trezalabs.com/blog/what-is-a-trusted-execution-environment-tee-complete-guide)
- [Phala: TEE vs Enclave vs HSM](https://phala.com/learn/23-ciso-guide-to-confidential-computing-executive-decision)
- [OneKey: Hyperliquid Trading 2026](https://onekey.so/blog/ecosystem/hyperliquid-trading-in-2026-whats-changed-best-wallets-4ded7b/)
