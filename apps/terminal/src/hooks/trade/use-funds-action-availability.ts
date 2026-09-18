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
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
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

export class FundsActionGeoExecutionError extends Error {
	constructor(readonly reason: "restricted" | "unavailable") {
		super(
			reason === "restricted"
				? "Funds actions are not available in your region. This funds action was not submitted."
				: "Unable to verify regional availability. This funds action was not submitted.",
		);
		this.name = "FundsActionGeoExecutionError";
	}
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
	const { sessionMode } = useWalletSession();
	const geoStatus = getFundsActionGeoStatus(geo);
	const accountModeStatus = getAccountModeAvailability(accountAbstraction);
	const withdrawal = getWithdrawalAvailability({
		accountDataReady,
		accountModeStatus,
		fundsActionsEnabled,
		geoStatus,
		hasWalletAccess,
		sessionMode,
	});
	const internalTransfer = getInternalTransferAvailability({
		accountDataReady,
		accountModeStatus,
		geoStatus,
		hasWalletAccess,
		internalTransfersEnabled,
		sessionMode,
	});

	function getUnavailableReason(reason: FundsActionAvailabilityReason | null): string | null {
		if (reason === "agent-only-session") {
			return t`This phone uses a desktop-approved trading key. Deposits, withdrawals and transfers need the master wallet on desktop.`;
		}
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
		const restrictedMessage = t`Funds actions are not available in your region. This funds action was not submitted.`;
		const unavailableMessage = t`Unable to verify regional availability. This funds action was not submitted.`;
		try {
			await assertFreshFundsActionGeo({
				refresh: geo.retry,
				restrictedMessage,
				signal,
				unavailableMessage,
			});
		} catch (error) {
			if (signal.aborted) throw signal.reason ?? error;
			if (error instanceof Error && error.message === restrictedMessage) {
				throw new FundsActionGeoExecutionError("restricted");
			}
			if (error instanceof Error && error.message === unavailableMessage) {
				throw new FundsActionGeoExecutionError("unavailable");
			}
			throw error;
		}
	}

	return {
		assertFreshGeoAllowed,
		internalTransfer: { ...internalTransfer, unavailableReason: getUnavailableReason(internalTransfer.reason) },
		withdrawal: { ...withdrawal, unavailableReason: getUnavailableReason(withdrawal.reason) },
	};
}
