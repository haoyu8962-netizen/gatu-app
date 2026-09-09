import { useLingui } from "@lingui/react/macro";
import { getAccountModeAvailability } from "@/domain/trade/account-abstraction";
import {
	assertFreshFundsActionGeo,
	type FundsActionAvailability,
	type FundsActionAvailabilityReason,
	getFundsActionGeoStatus,
	getInternalTransferAvailability,
	getWithdrawalAvailability,
} from "@/domain/trade/funds-action-availability";
import { useGeoRestriction } from "@/hooks/use-geo-restriction";
import type { AccountAbstraction } from "./use-account-balances";

export type FundsActionAvailabilityPresentation = FundsActionAvailability & {
	unavailableReason: string | null;
};

interface FundsActionAvailabilityInput {
	accountDataReady: boolean;
	accountAbstraction: AccountAbstraction;
	fundsActionsEnabled: boolean;
	hasWalletAccess: boolean;
	internalTransfersEnabled: boolean;
}

interface FundsActionAvailabilityState {
	assertFreshGeoAllowed: (signal: AbortSignal) => Promise<void>;
	internalTransfer: FundsActionAvailabilityPresentation;
	withdrawal: FundsActionAvailabilityPresentation;
}

export function useFundsActionAvailability({
	accountDataReady,
	accountAbstraction,
	fundsActionsEnabled,
	hasWalletAccess,
	internalTransfersEnabled,
}: FundsActionAvailabilityInput): FundsActionAvailabilityState {
	const { t } = useLingui();
	const geo = useGeoRestriction();
	const geoStatus = getFundsActionGeoStatus(geo);
	const accountModeStatus = getAccountModeAvailability(accountAbstraction);
	const withdrawal = getWithdrawalAvailability({
		accountDataReady,
		accountModeStatus,
		fundsActionsEnabled,
		geoStatus,
		hasWalletAccess,
	});
	const internalTransfer = getInternalTransferAvailability({
		accountDataReady,
		accountModeStatus,
		geoStatus,
		hasWalletAccess,
		internalTransfersEnabled,
	});

	function getUnavailableReason(reason: FundsActionAvailabilityReason | null): string | null {
		if (reason === "wallet-session-required") return t`Connect the owner wallet before moving funds.`;
		if (reason === "geo-restricted") return t`Funds actions are not available in your region.`;
		if (reason === "geo-unresolved") {
			return geo.isError
				? t`Unable to verify regional availability. Funds actions are temporarily unavailable.`
				: t`Checking regional availability. Funds actions are temporarily unavailable.`;
		}
		if (reason === "account-mode-unresolved" || reason === "account-mode-unsupported")
			return t`Select a supported account mode before moving funds.`;
		if (reason === "account-data-unavailable") {
			return t`Balance data is unavailable. Try again after the connection recovers.`;
		}
		if (reason === "funds-actions-unavailable") return t`Funds actions are unavailable for this account.`;
		if (reason === "internal-transfers-unavailable") {
			return t`Transfers between Spot and Perps are unavailable in shared-balance account modes.`;
		}
		return null;
	}

	async function assertFreshGeoAllowed(signal: AbortSignal): Promise<void> {
		await assertFreshFundsActionGeo({
			refresh: geo.retry,
			restrictedMessage: t`Funds actions are not available in your region. This funds action was not submitted.`,
			signal,
			unavailableMessage: t`Unable to verify regional availability. This funds action was not submitted.`,
		});
	}

	return {
		assertFreshGeoAllowed,
		internalTransfer: { ...internalTransfer, unavailableReason: getUnavailableReason(internalTransfer.reason) },
		withdrawal: { ...withdrawal, unavailableReason: getUnavailableReason(withdrawal.reason) },
	};
}
