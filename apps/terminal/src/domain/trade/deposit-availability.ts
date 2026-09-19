import type { CctpDepositFeatureFlags } from "@/config/cctp-deposit";

export type DepositAvailabilityReason =
	| "agent-only-session"
	| "external-deposit-disabled"
	| "geo-restricted"
	| "geo-unresolved"
	| "sponsored-deposit-disabled"
	| "wallet-session-required";

export interface DepositAvailability {
	available: boolean;
	path: "external" | "sponsored";
	reason: DepositAvailabilityReason | null;
	releasePathEnabled: boolean;
	signerReady: boolean;
}

interface DepositAvailabilityInput {
	featureFlags: CctpDepositFeatureFlags;
	geoStatus: "allowed" | "restricted" | "unresolved";
	hasWalletAccess: boolean;
	isEmbeddedWallet: boolean;
	network: "mainnet" | "testnet";
	sessionMode: "wallet" | "agent-only" | "disconnected";
}

export function getDepositAvailability({
	featureFlags,
	geoStatus,
	hasWalletAccess,
	isEmbeddedWallet,
	network,
	sessionMode,
}: DepositAvailabilityInput): DepositAvailability {
	const path: DepositAvailability["path"] = isEmbeddedWallet ? "sponsored" : "external";
	const signerReady = sessionMode === "wallet" && hasWalletAccess;
	const releasePathEnabled =
		network === "testnet"
			? isEmbeddedWallet
				? featureFlags.testnetSponsoredWallet
				: featureFlags.testnetExternalWallet
			: isEmbeddedWallet
				? featureFlags.mainnetSponsoredWallet
				: true;
	const state = { path, releasePathEnabled, signerReady };

	if (geoStatus === "restricted") return { ...state, available: false, reason: "geo-restricted" };
	if (geoStatus === "unresolved") return { ...state, available: false, reason: "geo-unresolved" };
	if (sessionMode === "agent-only") return { ...state, available: false, reason: "agent-only-session" };
	if (!isEmbeddedWallet && !signerReady) {
		return { ...state, available: false, reason: "wallet-session-required" };
	}
	if (!releasePathEnabled) {
		return {
			...state,
			available: false,
			reason: isEmbeddedWallet ? "sponsored-deposit-disabled" : "external-deposit-disabled",
		};
	}
	return { ...state, available: true, reason: null };
}
