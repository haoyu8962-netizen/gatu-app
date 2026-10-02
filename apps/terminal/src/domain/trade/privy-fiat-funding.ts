import { CCTP_DEPOSIT_NETWORKS } from "@/config/cctp-deposit";
import { hasSameWalletAddress, type PrivyWalletIntent } from "@/lib/wallet/privy-wagmi";

export type PrivyFiatFundingWalletKind = "embedded" | "external";

export type PrivyFiatFundingNetwork = "mainnet" | "testnet";

export interface PrivyFiatFundingDestination {
	address: `0x${string}`;
	walletKind: PrivyFiatFundingWalletKind;
}

export type PrivyFiatFundingOutcome = "busy" | "cancelled" | "confirmed" | "failed" | "submitted" | "unknown";

/**
 * The receive address Privy's onramp credits. Card providers only deliver to Arbitrum One, and
 * Stripe's sandbox rejects testnet chains, so the testnet flag runs the sandbox against this
 * mainnet destination and never delivers funds.
 */
export const PRIVY_FIAT_FUNDING_CHAIN = `eip155:${CCTP_DEPOSIT_NETWORKS.mainnet.chainId}` as const;
export const PRIVY_FIAT_FUNDING_ASSET = CCTP_DEPOSIT_NETWORKS.mainnet.usdc;

/**
 * Opens the purchase at about 100 USDC in US dollars, as the official terminal does, instead of
 * Privy's locale currency at zero; the user can still change both in Privy's window.
 */
export const PRIVY_FIAT_FUNDING_DEFAULT_CURRENCY = "usd";
export const PRIVY_FIAT_FUNDING_DEFAULT_AMOUNT = "100";

export const PRIVY_FIAT_FUNDING_USER_EXIT_MESSAGE = "User exited flow";
export const PRIVY_FIAT_FUNDING_BACK_NAVIGATION_ERROR = "BackNavigationError";
export const PRIVY_FIAT_FUNDING_BUSY_MESSAGE = "Existing fiat onramp flow in progress";
export const PRIVY_FIAT_FUNDING_PAYMENT_METHOD_ERROR = "StripePaymentMethodError";

/**
 * Privy ends a flow with these errors before any payment was taken (checkout setup), after the
 * provider reported the transaction as failed or cancelled, or, as a
 * `StripePaymentMethodError`, after the card was declined. Every other rejection, including
 * Privy's "Could not confirm payment status yet." and "Unable to check payment status. Please try
 * again.", may follow a charge, so it is reported as an unknown status rather than a failure.
 */
export const PRIVY_FIAT_FUNDING_FAILURE_MESSAGES = [
	"Something went wrong setting up checkout. Please try again.",
	"Unable to open payment window",
	"Unable to start payment session",
	"Transaction failed",
	"Transaction cancelled",
] as const;
export const PRIVY_FIAT_FUNDING_UNCONFIRMED_MESSAGES = [
	"Could not confirm payment status yet.",
	"Unable to check payment status. Please try again.",
] as const;

interface DestinationInput {
	clientKey: string;
	sessionMode: "agent-only" | "disconnected" | "wallet";
	walletIntent: PrivyWalletIntent;
	sessionWalletAddress: string | null | undefined;
	embeddedWalletAddress: string | null | undefined;
	privyWalletAddresses: readonly string[];
}

export interface PrivyFiatFundingRequest {
	source: { defaultAsset: typeof PRIVY_FIAT_FUNDING_DEFAULT_CURRENCY };
	destination: {
		address: `0x${string}`;
		chain: typeof PRIVY_FIAT_FUNDING_CHAIN;
		asset: string;
	};
	environment: "production" | "sandbox";
	defaultAmount: string;
}

/**
 * Card funding pays out only to the exact Hyperliquid owner of the session: the active embedded
 * owner for email sessions, the active external wallet otherwise. The wallet must also be in
 * Privy's connected list, because Privy looks it up there when a provider asks the destination to
 * prove ownership.
 * Any missing or mismatched identity returns null, so the entry is not offered.
 */
export function resolvePrivyFiatFundingDestination({
	clientKey,
	sessionMode,
	walletIntent,
	sessionWalletAddress,
	embeddedWalletAddress,
	privyWalletAddresses,
}: DestinationInput): PrivyFiatFundingDestination | null {
	if (sessionMode !== "wallet" || !sessionWalletAddress) return null;
	if (!hasSameWalletAddress(sessionWalletAddress, clientKey)) return null;
	if (!privyWalletAddresses.some((address) => hasSameWalletAddress(address, sessionWalletAddress))) return null;
	const address = sessionWalletAddress as `0x${string}`;
	if (walletIntent === "embedded") {
		return hasSameWalletAddress(embeddedWalletAddress, sessionWalletAddress)
			? { address, walletKind: "embedded" }
			: null;
	}
	return walletIntent === "external" ? { address, walletKind: "external" } : null;
}

export function createPrivyFiatFundingRequest(
	destination: PrivyFiatFundingDestination,
	network: PrivyFiatFundingNetwork,
): PrivyFiatFundingRequest {
	return {
		source: { defaultAsset: PRIVY_FIAT_FUNDING_DEFAULT_CURRENCY },
		destination: { address: destination.address, chain: PRIVY_FIAT_FUNDING_CHAIN, asset: PRIVY_FIAT_FUNDING_ASSET },
		environment: network === "testnet" ? "sandbox" : "production",
		defaultAmount: PRIVY_FIAT_FUNDING_DEFAULT_AMOUNT,
	};
}

/**
 * A resolved flow is at least a submitted purchase. Only `confirmed` means the provider confirmed
 * it; neither means USDC has arrived, and an unrecognized status stays the uncertain outcome.
 */
export function classifyPrivyFiatFundingResult(result: unknown): PrivyFiatFundingOutcome {
	const status = typeof result === "object" && result !== null ? (result as { status?: unknown }).status : undefined;
	return status === "confirmed" ? "confirmed" : "submitted";
}

export function classifyPrivyFiatFundingError(error: unknown): PrivyFiatFundingOutcome {
	if (!(error instanceof Error)) return "unknown";
	if (
		error.name === PRIVY_FIAT_FUNDING_BACK_NAVIGATION_ERROR ||
		error.message === PRIVY_FIAT_FUNDING_USER_EXIT_MESSAGE
	) {
		return "cancelled";
	}
	if (error.message === PRIVY_FIAT_FUNDING_BUSY_MESSAGE) return "busy";
	if (error.name === PRIVY_FIAT_FUNDING_PAYMENT_METHOD_ERROR) return "failed";
	return (PRIVY_FIAT_FUNDING_FAILURE_MESSAGES as readonly string[]).includes(error.message) ? "failed" : "unknown";
}
