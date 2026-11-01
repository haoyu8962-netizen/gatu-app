import { CCTP_DEPOSIT_NETWORKS } from "@/config/cctp-deposit";
import { HYPERCORE_USDC_ADDRESS } from "@/config/contracts";

export type WithdrawDestinationIssue = "self" | "usdc-contract";

const USDC_CONTRACT_ADDRESSES = new Set(
	[HYPERCORE_USDC_ADDRESS, CCTP_DEPOSIT_NETWORKS.mainnet.usdc, CCTP_DEPOSIT_NETWORKS.testnet.usdc].map((address) =>
		address.toLowerCase(),
	),
);

/**
 * An email wallet withdrawal names its Arbitrum destination. Withdrawing to the wallet itself would
 * be deposited straight back by the automatic email-wallet deposit (ADR 0040), and USDC sent to the
 * token contract is lost, so both are refused, as on the official terminal.
 */
export function getWithdrawDestinationIssue(
	destination: string,
	ownAddresses: readonly (string | null | undefined)[],
): WithdrawDestinationIssue | null {
	const normalized = destination.trim().toLowerCase();
	if (!normalized) return null;
	if (ownAddresses.some((address) => address?.toLowerCase() === normalized)) return "self";
	if (USDC_CONTRACT_ADDRESSES.has(normalized)) return "usdc-contract";
	return null;
}
