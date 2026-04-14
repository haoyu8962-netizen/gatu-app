import { concat, keccak256 } from "viem";
import type { PrivateKeyAccount } from "viem/accounts";

// Static EIP-712 values for Hyperliquid L1 action signing — computed once at module load.
// The domain, type schema, and source strings never change between orders.
const enc = new TextEncoder();
const h = (s: string) => keccak256(enc.encode(s));

const DOMAIN_SEPARATOR = keccak256(
	concat([
		h("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
		h("Exchange"),
		h("1"),
		"0x0000000000000000000000000000000000000000000000000000000000000539", // chainId 1337
		"0x0000000000000000000000000000000000000000000000000000000000000000", // zero address
	]),
);

const AGENT_TYPEHASH = h("Agent(string source,bytes32 connectionId)");
const SOURCE_MAINNET = h("a");
const SOURCE_TESTNET = h("b");

type SignTypedDataParams = Parameters<PrivateKeyAccount["signTypedData"]>[0];

function isL1AgentDomain(params: SignTypedDataParams): boolean {
	return params.primaryType === "Agent" && params.domain?.chainId === 1337 && params.domain?.name === "Exchange";
}

/**
 * Wraps a PrivateKeyAccount for use with the Hyperliquid SDK's ExchangeClient.
 * Intercepts L1 action signing to use pre-computed domain constants instead of
 * recomputing them on every order. All other signing calls pass through unchanged.
 */
export function createL1AgentWallet(account: PrivateKeyAccount) {
	return {
		address: account.address,
		async signTypedData(params: SignTypedDataParams): Promise<`0x${string}`> {
			if (!isL1AgentDomain(params)) return account.signTypedData(params);

			const { source, connectionId } = params.message as {
				source: string;
				connectionId: `0x${string}`;
			};
			const sourceHash = source === "a" ? SOURCE_MAINNET : SOURCE_TESTNET;
			const structHash = keccak256(concat([AGENT_TYPEHASH, sourceHash, connectionId]));
			const digest = keccak256(concat(["0x1901", DOMAIN_SEPARATOR, structHash]));

			return account.sign({ hash: digest });
		},
	};
}
