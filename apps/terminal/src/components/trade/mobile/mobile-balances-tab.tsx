import { Button } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import { SpinnerGapIcon, WalletIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { DEFAULT_QUOTE_TOKEN } from "@/config/app";
import { isTradingToolbarBalancePositive } from "@/domain/trade/balance-toolbar";
import { getBalanceRowDisplayAvailable } from "@/domain/trade/balances";
import { useBalanceRows } from "@/hooks/trade/use-balance-rows";
import { useDepositAvailability } from "@/hooks/trade/use-deposit-availability";
import { useFundsActionAvailability } from "@/hooks/trade/use-funds-action-availability";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { formatToken, formatUSD } from "@/lib/format";
import { useSpotTokens } from "@/lib/hyperliquid/markets/use-spot-tokens";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";
import { useDepositModalActions } from "@/stores/use-global-modal-store";
import { AssetDisplay } from "../components/asset-display";
import { TransferModal } from "../positions/transfer-modal";

type TransferDirection = "toSpot" | "toPerp";

export function MobileBalancesTab() {
	useNumberFormatRevision();
	const { t } = useLingui();
	const { getToken } = useSpotTokens();
	const { open: openDepositModal } = useDepositModalActions();
	const depositAvailability = useDepositAvailability();
	const { hasWalletAccess } = useWalletSession();
	const [transferState, setTransferState] = useState<{
		open: boolean;
		direction: TransferDirection;
	}>({ open: false, direction: "toSpot" });
	const {
		accountDataReady,
		accountModeReady,
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
		accountModeReady,
		fundsActionsEnabled: true,
		hasWalletAccess,
		internalTransfersEnabled,
	});

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
					label={depositAvailability.unavailableReason ?? t`Open Deposit to prepare your email wallet.`}
					actionLabel={depositAvailability.available ? t`Deposit` : depositAvailability.unavailableLabel}
					actionDisabled={!depositAvailability.available}
					onAction={depositAvailability.available ? () => openDepositModal("deposit") : undefined}
				/>
			);
		}
		return <MobileBalancesState label={t`Connect your wallet to view balances.`} />;
	}
	if (hasError) return <MobileBalancesState variant="error" label={t`Failed to load balances.`} />;
	if (isLoading) return <MobileBalancesState loading label={t`Loading balances...`} />;
	if (!accountModeReady) {
		return <MobileBalancesState variant="error" label={t`Select a supported account mode to view balances.`} />;
	}
	return (
		<div className="flex min-h-0 flex-col font-market-close">
			{isDataStale ? (
				<output className="shrink-0 border-b border-stroke-warning-weak bg-warning-soft px-3.5 py-2 text-xs text-warning">
					{t`Balance data is stale. Actions are temporarily unavailable.`}
				</output>
			) : null}
			{balances.length === 0 ? (
				<MobileBalancesState
					label={depositAvailability.unavailableReason ?? t`No balances found. Deposit funds to start trading.`}
					actionLabel={depositAvailability.available ? t`Deposit` : depositAvailability.unavailableLabel}
					actionDisabled={!depositAvailability.available}
					onAction={depositAvailability.available ? () => openDepositModal("deposit") : undefined}
				/>
			) : (
				<div className="flex min-h-0 flex-col">
					{balances.map((row) => {
						const decimals = row.type === "perp" ? 2 : (getToken(row.asset)?.szDecimals ?? 2);
						const displayAvailable = getBalanceRowDisplayAvailable(row);
						const canTransfer =
							fundsActionAvailability.internalTransfer.available &&
							(row.type === "spot" || perpFundsActionsEnabled) &&
							row.asset === DEFAULT_QUOTE_TOKEN &&
							isTradingToolbarBalancePositive(row.transferable);

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
								<div className="ml-auto flex min-w-0 items-center gap-2.5">
									<div className="min-w-0 text-right">
										<div className="truncate text-[13px] font-semibold text-market-close-fg tabular-nums">
											{formatUSD(row.usdValue, { compact: true })}
										</div>
										<div className="truncate text-[10px] text-market-close-subtle tabular-nums">
											{t`Available`} {displayAvailable === null ? "—" : formatToken(displayAvailable, decimals)}
										</div>
									</div>
									{canTransfer ? (
										<Button
											variant="outline"
											intent="neutral"
											size="xs"
											onClick={() => handleTransfer(row.type)}
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
	loading = false,
	variant = "muted",
	actionLabel,
	actionDisabled = false,
	onAction,
}: {
	label: string;
	loading?: boolean;
	variant?: "muted" | "error";
	actionLabel?: string;
	actionDisabled?: boolean;
	onAction?: () => void;
}) {
	return (
		<div className="flex min-h-60 flex-col items-center justify-center gap-2.5 p-6 text-center font-market-close">
			<div className="flex size-10 items-center justify-center rounded-full bg-market-close-hover">
				{loading ? (
					<SpinnerGapIcon className="size-5 animate-spin text-market-close-subtle" />
				) : (
					<WalletIcon className="size-5 text-market-close-subtle" />
				)}
			</div>
			<p
				className={
					variant === "error" ? "max-w-xs text-xs text-market-close-danger" : "max-w-xs text-xs text-market-close-muted"
				}
			>
				{label}
			</p>
			{actionLabel ? (
				<Button
					variant="outline"
					intent="neutral"
					size="sm"
					onClick={onAction}
					disabled={actionDisabled}
					className="min-h-11 rounded-[8px] border-market-close-stroke-control px-4 text-xs font-semibold text-market-close-fg"
				>
					{actionLabel}
				</Button>
			) : null}
		</div>
	);
}
