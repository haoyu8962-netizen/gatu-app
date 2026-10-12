import { useLingui } from "@lingui/react/macro";
import { WalletIcon } from "@phosphor-icons/react";
import { Button } from "@sairn/ui";
import { useId, useState } from "react";
import { depositModalIntentProps } from "@/components/trade/components/deposit-modal-intent";
import { DataPendingState } from "@/components/ui/data-pending-state";
import { DEFAULT_QUOTE_TOKEN } from "@/config/app";
import { isTradingToolbarBalancePositive } from "@/domain/trade/balance-toolbar";
import { getBalanceRowDisplayAvailable } from "@/domain/trade/balances";
import { getFundsAvailabilityNotice } from "@/domain/trade/data-presentation";
import { useBalanceRows } from "@/hooks/trade/use-balance-rows";
import { useDepositAvailability } from "@/hooks/trade/use-deposit-availability";
import { useFundsActionAvailability } from "@/hooks/trade/use-funds-action-availability";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { useNumberFormat } from "@/lib/format";
import { useSpotTokens } from "@/lib/hyperliquid/markets/use-spot-tokens";
import { useDepositModalActions } from "@/stores/use-global-modal-store";
import { AssetDisplay } from "../components/asset-display";
import { TransferModal } from "../positions/transfer-modal";

type TransferDirection = "toSpot" | "toPerp";

export function MobileBalancesTab() {
	const { formatToken, formatUSD } = useNumberFormat();
	const { t } = useLingui();
	const { getToken } = useSpotTokens();
	const { open: openDepositModal } = useDepositModalActions();
	const depositAvailability = useDepositAvailability();
	const depositNotice = getFundsAvailabilityNotice(depositAvailability);
	const { hasWalletAccess, sessionMode } = useWalletSession();
	const transferReasonId = useId();
	const [transferState, setTransferState] = useState<{
		open: boolean;
		direction: TransferDirection;
	}>({ open: false, direction: "toSpot" });
	const {
		accountAbstraction,
		accountDataReady,
		accountModeReady,
		accountModeSetup,
		balances,
		hasError,
		internalTransfersEnabled,
		isConnected,
		isDataStale,
		isLoading,
		perpFundsActionsEnabled,
		showBalanceAccountType,
	} = useBalanceRows();
	const fundsActionAvailability = useFundsActionAvailability({
		accountDataReady: accountDataReady && !isDataStale,
		accountAbstraction,
		fundsActionsEnabled: true,
		hasWalletAccess,
		internalTransfersEnabled,
	});

	const agentOnlySession = sessionMode === "agent-only";
	const transferAgentOnlyReason = agentOnlySession
		? getFundsAvailabilityNotice(fundsActionAvailability.internalTransfer)
		: null;

	function isTransferEligible(row: (typeof balances)[number]): boolean {
		return (
			internalTransfersEnabled &&
			(row.type === "spot" || perpFundsActionsEnabled) &&
			row.asset === DEFAULT_QUOTE_TOKEN &&
			isTradingToolbarBalancePositive(row.transferable)
		);
	}

	const showsTransferReason = agentOnlySession && balances.some(isTransferEligible);

	function handleTransfer(rowType: "perp" | "spot") {
		setTransferState({
			open: true,
			direction: rowType === "perp" ? "toSpot" : "toPerp",
		});
	}

	if (!isConnected) {
		if (depositAvailability.path === "sponsored") {
			return (
				<MobileBalancesState
					label={depositNotice ?? t`Open Deposit to prepare your email wallet.`}
					actionLabel={t`Deposit`}
					actionDisabled={!depositAvailability.available}
					onAction={depositAvailability.available ? () => openDepositModal("deposit") : undefined}
				/>
			);
		}
		return <div className="flex min-h-0 flex-1" />;
	}
	const isDataReady =
		!hasError &&
		!isLoading &&
		!isDataStale &&
		(accountModeReady || accountModeSetup === "awaiting-funds") &&
		accountDataReady;
	return (
		<div className="flex min-h-0 flex-col font-market-close">
			{!isDataReady ? (
				<DataPendingState loading={isLoading || (!accountModeReady && accountModeSetup === "pending")} />
			) : balances.length === 0 ? (
				<MobileBalancesState
					label={depositNotice ?? t`No balances found. Deposit funds to start trading.`}
					actionLabel={t`Deposit`}
					actionDisabled={!depositAvailability.available}
					onAction={depositAvailability.available ? () => openDepositModal("deposit") : undefined}
				/>
			) : (
				<div className="flex min-h-0 flex-col">
					{showsTransferReason && transferAgentOnlyReason ? (
						<p
							id={transferReasonId}
							className="border-b border-trading-panel-stroke-card px-3.5 py-2.5 text-xs text-trading-panel-muted"
						>
							{transferAgentOnlyReason}
						</p>
					) : null}
					{balances.map((row) => {
						const decimals = row.type === "perp" ? 2 : (getToken(row.asset)?.szDecimals ?? 2);
						const displayAvailable = getBalanceRowDisplayAvailable(row);
						const transferEligible = isTransferEligible(row);
						const canTransfer = fundsActionAvailability.internalTransfer.available && transferEligible;
						const showsDisabledTransfer = !canTransfer && transferEligible && showsTransferReason;

						return (
							<article
								key={`${row.type}-${row.asset}`}
								className="flex min-h-[57px] items-center justify-between gap-3 border-b border-market-close-stroke-card px-3.5 py-3 transition-colors duration-[120ms] active:bg-market-close-hover"
							>
								<div className="flex min-w-0 items-center gap-2">
									<AssetDisplay
										coin={row.asset}
										iconClassName="size-[26px]"
										nameClassName="truncate text-[13px] font-bold text-market-close-fg"
									/>
									{showBalanceAccountType ? (
										<span className="shrink-0 text-[10px] font-medium text-market-close-subtle">
											{row.type === "perp" ? t`Trading` : t`Spot`}
										</span>
									) : null}
								</div>
								<div className="ms-auto flex min-w-0 items-center gap-2.5">
									<div className="min-w-0 text-right">
										<div className="truncate text-[13px] font-semibold text-market-close-fg tabular-nums">
											{formatUSD(row.usdValue, { compact: true })}
										</div>
										<div className="truncate text-[10px] text-market-close-subtle tabular-nums">
											{t`Available`} {displayAvailable === null ? "—" : formatToken(displayAvailable, decimals)}
										</div>
									</div>
									{canTransfer || showsDisabledTransfer ? (
										<Button
											variant="outline"
											intent="neutral"
											size="xs"
											disabled={!canTransfer}
											focusableWhenDisabled
											aria-describedby={showsDisabledTransfer && transferAgentOnlyReason ? transferReasonId : undefined}
											onClick={canTransfer ? () => handleTransfer(row.type) : undefined}
											className="min-h-11 shrink-0 rounded-[6px] border-market-close-stroke-input px-2.5 text-xs font-semibold text-market-close-fg shadow-none active:scale-100"
										>
											{t`Transfer`}
										</Button>
									) : null}
								</div>
							</article>
						);
					})}
				</div>
			)}
			<TransferModal
				open={transferState.open}
				onOpenChange={(open) => setTransferState((current) => ({ ...current, open }))}
				initialDirection={transferState.direction}
			/>
		</div>
	);
}

function MobileBalancesState({
	label,
	actionLabel,
	actionDisabled = false,
	onAction,
}: {
	label: string;
	actionLabel?: string;
	actionDisabled?: boolean;
	onAction?: () => void;
}) {
	return (
		<div className="flex min-h-60 flex-col items-center justify-center gap-2.5 p-6 text-center font-market-close">
			<div className="flex size-10 items-center justify-center rounded-full bg-market-close-hover">
				<WalletIcon className="size-5 text-market-close-subtle" />
			</div>
			<p className="max-w-xs text-xs text-market-close-muted">{label}</p>
			{actionLabel ? (
				<Button
					variant="outline"
					intent="neutral"
					size="sm"
					onClick={onAction}
					{...(onAction ? depositModalIntentProps : undefined)}
					disabled={actionDisabled}
					className="min-h-11 rounded-[8px] border-market-close-stroke-control px-4 text-xs font-semibold text-market-close-fg"
				>
					{actionLabel}
				</Button>
			) : null}
		</div>
	);
}
