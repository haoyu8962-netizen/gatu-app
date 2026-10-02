import { useWallets } from "@privy-io/react-auth";
import { type PrivyFiatFundingWalletKind, resolvePrivyFiatFundingDestination } from "@/domain/trade/privy-fiat-funding";
import { getPrivyFiatFundingOwnerKey } from "@/domain/trade/privy-fiat-funding-owner-key";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { useHyperliquid } from "@/lib/hyperliquid";
import { launchPrivyFiatFunding } from "@/lib/trade/privy-fiat-funding-launch";
import { useIsTestnet } from "@/stores/use-global-settings-store";
import { usePrivyFiatFundingAttempt } from "@/stores/use-privy-fiat-funding-store";

interface Options {
	enabled: boolean;
	available: boolean;
	embeddedWalletAddress: string | undefined;
	onBeforeStart: () => void;
}

export interface PrivyFiatFundingOffer {
	walletKind: PrivyFiatFundingWalletKind;
	disabled: boolean;
	start: () => void;
}

/**
 * The card funding choice for the current session, or null when the build flag is off or the
 * session has no exact owner to pay out to (ADR 0034). `start` closes the caller's surface first,
 * then hands the attempt to the page-level host.
 */
export function usePrivyFiatFundingOffer({
	enabled,
	available,
	embeddedWalletAddress,
	onBeforeStart,
}: Options): PrivyFiatFundingOffer | null {
	const { clientKey, sessionMode } = useHyperliquid();
	const { walletAddress, walletIntent } = useWalletSession();
	const { wallets } = useWallets();
	const isTestnet = useIsTestnet();
	const attempt = usePrivyFiatFundingAttempt();
	if (!enabled) return null;
	const destination = resolvePrivyFiatFundingDestination({
		clientKey,
		sessionMode,
		walletIntent,
		sessionWalletAddress: walletAddress,
		embeddedWalletAddress,
		privyWalletAddresses: wallets.map((wallet) => wallet.address),
	});
	if (!destination) return null;
	const network = isTestnet ? "testnet" : "mainnet";
	const disabled = !available || attempt !== null;

	return {
		walletKind: destination.walletKind,
		disabled,
		start() {
			if (disabled) return;
			onBeforeStart();
			launchPrivyFiatFunding({ destination, network, ownerKey: getPrivyFiatFundingOwnerKey(network, clientKey) });
		},
	};
}
