# Hyperliquid Signing Architecture

> Complete reference for Hyperliquid's three distinct signing mechanisms: L1 Actions, User-Signed Actions, and Arbitrum EVM transactions.

## Quick Reference

| Signing Type | Chain ID | Domain | Use Case | Network Required |
|--------------|----------|--------|----------|------------------|
| **L1 Actions** | 1337 | "Exchange" | Trading operations | None (API only) |
| **User-Signed** | 0x66eee (421614) | "HyperliquidSignTransaction" | Transfers, agent approval | None (API only) |
| **Arbitrum EVM** | 42161 | USDC EIP-3009 + contract call | CCTP deposits from Arbitrum | Arbitrum network |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         HYPERLIQUID SIGNING                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────┐  ┌──────────────────────┐  ┌───────────────┐  │
│  │   L1 Actions         │  │   User-Signed        │  │  Arbitrum EVM │  │
│  │   (Trading)          │  │   (Admin/Transfers)  │  │  (Deposits)   │  │
│  ├──────────────────────┤  ├──────────────────────┤  ├───────────────┤  │
│  │ Chain ID: 1337       │  │ Chain ID: 0x66eee    │  │ Chain ID:     │  │
│  │ Domain: "Exchange"   │  │ Domain: "Hyperliquid │  │ 42161         │  │
│  │                      │  │ SignTransaction"     │  │               │  │
│  ├──────────────────────┤  ├──────────────────────┤  ├───────────────┤  │
│  │ • order              │  │ • withdraw3          │  │ • EIP-3009    │  │
│  │ • cancel             │  │ • usdSend            │  │ • CCTP        │  │
│  │ • modify             │  │ • spotSend           │  │   deposit     │  │
│  │ • updateLeverage     │  │ • approveAgent       │  │               │  │
│  │ • updateIsolatedMarg │  │ • approveBuilderFee  │  │               │  │
│  │ • twapOrder          │  │                      │  │               │  │
│  │ • scheduleCancel     │  │                      │  │               │  │
│  │ • vaultTransfer      │  │ • usdClassTransfer   │  │               │  │
│  │ • subAccountTransfer │  │ • sendAsset          │  │               │  │
│  │ • etc...             │  │ • tokenDelegate      │  │               │  │
│  └──────────────────────┘  └──────────────────────┘  └───────────────┘  │
│           │                         │                        │          │
│           ▼                         ▼                        ▼          │
│  ┌──────────────────────┐  ┌──────────────────────┐  ┌───────────────┐  │
│  │ signL1Action()       │  │ signUserSignedAction │  │ wagmi/viem    │  │
│  │ (SDK handles auto)   │  │ (SDK handles auto)   │  │ signTypedData │  │
│  └──────────────────────┘  └──────────────────────┘  └───────────────┘  │
│           │                         │                        │          │
│           └─────────────────────────┼────────────────────────┘          │
│                                     ▼                                    │
│                    ┌────────────────────────────┐                        │
│                    │   ExchangeClient (SDK)     │                        │
│                    │   Handles both L1 and      │                        │
│                    │   User-Signed automatically │                        │
│                    └────────────────────────────┘                        │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Signing Type 1: L1 Actions (Trading)

High-frequency trading operations that use a "phantom agent" construction. **No EVM network connection required** - signing happens purely with the private key.

### Characteristics

| Property | Value |
|----------|-------|
| Chain ID | 1337 |
| Domain Name | "Exchange" |
| Serialization | Msgpack binary → keccak256 hash |
| Signed By | Agent wallet (viem or ethers local account) |
| Network | None required (Hyperliquid API only) |

### Methods Using L1 Signing

| Method | Description | Parameters |
|--------|-------------|------------|
| `order` | Place order(s) | `orders`, `grouping`, `builder?` |
| `cancel` | Cancel by order ID | `cancels: [{a, o}]` |
| `cancelByCloid` | Cancel by client order ID | `cancels: [{asset, cloid}]` |
| `modify` | Modify single order | `oid`, `order` |
| `batchModify` | Modify multiple orders | `modifies` |
| `updateLeverage` | Set leverage for asset | `asset`, `isCross`, `leverage` |
| `updateIsolatedMargin` | Add/remove isolated margin | `asset`, `isBuy`, `ntli` |
| `twapOrder` | Place TWAP order | `a`, `b`, `s`, `r`, `m`, `t` |
| `twapCancel` | Cancel TWAP | `a`, `t` |
| `scheduleCancel` | Dead man's switch | `time?` |
| `vaultTransfer` | Deposit/withdraw vault | `vaultAddress`, `isDeposit`, `usd` |
| `subAccountTransfer` | Transfer to sub-account | `subAccountUser`, `isDeposit`, `usd` |
| `subAccountSpotTransfer` | Spot transfer to sub-account | `subAccountUser`, `isDeposit`, `token`, `amount` |
| `createSubAccount` | Create sub-account | `name` |
| `createVault` | Create vault | `...` |
| `setDisplayName` | Set leaderboard name | `displayName` |

### Code Example

```typescript
import { ExchangeClient, HttpTransport } from "@nktkas/hyperliquid";
import { privateKeyToAccount } from "viem/accounts";

// Agent wallet signs with chainId 1337 automatically
const agentSigner = privateKeyToAccount("0x...");
const client = new ExchangeClient({
  transport: new HttpTransport(),
  wallet: agentSigner,
});

// SDK handles L1 signing internally
await client.order({
  orders: [{
    a: 0, b: true, p: "95000", s: "0.01",
    r: false, t: { limit: { tif: "Gtc" } }
  }],
  grouping: "na",
});
```

---

## Signing Type 2: User-Signed Actions (Admin/Transfers)

Administrative operations that use EIP-712 typed data with Hyperliquid's signature chain ID. **No EVM network connection required** - the chain ID is embedded in the signature, not the network.

### Characteristics

| Property | Value |
|----------|-------|
| Chain ID | 0x66eee (421614 decimal) |
| Domain Name | "HyperliquidSignTransaction" |
| Serialization | Direct EIP-712 typed data |
| Signed By | Master wallet (wagmi walletClient or viem account) |
| Network | None required (Hyperliquid API only) |

### Methods Using User-Signed Actions

| Method | Description | Parameters |
|--------|-------------|------------|
| `withdraw3` | Withdraw USDC to Arbitrum | `destination`, `amount` |
| `usdSend` | Send USDC to address | `destination`, `amount` |
| `spotSend` | Send spot tokens | `destination`, `token`, `amount` |
| `usdClassTransfer` | Move USDC perp↔spot | `amount`, `toPerp` |
| `sendAsset` | Transfer between DEXs/sub-accounts | `destination`, `sourceDex`, `destinationDex`, `token`, `amount` |
| `approveAgent` | Approve agent wallet | `agentAddress`, `agentName?`, `nonce` |
| `approveBuilderFee` | Approve builder fee | `builder`, `maxFeeRate`, `nonce` |
| `tokenDelegate` | Delegate/undelegate staking | `validator`, `amount`, `isUndelegate` |
| `userDexAbstraction` | Enable/disable HIP-3 DEX abstraction | `user`, `enabled` |

### Code Example

```typescript
import { ExchangeClient, HttpTransport } from "@nktkas/hyperliquid";
import { privateKeyToAccount } from "viem/accounts";

// Master wallet for user-signed actions
const masterAccount = privateKeyToAccount("0x...");
const client = new ExchangeClient({
  transport: new HttpTransport(),
  wallet: masterAccount,
});

// SDK handles user-signed action internally (chainId 0x66eee)
await client.withdraw3({
  destination: "0x...",
  amount: "100.0",
});
```

---

## Signing Type 3: Arbitrum EVM Transactions (Deposits)

Deposits authorize native USDC with EIP-3009 and submit an on-chain CCTP call on Arbitrum. External wallets submit directly; Privy email wallets sign with their exact embedded EOA and use the matching Smart Wallet Paymaster/Bundler for gas-sponsored submission.

### Characteristics

| Property | Value |
|----------|-------|
| Chain ID | 42161 (Arbitrum One) |
| Direct contract | CctpExtension (`0xA95d9c1F655341597C94393fDdc30cf3c08E4fcE`) |
| Sponsored contract | CctpExtensionV2 (`0x3289e443a95B28Bcedacc4B33C689b0C9b84ffAB`) |
| Token | USDC (`0xaf88d065e77c8cC2239327C5EDb3A432268e5831`) |
| Authorization signer | Exact selected master/embedded EOA |
| Transaction sender | External wallet directly, or Privy Smart Wallet via Paymaster/Bundler |
| Network | **Arbitrum required** |

### Deposit Flow

1. **Fetch current routing and Circle fee/allowance** - Require a fresh `depositRoute === "cctp"` and a reviewed fee quote.
2. **Sign EIP-3009 `ReceiveWithAuthorization`** - The exact USDC owner authorizes the selected CCTP extension.
3. **Submit the CCTP call** - External wallets call CctpExtension; Privy Smart Wallets call `CctpExtensionV2.batchSponsorDepositForBurn` through the configured Bundler/Paymaster.
4. **Classify the receipt and track forwarding** - A V2 transaction is successful for the user only when its matching `SponsoredDepositForBurn` event exists; `SponsoredDepositForBurnSkipped` is a failure, even if the outer transaction receipt succeeded.
5. **Hyperliquid credits** - Continue tracking the source transaction and HyperCore credit after refresh.

### Code Example (Current Implementation)

The implementation lives in `apps/terminal/src/lib/hyperliquid/use-deposit.ts`, with pure EIP-3009/CCTP parameter and receipt validation in `apps/terminal/src/lib/trade/cctp-deposit.ts`. It revalidates the owner, route, fee quote, fast-burn allowance, and contract result at the relevant signing and submission boundaries. New Bridge2 deposits are intentionally fail-closed. The app never stored recovery data for Bridge2 deposits; past ones appear in the account ledger like any other deposit.

---

## Withdrawal Flow (HyperCore → Arbitrum)

Withdrawals use **User-Signed Actions** (not Arbitrum EVM).

| Step | Action | Signing Type |
|------|--------|--------------|
| 1 | Call `exchange.withdraw3()` | User-Signed (0x66eee) |
| 2 | Hyperliquid processes | Automatic |
| 3 | USDC arrives on Arbitrum | ~10 min |

```typescript
// Withdrawal - uses User-Signed Action, NOT Arbitrum tx
await exchangeClient.withdraw3({
  destination: arbitrumAddress,
  amount: "100.0",
});
```

---

## Complete Method → Signing Type Reference

### L1 Actions (Chain ID: 1337)

| Category | Methods |
|----------|---------|
| **Orders** | `order`, `cancel`, `cancelByCloid`, `modify`, `batchModify` |
| **TWAP** | `twapOrder`, `twapCancel` |
| **Position** | `updateLeverage`, `updateIsolatedMargin` |
| **Schedule** | `scheduleCancel` |
| **Sub-accounts** | `createSubAccount`, `subAccountTransfer`, `subAccountSpotTransfer`, `subAccountModify` |
| **Vaults** | `createVault`, `vaultTransfer`, `vaultModify`, `vaultDistribute` |
| **Account** | `setDisplayName`, `setReferrer`, `registerReferrer`, `claimRewards` |
| **Staking (L1)** | `cDeposit`, `cWithdraw`, `linkStakingUser`, `cSignerAction`, `cValidatorAction` |
| **Advanced** | `evmUserModify`, `perpDeploy`, `spotDeploy`, `reserveRequestWeight`, `agentEnableDexAbstraction`, `convertToMultiSigUser`, `noop` |

### User-Signed Actions (Chain ID: 0x66eee)

| Category | Methods |
|----------|---------|
| **Withdrawals** | `withdraw3` |
| **External Transfers** | `usdSend`, `spotSend` |
| **Internal Transfers** | `usdClassTransfer`, `sendAsset` |
| **Approvals** | `approveAgent`, `approveBuilderFee` |
| **Staking** | `tokenDelegate` |
| **Advanced** | `userDexAbstraction` |

### Arbitrum EVM Transactions (Chain ID: 42161)

| Category | Methods |
|----------|---------|
| **Deposits** | USDC EIP-3009 authorization + CctpExtension/CctpExtensionV2 submission |

---

## Bridging: HyperCore ↔ HyperEVM ↔ Arbitrum

### System Addresses

| Token | System Address |
|-------|----------------|
| USDC | `0x2000000000000000000000000000000000000000` |
| HYPE | `0x2222222222222222222222222222222222222222` |

### Contract Addresses (Mainnet)

| Contract | Address |
|----------|---------|
| Native USDC (Arbitrum) | `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` |
| CctpExtension (Arbitrum) | `0xA95d9c1F655341597C94393fDdc30cf3c08E4fcE` |
| CctpExtensionV2 (Arbitrum) | `0x3289e443a95B28Bcedacc4B33C689b0C9b84ffAB` |
| Bridge2 (retired; no code uses it) | `0x2df1c51e09aecf9cacb7bc98cb1742757f163df7` |
| CoreDepositWallet (HyperEVM) | `0x6b9e773128f453f5c2c60935ee2de2cbc5390a24` |
| CoreWriter (HyperEVM) | `0x3333333333333333333333333333333333333333` |

### Bridge Flows

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           BRIDGE FLOWS                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ARBITRUM → HYPERCORE (Deposit)                                          │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐                           │
│  │ Arbitrum │───▶│ CCTP Ext. │───▶│ HyperCore│                           │
│  │ USDC     │    │ V1 / V2  │    │ Balance  │                           │
│  └──────────┘    └──────────┘    └──────────┘                           │
│  Signing: Arbitrum EVM (42161)                                           │
│                                                                          │
│  HYPERCORE → ARBITRUM (Withdraw)                                         │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐                           │
│  │ HyperCore│───▶│ withdraw3│───▶│ Arbitrum │                           │
│  │ Balance  │    │ API Call │    │ USDC     │                           │
│  └──────────┘    └──────────┘    └──────────┘                           │
│  Signing: User-Signed (0x66eee)                                          │
│                                                                          │
│  HYPERCORE → HYPEREVM (Internal Bridge)                                  │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐                           │
│  │ HyperCore│───▶│ spotSend │───▶│ HyperEVM │                           │
│  │ Spot     │    │ to 0x200.│    │ USDC     │                           │
│  └──────────┘    └──────────┘    └──────────┘                           │
│  Signing: User-Signed (0x66eee)                                          │
│                                                                          │
│  HYPEREVM → HYPERCORE (Internal Bridge)                                  │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐                           │
│  │ HyperEVM │───▶│ CoreDepo-│───▶│ HyperCore│                           │
│  │ USDC     │    │ sitWallet│    │ Balance  │                           │
│  └──────────┘    └──────────┘    └──────────┘                           │
│  Signing: HyperEVM transaction                                           │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Agent Wallet Pattern

The recommended pattern for frontend applications to avoid chain ID conflicts.

### Why Use Agent Wallets?

Browser wallets enforce chain ID matching:
- L1 Actions require chain ID 1337
- Browser connected to Arbitrum (42161) → **Conflict!**

Solution: Two-wallet pattern

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      AGENT WALLET PATTERN                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────┐         ┌──────────────────────┐              │
│  │   Master Wallet      │         │    Agent Wallet      │              │
│  │   (Browser/wagmi)    │         │  (viem local account)│              │
│  ├──────────────────────┤         ├──────────────────────┤              │
│  │ • approveAgent       │────────▶│ • order              │              │
│  │ • approveBuilderFee  │  signs  │ • cancel             │              │
│  │ • withdraw3          │  once   │ • modify             │              │
│  │ • usdSend            │         │ • updateLeverage     │              │
│  │ • spotSend           │         │ • All L1 Actions     │              │
│  └──────────────────────┘         └──────────────────────┘              │
│           │                                  │                           │
│           │ Chain ID: 0x66eee               │ Chain ID: 1337            │
│           │ (No network switch needed)       │ (No network needed)       │
│           │                                  │                           │
│           ▼                                  ▼                           │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                    Hyperliquid API                                │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Agent Key Storage Security

Agent private keys are stored in browser storage. `Stay Connected` is off by
default: unchecked uses `sessionStorage`, while checked uses `localStorage`.
Both scopes use the same environment-and-owner key and validated record shape.

This storage is acceptable within the product's Agent-wallet threat model because:

| Concern | Mitigation |
|---------|------------|
| **Limited permissions** | Agent keys can only execute trades - they cannot withdraw funds or transfer assets |
| **User-revocable** | Users can revoke agent approval anytime from their master wallet |
| **Session-scoped default** | The default key disappears with the browser tab/session |
| **Persistent opt-in** | Cross-restart storage requires an explicit `Stay Connected` choice |
| **Standard pattern** | This is the recommended Hyperliquid pattern for web applications |

The master wallet (hardware wallet / MetaMask) never has its keys stored - it only signs the initial agent approval and admin operations like withdrawals.

### Current Implementation

```typescript
// useAgentRegistration.ts - Generates, stores, and verifies an Agent wallet
const register = async (options: { persistConnection: boolean }) => {
  // 1. Generate new agent keypair
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);

  // 2. Master wallet signs approveAgent (User-Signed, 0x66eee)
  await exchangeClient.approveAgent({
    agentAddress: account.address,
    agentName,
  });

  // 3. Store in the selected scope, then verify storage and server approval
  const storageScope = options.persistConnection ? "local" : "session";
  await persistAgentForRegistration(
    epoch,
    privateKey,
    account.address,
    { source: "local-registration" },
    { scope: storageScope },
  );
  const requirements = await refetchAgent(account.address);
  if (!requirements.isAgentReady) {
    throw new Error("Agent approval could not be confirmed");
  }
  await verifyStoredAgent(account.address);
};

// useHyperliquidClients.ts - Agent signs L1 actions only after verification
const trading = hasUserSession && signer && agentReady
  ? getTradingClient(signer, isTestnet)
  : null;
```

Agent registration does not approve a builder fee. The terminal requests
`approveBuilderFee` separately when the first trading action needs the
configured builder code. The complete first-time ordering and fail-closed
requirements are documented in `docs/trading-onboarding.md`.

The low-level registration hook retains a persistent default for compatibility
with older callers. Product entry points must pass the user's stored
`Stay Connected` preference explicitly; omitting it is not an acceptable UI
default.

### Mobile Agent QR transfer and Agent-only sessions

Link mobile device reuses the Agent Wallet Pattern to move a trading-only key
from the desktop to a phone. This section describes the implemented behavior;
the product decisions and the official comparison are in
[ADR 0015](adr/0015-link-device-alignment.md).

- The desktop generates the Agent private key locally and the exact owner
  wallet signs `approveAgent` (User-Signed, `0x66eee`) with the name
  `Mobile valid_until <ms>`, where `<ms>` is the expiry 30 days after approval
  (`packages/hl-react/src/signing/mobile-agent.ts`, `MOBILE_AGENT_VALIDITY_MS`).
  Approval is the dialog's single explicit action and its only signing action;
  the dialog passes `applicationReview: "confirmed"`, so an embedded wallet
  signs without a second Privy prompt, and the exchange's `status: "ok"` is
  the success signal. The desktop does not poll `extraAgents`.
- The key travels as plain JSON in the URL fragment of `/mobile-agent-sync`
  (`apps/terminal/src/lib/mobile-sync/sync-core.ts`, payload version 4, TTL
  `MOBILE_SYNC_PAYLOAD_TTL_MS` = 2 minutes, bound to the network and owner).
  The fragment never reaches a server and is removed from the address bar by
  the import page before its first paint. Reveal requires a 2 s hold and the
  QR closes after `MOBILE_SYNC_QR_VISIBLE_MS` = 60 s, on window blur or when
  the page is hidden. The transfer uses no server state (ADR 0015 D7 option B
  and D8): a second phone scanning the same code within the payload lifetime
  is not rejected, and the payload is not encrypted because a key carried in
  the same link protects nothing against whoever holds the link. The phone
  refuses another network, an expired payload, one dated ahead of it beyond
  the clock skew, and every older envelope version with a refresh-both-devices
  message. These limits bind honest clients only: a captured complete QR or
  URL exposes the Agent key until it expires or the owner replaces or removes
  it.
- The phone performs an explicit Import step: one fail-closed `extraAgents`
  verification of address, name base and unexpired `validUntil`
  (`verifyExpectedMobileAgent`), then it stores the Agent record in the local
  storage scope on that device (`persistAgentForRegistration(...,
  { scope: "local" })`; the underlying `agent-storage.ts` default is also
  `local`) and activates the owner in an `agent-only` session mode
  (`packages/hl-react/src/signing/agent-session.ts`), rolling back through
  `cancelAgentRegistrationEpochAndRemove` when activation or verification is
  no longer current.
- An Agent-only session can sign L1 actions only: orders, cancels, leverage,
  vault transfers and sub-account transfers. It cannot construct any
  User-Signed call, so deposit, `withdraw3`, `usdSend`, `spotSend` and other
  master-wallet actions need the master wallet on desktop; the phone surfaces
  those actions disabled with a single desktop-required reason
  (`agent-only-session`, see `docs/mobile-data-presentation.md`).
- There is no revoke panel. Approving again from the dialog replaces the
  phone's Agent under the same name base, and the API wallet page removes any
  Agent; the phone clears its record at its next `extraAgents` check
  (`use-agent-status.ts`) or when `validUntil` passes.

For comparison, the official terminal encodes the raw Agent private key as
base64 JSON in a `?link=` query string with no expiry, signs as soon as its
icon is clicked, imports on the phone without an explicit step and approves a
permanent `Mobile QR` agent that each re-link replaces. Sairn keeps the four
differences that matter (exact owner and an explicit click, 30-day expiry,
fragment instead of query string, one `extraAgents` verification before
import) and otherwise matches the official entry, copy and step count.

---

## Implementation Strategy

### For wagmi/viem Integration

| Signing Type | Implementation |
|--------------|----------------|
| **L1 Actions** | viem local account (agent wallet, stored locally) |
| **User-Signed** | `walletClient.signTypedData()` via SDK's AbstractWallet adapter |
| **Arbitrum EVM** | `useSignTypedData()` + `useWriteContract()` from wagmi |

### Wallet Adapter Pattern

```typescript
// wallet.ts - Adapts wagmi walletClient for Hyperliquid SDK
export function toHyperliquidWallet(
  walletClient: WalletClient,
  address: `0x${string}`,
): AbstractWallet {
  return {
    address,
    signTypedData: async (params) => {
      return walletClient.signTypedData({
        account: address,
        domain: params.domain,
        types: params.types,
        primaryType: params.primaryType,
        message: params.message,
      });
    },
  };
}
```

---

## Common Pitfalls

| Issue | Cause | Solution |
|-------|-------|----------|
| "User or API Wallet does not exist" | Wrong chain ID or key ordering | Use SDK, don't manually sign |
| "Provided chainId must match" | Browser wallet chain mismatch | Use agent wallet for L1 actions |
| Signature recovery fails | Address not lowercase | SDK handles automatically |
| "Agent not approved" | Using agent before approval | Call `approveAgent` first |

### Chain ID Reference

| Purpose | Chain ID | Decimal |
|---------|----------|---------|
| L1 Actions | 1337 | 1337 |
| User-Signed | 0x66eee | 421614 |
| Arbitrum One | 42161 | 42161 |
| Arbitrum Sepolia | 421614 | 421614 |

---

## Where the signers live today

An earlier version of this page ended with an app-local refactoring proposal: a `src/lib/hyperliquid/{signing,trading,admin,deposits}` layout, per-method hooks such as `useExchangeOrder` and `useExchangeWithdraw3`, `useTradingClient`/`useAdminClient`, and an unchecked migration checklist. That proposal was superseded when the signer model moved into `@sairn/hl-react`; [signing-architecture-proposal.md](./signing-architecture-proposal.md) keeps it as a historical record. The current split (2026-10-08):

| Concern | Implementation |
|---------|----------------|
| Signer choice per action | `useExchange(method, options)` in `packages/hl-react/src/hooks/useExchange.ts`. `packages/hl-react/src/registries/exchange.ts` routes the user-signed methods (`withdraw3`, `usdSend`, `spotSend`, `usdClassTransfer`, `sendAsset`, `approveAgent`, `approveBuilderFee`, staking and account-mode actions) to the exact owner and every other method, an L1 action, to the trading signer; only `order` gets the builder code injected. |
| Trading signer | Email sessions sign L1 actions with the exact active Privy embedded owner (`signing/owner-signer-client.ts`, `signing/owner-signer-provider.tsx`, supplied by `apps/terminal/src/providers/hyperliquid-owner-signer-bridge.tsx`); external-wallet and Agent-only sessions use a verified Agent (`signing/use-agent-registration.ts`, `agent-storage.ts`, `use-agent-status.ts`). |
| Decision record | [ADR 0002](adr/0002-exact-owner-trading-signers.md) for the signer model; [trading onboarding](trading-onboarding.md) and [email trading signing](email-trading-signing.md) for the first-use sequence. |

### Deposit (CCTP-only)

`useDeposit` requires an explicit CCTP route. The exact owner signs the USDC EIP-3009 authorization; external wallets submit CctpExtension directly, while email-wallet sessions submit CctpExtensionV2 through the already configured Privy Smart Wallet Paymaster/Bundler. Neither path may fall back to Bridge2 when routing, fee, allowance, owner, or receipt validation fails.
