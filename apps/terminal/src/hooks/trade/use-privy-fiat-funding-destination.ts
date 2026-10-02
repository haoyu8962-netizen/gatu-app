import { useWallets } from "@privy-io/react-auth";
import {
	type PrivyFiatFundingDestination,
	resolvePrivyFiatFundingDestination,
} from "@/domain/trade/privy-fiat-funding";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { useHyperliquid } from "@/lib/hyperliquid";

/**
 * Where a card purchase made now would pay out: the exact Hyperliquid owner of the current
 * session, or null when the session has none (ADR 0034). The entry and the page-level host both
 * read it, so a purchase is offered and opened under the same conditions.
 */
export function usePrivyFiatFundingDestination(): PrivyFiatFundingDestination | null {
	const { clientKey, sessionMode } = useHyperliquid();
	const { walletAddress, walletIntent, embeddedWalletAddress } = useWalletSession();
	const { wallets } = useWallets();
	return resolvePrivyFiatFundingDestination({
		clientKey,
		sessionMode,
		walletIntent,
		sessionWalletAddress: walletAddress,
		embeddedWalletAddress,
		privyWalletAddresses: wallets.map((wallet) => wallet.address),
	});
}
