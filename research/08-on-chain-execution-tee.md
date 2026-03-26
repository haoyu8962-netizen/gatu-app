# On-Chain Execution, TEEs & Trustless Trading Agents

## Executive Summary

- **Trusted Execution Environments (TEEs)** provide hardware-isolated secure enclaves for trading agent logic, achieving **sub-100ms signing latency** (Turnkey) -- 50-100x faster than MPC-based alternatives -- making them viable for real-time trading on Hyperliquid.
- **ERC-8004**, launched on Ethereum mainnet on January 29, 2026, establishes the first trustless AI agent standard with identity, reputation, and validation registries -- co-developed by the Ethereum Foundation, Google, Coinbase, and MetaMask, with 22,900+ registrations in its first three days.
- **OKX launched its Agentic Wallet** (March 18, 2026) and **OnchainOS toolkit** (March 3, 2026) for AI agent developers, supporting 60+ chains, 500+ DEXs, and handling 1.2 billion daily API calls -- signaling major exchange investment in agentic infrastructure.
- **Hyperliquid's HyperEVM + CoreWriter** system contract provides a native bridge for smart contracts to execute orders on HyperCore, making it structurally well-positioned for autonomous agent deployment with explicit gas budgeting and latency safeguards.
- The **hybrid execution model** (off-chain reasoning + on-chain settlement) is emerging as the practical architecture for trading agents, balancing latency, cost, trust, and privacy tradeoffs. Fully on-chain AI remains aspirational but is advancing rapidly through infrastructure like EigenCompute and 0G.

---

## 1. TEEs: Hardware-Isolated Secure Enclaves for Trading Logic

### 1.1 What Are TEEs?

A Trusted Execution Environment is a hardware-level isolated area within a processor that runs code in a protected enclave. Even the host operating system, hypervisor, and hardware owner cannot read or tamper with the data or code executing inside the TEE. For trading agents, this means:

- **Trading logic privacy**: proprietary strategies execute in an enclave where no one -- not even the server operator -- can observe the algorithm
- **Key security**: private keys for signing transactions are generated and stored exclusively within the TEE
- **Attestation**: the TEE can produce cryptographic proof that specific code ran unmodified, enabling verifiable execution

### 1.2 Performance: Near-Native Speed

TEE-based signing achieves performance characteristics that make it viable for real-time trading:

| Approach | Signing Latency | Notes |
|----------|----------------|-------|
| TEE (Turnkey) | 50-100ms | Near-native speed, single-machine operation |
| MPC (multi-party) | 500ms+ | Requires network roundtrips between signer nodes |
| HSM (traditional) | 10-50ms | Hardware security module, single point |

Turnkey, built by the team that created Coinbase Custody, achieves the fastest signing latency in the market at 50-100ms. This is 50-100x faster than MPC-based alternatives, making TEEs the clear choice for latency-sensitive trading applications.

For Hyperliquid trading specifically, where order placement latency directly impacts execution quality, sub-100ms signing is sufficient for all but the most latency-sensitive HFT strategies.

### 1.3 TEE Implementations in Crypto

Several significant TEE implementations have emerged:

- **Flashbots + Nous Research**: introduced provably autonomous agents with exclusive control of digital assets using Intel TDX. Even developers lose access to credentials after deployment.
- **Phala Network**: hosts agents (Spore, aiPool) that operate entirely within TEE environments, with wallets and keys fully controlled by the agent itself -- achieving complete autonomy over crypto assets.
- **OKX Agentic Wallet**: private keys secured inside TEE, ensuring LLMs and agents cannot access seed phrases or private keys directly.
- **0G Aristotle Mainnet**: every AI inference call executed inside a hardware enclave (TEE) and cryptographically verified.

### 1.4 TEE Trust Model and Limitations

TEEs are not without risks:

- **Hardware vulnerabilities**: side-channel attacks (Spectre, Meltdown variants) have historically affected Intel SGX enclaves
- **Vendor trust**: users must trust the hardware manufacturer (Intel, AMD, ARM) to implement the TEE correctly
- **Attestation verification**: verifying TEE attestations on-chain adds complexity and gas costs
- **Key rotation**: managing key lifecycle within TEEs requires careful protocol design

---

## 2. ERC-8004 + Moltbot: Trustless AI Trading Agent Standard

### 2.1 ERC-8004 Architecture

ERC-8004, live on Ethereum mainnet since January 29, 2026, establishes trust infrastructure through three on-chain registries:

1. **Identity Registry**: portable agent identifiers using ERC-721 NFTs. Each agent's identity is technically tradable -- selling an agent's NFT transfers ownership of the agent and its accumulated reputation.

2. **Reputation Registry**: standardized feedback and rating collection, enabling agents to build verifiable track records over time. This is particularly valuable for trading agents, where historical performance is the primary trust signal.

3. **Validation Registry**: cryptographic and economic verification of agent work, supporting proof that an agent executed its stated strategy correctly.

### 2.2 Development and Adoption

The standard was led by the Ethereum Foundation's dAI team and jointly developed with Google, Coinbase, and MetaMask. Adoption metrics from launch:

- **22,900+ registrations** in the first three days
- Active integration efforts with major DeFi protocols including dYdX, Hyperliquid, Lighter, and Uniswap

### 2.3 Moltbot Integration for Trading

ERC-8004 and Moltbot combine to create a trustless cryptocurrency trading agent:

- **ERC-8004** provides decentralized identity and reputation
- **Moltbot** adds autonomous decision-making as an always-on LLM-based assistant with persistent memory and environmental interaction capabilities

The agent-to-agent commerce model uses **HTTP + x402 protocol**: the trading agent sends a request to a data-provider agent, receives an HTTP 402 "Payment Required" response, executes an on-chain micropayment, and receives the data -- enabling machine-speed procurement of market intelligence.

### 2.4 Relevance to Hyperliquid

ERC-8004 contracts can be deployed on HyperEVM, with trading authority delegated using API wallets and/or the CoreWriter bridge. Hyperliquid is structurally well-positioned to adopt ERC-8004 natively, with explicit gas budgeting and delayed execution designed to reduce latency manipulation.

---

## 3. OKX Agentic Wallet and OnchainOS

### 3.1 OnchainOS Toolkit (March 3, 2026)

OKX launched an AI-focused upgrade to its OnchainOS developer platform, positioning it as infrastructure for autonomous crypto trading agents:

- Unifies **wallet infrastructure, liquidity routing, and on-chain data feeds**
- Agents can execute high-level trading instructions across **60+ blockchains** and **500+ DEXs**
- Developers access capabilities via **natural-language "AI Skills"**, Model Context Protocol (MCP) integrations, and REST APIs
- Already handling **1.2 billion daily API calls** and approximately **$300 million in daily trading volume**

### 3.2 OKX Agentic Wallet (March 18, 2026)

Purpose-built for AI agents to securely hold assets and autonomously execute on-chain transactions:

- **Multi-chain support**: trade and transfer across nearly 20 networks (Solana, EVM chains)
- **Natural language execution**: agents connect via MCP or CLI, receive plain-language instructions
- **TEE-secured keys**: private keys in Trusted Execution Environment; LLMs cannot access seed phrases
- **Pre-execution risk assessment**: every transaction is risk-assessed before execution
- **Gas-free transactions** on X Layer

### 3.3 Implications for the Market

OKX's investment signals that **major exchanges view agentic infrastructure as a core product category**, not an experiment. The MCP integration pattern (natural language instructions translated to on-chain actions) is likely to become a standard interface pattern. HypeTerminal should monitor this as both a competitive threat and an architectural reference.

---

## 4. Hyperliquid HyperEVM + CoreWriter as Execution Layer

### 4.1 Architecture Overview

Hyperliquid operates a dual-layer architecture:

- **HyperCore**: the high-performance order book and matching engine (L1 consensus)
- **HyperEVM**: an EVM-compatible execution environment running alongside HyperCore

The **CoreWriter** system contract (address `0x3333333333333333333333333333333333333333`) bridges these layers, enabling HyperEVM smart contracts to submit structured actions to HyperCore.

### 4.2 CoreWriter Capabilities

CoreWriter supports submitting the following actions from HyperEVM to HyperCore:

- Limit orders and market orders
- Order cancellations
- Vault transfers
- API wallet (agent wallet) management

This means a smart contract on HyperEVM can autonomously place and manage orders on the Hyperliquid order book -- the foundational capability for on-chain trading agents.

### 4.3 Execution Model

HyperEVM uses a **dual-block architecture**:

- **Small blocks**: ~1 second interval, 2M gas limit (for frequent, lightweight operations)
- **Large blocks**: ~1 minute interval, 30M gas limit (for heavier operations like deployments)

The delayed execution design provides latency safeguards -- actions submitted via CoreWriter are not executed instantaneously on HyperCore, which reduces the attack surface for latency manipulation.

### 4.4 Agent Wallet System

Hyperliquid's API wallet system enables delegated trading authority:

- A master wallet can authorize an API wallet (agent wallet) with specific permissions
- The agent wallet can place and cancel orders on behalf of the master wallet
- Permissions can be revoked by the master wallet at any time
- This maps naturally to an agent architecture: each agent gets its own API wallet with scoped authority

---

## 5. On-Chain vs Off-Chain Agent Execution: Tradeoffs

### 5.1 Comparison Matrix

| Dimension | On-Chain | Off-Chain | Hybrid |
|-----------|----------|-----------|--------|
| **Latency** | Seconds to minutes (block time) | Milliseconds | Sub-second reasoning, block-time settlement |
| **Cost** | Gas fees per action | Server costs only | Gas only for settlement |
| **Trust** | Fully verifiable, trustless | Trust the operator | Verifiable settlement, trusted reasoning |
| **Privacy** | Public by default | Private by default | Private reasoning, public settlement |
| **Auditability** | Immutable on-chain record | Requires separate audit infrastructure | Hybrid: hashes on-chain, details off-chain |
| **Scalability** | Limited by block space | Highly scalable | Scalable reasoning, constrained settlement |
| **Resilience** | Survives operator failure | Requires uptime management | Mixed |

### 5.2 The Hybrid Consensus

Most production teams in 2026 use a **hybrid model** because off-chain wins on speed and cost while on-chain wins on settlement guarantees and public verifiability. The practical pattern:

1. **Off-chain**: agent reasoning, signal processing, strategy computation, risk checks
2. **On-chain**: order submission, position management, settlement, audit anchoring

For Hyperliquid specifically, the execution model is already hybrid by design: HyperEVM contracts (on-chain logic) submit actions to HyperCore (optimized matching engine) via CoreWriter.

### 5.3 Privacy Considerations

Trading logic privacy is a critical concern. On-chain execution makes strategy logic observable, enabling:

- Front-running by adversaries who reverse-engineer agent behavior
- Copy-trading that dilutes strategy alpha
- Targeted manipulation of known agent patterns

TEE-based execution preserves privacy while enabling attestation -- the best of both worlds for proprietary trading strategies.

---

## 6. Privacy of Trading Logic in TEE Enclaves

### 6.1 The Privacy Problem

Trading strategies are intellectual property. Deploying them on-chain (even compiled) exposes patterns through transaction analysis. Deploying them off-chain requires trusting the server operator.

### 6.2 TEE as the Solution

TEEs solve this by running strategy logic in an enclave where:

- The **code and data are encrypted** in memory
- The **server operator cannot inspect** the running strategy
- **Cryptographic attestation** proves the correct code ran without modification
- **Output is controlled**: only signed transactions exit the enclave, not strategy internals

### 6.3 Practical Architecture for HypeTerminal

A TEE-based agent execution model for HypeTerminal:

1. User deploys agent code and configuration to a TEE enclave
2. TEE generates signing keys internally (never exposed externally)
3. Agent receives market data feed, processes signals within the enclave
4. Agent produces signed order transactions that are submitted to Hyperliquid
5. Attestation proofs are logged for audit purposes
6. User can verify their agent ran the expected code via attestation verification

---

## 7. EigenCloud/EigenCompute for Agent Hosting

### 7.1 Architecture

EigenCloud provides a verifiable cloud infrastructure stack:

- **EigenDA**: data availability layer
- **EigenVerify**: dispute resolution system
- **EigenCompute**: execution engine for containerized applications
- All secured by restaking of ETH and EIGEN tokens

### 7.2 EigenCompute for Trading Agents

EigenCompute, which entered **Mainnet Alpha in January 2026**, offers:

- **Containerized execution**: run agent logic as Docker containers with cryptoeconomic security enforced on-chain
- **AWS-like developer experience**: familiar deployment patterns but with on-chain verifiability
- **Cryptographic guarantees**: proof that agents ran unmodified code with correct model weights and produced genuine, untampered outputs

elizaOS demonstrated this by building cryptographically verifiable agents using EigenCompute and EigenAI -- proving the pattern works for autonomous agent hosting.

### 7.3 Relevance to HypeTerminal

EigenCompute could serve as the hosting layer for HypeTerminal trading agents:

- Agents run in verified containers with attestation proofs
- Users don't need to trust HypeTerminal's servers -- they can verify execution
- The cryptoeconomic security model (staked ETH) provides financial guarantees against misbehavior
- The "Agentic Intranets" phase (2026) involves agents operating continuously across enterprise systems, aligning with always-on trading agent requirements

---

## 8. Academic Research: "Autonomous Agents on Blockchains" (arxiv 2601.04583)

### 8.1 Overview

Published January 8, 2026 by Saad Alqithami, this paper provides the most comprehensive academic treatment of the agent-blockchain intersection, systematizing 317 relevant works from an initial pool of over 3,000 records.

### 8.2 Five-Part Integration Taxonomy

The paper establishes a taxonomy of how agents interact with blockchains:

1. **Read-only analytics**: agents observe on-chain state without transacting
2. **Simulation and intent generation**: agents formulate transaction intents based on analysis
3. **Delegated execution**: agents submit transactions through authorized intermediaries
4. **Autonomous signing**: agents hold keys and sign transactions independently
5. **Multi-agent workflows**: multiple agents coordinate complex operations

HypeTerminal agents would primarily operate at levels 3-4 (delegated execution via API wallets, potentially autonomous signing via TEE-held keys).

### 8.3 Threat Model

The paper identifies risks specific to agent-driven transaction pipelines:

- **Prompt injection**: adversaries manipulating agent reasoning through crafted inputs
- **Policy misuse**: agents exploiting ambiguities in their authorization policies
- **Key compromise**: extraction of signing keys from agent infrastructure
- **Adversarial execution dynamics**: MEV extraction, front-running, sandwich attacks
- **Multi-agent collusion**: coordinated agents manipulating markets

### 8.4 Proposed Standards

Two key interface abstractions are proposed:

1. **Transaction Intent Schema**: a portable, unambiguous format for specifying what an agent wants to achieve (not how)
2. **Policy Decision Record**: an auditable, verifiable record of policy enforcement decisions

These standards, if adopted, would provide the interoperability layer for trading agents across platforms -- including Hyperliquid.

---

## 9. Fully On-Chain AI Agents: The Trajectory

### 9.1 Current State

Fully on-chain AI (inference running on-chain) remains largely aspirational due to computational costs, but the trajectory is clear:

- NVIDIA CEO Jensen Huang projected a **$1 trillion agentic AI opportunity** at GTC 2026
- NEAR Protocol's co-founder stated that **"AI agents will be the primary users of blockchain"**
- The Ethereum Foundation sees blockchain as a **coordination and verification layer** in an AI-mediated world
- Alchemy launched a flow (March 2026) where an AI agent uses its own wallet, receives HTTP 402 payment requests, and automatically pays using USDC on Base via x402 -- all without human input

### 9.2 Infrastructure Evolution

The infrastructure for on-chain agents is maturing rapidly:

- **0G Aristotle Mainnet** (live since September 2025): verified compute, persistent memory, on-chain settlement
- **EigenCompute** (Mainnet Alpha January 2026): verifiable off-chain execution with on-chain proofs
- **ERC-8004** (January 2026): identity, reputation, and validation for agents
- **OKX OnchainOS** (March 2026): multi-chain agent execution infrastructure

### 9.3 The Convergence Timeline

The path from current hybrid models to fully on-chain agents:

1. **2026**: hybrid execution dominates (off-chain reasoning, on-chain settlement). TEE-based agents with attestation proofs.
2. **2027-2028**: ZK-proven inference enables verifiable AI computation. Lightweight models run on-chain for specific tasks.
3. **2029+**: purpose-built AI-native chains with sufficient compute for on-chain inference. Full autonomy with cryptographic guarantees.

---

## 10. Opportunities for HypeTerminal

### 10.1 Near-Term (2026)

1. **TEE-based agent execution**: offer agents that run in TEE enclaves with attestation proofs, protecting user strategy privacy
2. **API wallet integration**: leverage Hyperliquid's native agent wallet system for scoped delegation
3. **CoreWriter bridge**: enable smart contract-based agents on HyperEVM that execute on HyperCore
4. **ERC-8004 identity**: assign verifiable on-chain identities to agents, building portable reputation
5. **Paper trading with attestation**: TEE-attested paper trading results that users can verify

### 10.2 Medium-Term (2027)

1. **EigenCompute hosting**: deploy agents on verifiable infrastructure, removing trust in HypeTerminal servers
2. **Agent marketplace**: ERC-8004 identities enable a marketplace where agents with proven track records can be discovered and deployed
3. **Multi-agent coordination**: agents that specialize (one for signals, one for execution, one for risk) and coordinate via on-chain protocols
4. **Cross-platform portability**: agents with ERC-8004 identities that can operate across Hyperliquid, dYdX, and other venues

### 10.3 Long-Term (2028+)

1. **Fully autonomous agents**: agents that manage their own capital, pay for their own compute, and operate without any human intervention
2. **Agent-to-agent markets**: trading agents that buy signals from analysis agents, paying via x402 micropayments
3. **On-chain strategy verification**: ZK proofs that a strategy matches its advertised behavior without revealing the strategy itself

---

## 11. Risks and Challenges

### 11.1 Technical Risks

- **TEE hardware vulnerabilities**: side-channel attacks continue to be discovered; Intel SGX has been deprecated in favor of Intel TDX, but new attack vectors may emerge
- **CoreWriter limitations**: the delayed execution model adds latency that may disadvantage agents in competitive markets
- **Smart contract risk**: bugs in HyperEVM agent contracts could lead to loss of funds
- **Oracle dependencies**: agents that rely on external price feeds inherit oracle manipulation risks

### 11.2 Economic Risks

- **Gas cost volatility**: on-chain execution costs are unpredictable and can spike during high-demand periods
- **MEV on HyperEVM**: as HyperEVM adoption grows, MEV extraction on the EVM side may emerge
- **Strategy crowding**: if multiple agents converge on similar strategies via shared signals, returns degrade and flash-crash risks increase

### 11.3 Regulatory Risks

- **Autonomous trading classification**: regulators may classify autonomous agents as algorithmic trading systems subject to registration requirements
- **Cross-border enforcement**: agents operating across jurisdictions face conflicting regulatory requirements
- **Liability uncertainty**: unclear legal frameworks for agent-caused losses in DeFi

### 11.4 Operational Risks

- **Key management**: TEE key generation is secure but key backup/recovery requires careful design
- **Agent upgrades**: updating agent logic in TEE enclaves while maintaining continuity and attestation chains
- **Monitoring at scale**: observing hundreds of agents across multiple markets requires purpose-built infrastructure

---

## 12. Open Questions

1. **CoreWriter latency budget**: What is the end-to-end latency from CoreWriter submission to HyperCore fill? Is this competitive for the strategies HypeTerminal agents will run?

2. **TEE provider selection**: Should HypeTerminal standardize on Intel TDX, AMD SEV-SNP, or support multiple TEE backends? What are the attestation verification costs on HyperEVM?

3. **ERC-8004 on HyperEVM**: Can ERC-8004 contracts be deployed on HyperEVM today? What modifications are needed for Hyperliquid-specific agent identity (linking to API wallets)?

4. **EigenCompute integration**: Is EigenCompute's Mainnet Alpha stable enough for trading agent workloads? What are the latency characteristics for containerized agents making real-time trading decisions?

5. **Agent wallet permissions**: How granular can API wallet permissions be on Hyperliquid? Can we restrict an agent wallet to specific markets, order types, or size limits at the protocol level?

6. **Privacy vs auditability**: How do we balance TEE-based strategy privacy with the audit trail requirements discussed in the risk guardrails research? Can we provide verifiable audit data without revealing strategy logic?

7. **Multi-agent settlement**: If multiple agents coordinate (e.g., signal agent + execution agent), how are profits attributed and settled? Does ERC-8004's validation registry support this?

8. **Upgrade path**: What is the migration path from current off-chain bot infrastructure to TEE-based or on-chain agent execution? Can this be done incrementally?

9. **Cost model**: What is the total cost of operating a TEE-based agent (infrastructure, gas, attestation) compared to a traditional cloud-hosted bot? At what AUM does the cost become justified?

10. **Competitive moat**: As OKX, Alchemy, and others build agentic infrastructure, what is HypeTerminal's defensible advantage? Is it Hyperliquid-specific optimization, or a broader agent platform play?

---

## Sources

- [Trusted Execution Environments Primer - a16z crypto](https://a16zcrypto.com/posts/article/trusted-execution-environments-tees-primer/)
- [TEE Complete Guide 2026 - Treza Labs](https://www.trezalabs.com/blog/what-is-a-trusted-execution-environment-tee-complete-guide)
- [TEE Application in AI Agents - ChainCatcher](https://www.chaincatcher.com/en/article/2159470)
- [TEEs and Blockchain - Chainlink](https://chain.link/article/trusted-execution-environments-blockchain)
- [MPC, TEEs, and Account Abstraction - Turnkey](https://www.turnkey.com/blog/mpc-tees-and-account-abstraction-programmable-wallets)
- [ERC-8004: Trustless Agents - Ethereum EIP](https://eips.ethereum.org/EIPS/eip-8004)
- [ERC-8004 and Moltbot - Medium](https://medium.com/@gwrx2005/trustless-ai-powered-crypto-trading-agents-with-erc-8004-and-moltbot-58d8789be837)
- [What is ERC-8004 - eco.com](https://eco.com/support/en/articles/13221214-what-is-erc-8004-the-ethereum-standard-enabling-trustless-ai-agents)
- [ERC-8004 Developer Guide - QuickNode](https://blog.quicknode.com/erc-8004-a-developers-guide-to-trustless-ai-agent-identity/)
- [Integrating ERC-8004 into Hyperliquid - Medium](https://medium.com/@gwrx2005/integrating-erc-8004-trustless-agents-and-openclaw-into-dydx-hyperliquid-lighter-and-uniswap-9bfa6d4b608b)
- [OKX OnchainOS AI Toolkit - CoinDesk](https://www.coindesk.com/tech/2026/03/03/okx-jumps-into-ai-agent-race-with-new-onchainos-toolkit)
- [OKX Agentic Wallet Launch](https://www.okx.com/en-us/help/okx-wallet-officially-launches-agentic-wallet)
- [Introducing OKX Agentic Wallet](https://www.okx.com/en-us/learn/agentic-wallet)
- [CoreWriter on Hyperliquid - HypeRPC](https://hyperpc.app/blog/hyperliquid-corewriter)
- [Demystifying Hyperliquid Precompiles - Ambit Labs](https://medium.com/@ambitlabs/demystifying-the-hyperliquid-precompiles-and-corewriter-ef4507eb17ef)
- [HyperEVM Documentation - Hyperliquid](https://hyperliquid.gitbook.io/hyperliquid-docs/hyperevm)
- [Autonomous Agents on Blockchains - arxiv 2601.04583](https://arxiv.org/abs/2601.04583)
- [EigenCloud Verifiable AI Launch](https://blog.eigencloud.xyz/eigencloud-brings-verifiable-ai-to-mass-market-with-eigenai-and-eigencompute-launches/)
- [elizaOS on EigenCloud](https://blog.eigencloud.xyz/how-elizaos-built-cryptographically-verifiable-agents/)
- [0G Positions as Blockchain for AI Agents](https://sg.finance.yahoo.com/news/0g-positions-blockchain-ai-agents-140000108.html)
- [AI Agents Will Be Primary Users of Blockchain - NEAR/CoinDesk](https://www.coindesk.com/tech/2026/03/03/ai-agents-will-be-primary-users-of-blockchain-near-co-founder-says)
- [Crypto AI Agents in 2026 - Coincub](https://coincub.com/blog/crypto-ai-agents/)
- [How Crypto AI Agents Reshape On-Chain Interactions - Turnkey](https://www.turnkey.com/blog/how-crypto-ai-agents-are-reshaping-onchain-interactions)
