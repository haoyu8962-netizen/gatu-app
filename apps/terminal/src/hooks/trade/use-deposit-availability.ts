import { useLingui } from "@lingui/react/macro";
import { CCTP_DEPOSIT_FEATURES } from "@/config/cctp-deposit";
import { type DepositAvailability, getDepositAvailability } from "@/domain/trade/deposit-availability";
import { useGeoRestriction } from "@/hooks/use-geo-restriction";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { getPrivyEmailAddress, shouldUsePrivyEmbeddedWallet } from "@/lib/wallet/privy-wagmi";
import { useIsTestnet } from "@/stores/use-global-settings-store";

export type DepositAvailabilityPresentation = DepositAvailability & {
	geoResolutionStatus: "loading" | "error" | "resolved";
	unavailableLabel: string;
	unavailableReason: string | null;
};

export function useDepositAvailability(): DepositAvailabilityPresentation {
	const { t } = useLingui();
	const { authenticated, hasWalletAccess, ready, sessionMode, user } = useWalletSession();
	const isTestnet = useIsTestnet();
	const { isError: geoError, isResolved: geoResolved, tradeRestricted } = useGeoRestriction();
	const network = isTestnet ? "testnet" : "mainnet";
	const isEmbeddedWallet = ready && authenticated && !!getPrivyEmailAddress(user) && shouldUsePrivyEmbeddedWallet(user);
	const availability = getDepositAvailability({
		featureFlags: CCTP_DEPOSIT_FEATURES,
		geoStatus: !geoResolved ? "unresolved" : tradeRestricted ? "restricted" : "allowed",
		hasWalletAccess,
		isEmbeddedWallet,
		network,
		sessionMode,
	});
	const unavailableReason = (() => {
		if (availability.reason === "wallet-session-required") return t`Connect the owner wallet to deposit.`;
		if (availability.reason === "geo-restricted") return t`Deposits are not available in your region.`;
		if (availability.reason === "geo-unresolved") {
			return geoError
				? t`Unable to verify regional availability. Deposits are temporarily unavailable.`
				: t`Checking regional availability. Deposits are temporarily unavailable.`;
		}
		if (availability.reason === "sponsored-deposit-disabled") {
			return isTestnet
				? t`Deposits from email wallets are not enabled on Testnet.`
				: t`Deposits from email wallets are not enabled on Mainnet.`;
		}
		if (availability.reason === "external-deposit-disabled") {
			return isTestnet
				? t`Deposits from external wallets are not enabled on Testnet.`
				: t`Deposits from external wallets are not enabled on Mainnet.`;
		}
		return null;
	})();

	return {
		...availability,
		geoResolutionStatus: geoResolved ? "resolved" : geoError ? "error" : "loading",
		unavailableLabel: t`Deposit unavailable`,
		unavailableReason,
	};
}
