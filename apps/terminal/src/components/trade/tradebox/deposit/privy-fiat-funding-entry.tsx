import { useWallets } from "@privy-io/react-auth";
import { getPrivyFiatFundingOwnerKey, resolvePrivyFiatFundingDestination } from "@/domain/trade/privy-fiat-funding";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { useHyperliquid } from "@/lib/hyperliquid";
import { useIsTestnet } from "@/stores/use-global-settings-store";
import { requestPrivyFiatFunding, usePrivyFiatFundingAttempt } from "@/stores/use-privy-fiat-funding-store";
import { PrivyFiatFundingCard } from "./privy-fiat-funding-card";

interface Props {
	available: boolean;
	embeddedWalletAddress: string | undefined;
	onBeforeStart: () => void;
}

export function PrivyFiatFundingEntry({ available, embeddedWalletAddress, onBeforeStart }: Props) {
	const { clientKey, sessionMode } = useHyperliquid();
	const { walletAddress, walletIntent } = useWalletSession();
	const { wallets } = useWallets();
	const isTestnet = useIsTestnet();
	const attempt = usePrivyFiatFundingAttempt();
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

	function handleStart() {
		if (!destination || disabled) return;
		onBeforeStart();
		requestPrivyFiatFunding({ destination, network, ownerKey: getPrivyFiatFundingOwnerKey(network, clientKey) });
	}

	return <PrivyFiatFundingCard walletKind={destination.walletKind} disabled={disabled} onStart={handleStart} />;
}
