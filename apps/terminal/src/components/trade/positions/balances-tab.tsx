import { Button, Checkbox, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Tooltip } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import { useMemo, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DEFAULT_QUOTE_TOKEN } from "@/config/app";
import { SMALL_BALANCE_THRESHOLD_USD } from "@/config/trade";
import { isTradingToolbarBalancePositive } from "@/domain/trade/balance-toolbar";
import { type BalanceRow, filterBalanceRowsByUsdValue, getBalanceRowDisplayAvailable } from "@/domain/trade/balances";
import { useBalanceRows } from "@/hooks/trade/use-balance-rows";
import { useDepositAvailability } from "@/hooks/trade/use-deposit-availability";
import { useFundsActionAvailability } from "@/hooks/trade/use-funds-action-availability";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { cn } from "@/lib/cn";
import { formatToken, formatUSD } from "@/lib/format";
import { useSpotTokens } from "@/lib/hyperliquid/markets/use-spot-tokens";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";
import { useDepositModalActions, useSwapModalActions } from "@/stores/use-global-modal-store";
import { useGlobalSettingsActions, useHideSmallBalances } from "@/stores/use-global-settings-store";
import { AssetDisplay } from "../components/asset-display";
import {
	balancesTableActionClass,
	balancesTableCellClass,
	balancesTableHeadClass,
	balancesTableHeaderClass,
} from "./balances-table-styles";
import { DesktopTabToolbarPortal } from "./desktop-tab-toolbar-portal";
import { PassiveDataPlaceholder } from "./passive-data-placeholder";
import { Placeholder } from "./placeholder";
import {
	positionsPanelRowHoverClass,
	positionsPanelTableBodyClass,
	positionsPanelTableHeaderRowClass,
	positionsPanelTableShellClass,
	positionsPanelTabRootClass,
} from "./positions-panel-table-styles";
import { SendModal } from "./send-modal";
import { TransferModal } from "./transfer-modal";

type TransferDirection = "toSpot" | "toPerp";

interface Props {
	toolbarTarget?: HTMLElement | null;
}

export function BalancesTab({ toolbarTarget }: Props) {
	const { t } = useLingui();
	useNumberFormatRevision();
	const { getToken } = useSpotTokens();
	const hideSmallBalances = useHideSmallBalances();
	const { setHideSmallBalances } = useGlobalSettingsActions();
	const { open: openDepositModal } = useDepositModalActions();
	const depositAvailability = useDepositAvailability();
	const { hasWalletAccess } = useWalletSession();
	const { open: openSwapModal } = useSwapModalActions();
	const [transferState, setTransferState] = useState<{
		open: boolean;
		direction: TransferDirection;
	}>({
		open: false,
		direction: "toSpot",
	});
	const [sendState, setSendState] = useState<{
		open: boolean;
		asset: string;
		accountType: "perp" | "spot";
	}>({
		open: false,
		asset: DEFAULT_QUOTE_TOKEN,
		accountType: "spot",
	});

	const {
		accountAbstraction,
		accountDataReady,
		accountModeReady,
		balances,
		hasError,
		internalTransfersEnabled,
		isConnected,
		isDataStale,
		isLoading,
		perpFundsActionsEnabled,
		perpBalances,
		showBalanceAccountType,
		spotBalanceRows,
	} = useBalanceRows();
	const fundsActionAvailability = useFundsActionAvailability({
		accountDataReady: accountDataReady && !isDataStale,
		accountAbstraction,
		fundsActionsEnabled: true,
		hasWalletAccess,
		internalTransfersEnabled,
	});

	const filteredPerpBalances = useMemo(() => {
		if (!hideSmallBalances) return perpBalances;
		return filterBalanceRowsByUsdValue(perpBalances, SMALL_BALANCE_THRESHOLD_USD);
	}, [hideSmallBalances, perpBalances]);

	const filteredSpotBalances = useMemo(() => {
		if (!hideSmallBalances) return spotBalanceRows;
		return filterBalanceRowsByUsdValue(spotBalanceRows, SMALL_BALANCE_THRESHOLD_USD);
	}, [hideSmallBalances, spotBalanceRows]);
	const filteredBalances = useMemo(
		() => [...filteredPerpBalances, ...filteredSpotBalances],
		[filteredPerpBalances, filteredSpotBalances],
	);

	function handleTransferClick(row: BalanceRow) {
		if (row.asset !== DEFAULT_QUOTE_TOKEN) return;
		const direction: TransferDirection = row.type === "perp" ? "toSpot" : "toPerp";
		setTransferState({
			open: true,
			direction,
		});
	}

	function handleSendClick(row: BalanceRow) {
		setSendState({
			open: true,
			asset: row.asset,
			accountType: row.type,
		});
	}

	function renderBalanceRow(row: BalanceRow) {
		const token = getToken(row.asset);
		const decimals = row.type === "perp" ? 2 : (token?.szDecimals ?? 2);
		const displayAvailable = getBalanceRowDisplayAvailable(row);
		const hasTransferableBalance = isTradingToolbarBalancePositive(row.transferable);
		const fundsActionsEnabled = row.type === "spot" || perpFundsActionsEnabled;
		const canTransfer =
			fundsActionAvailability.internalTransfer.available &&
			fundsActionsEnabled &&
			row.asset === DEFAULT_QUOTE_TOKEN &&
			hasTransferableBalance;
		const canSwap =
			accountDataReady && accountModeReady && row.type === "spot" && isTradingToolbarBalancePositive(row.available);
		const canWithdraw =
			fundsActionAvailability.withdrawal.available &&
			fundsActionsEnabled &&
			row.asset === DEFAULT_QUOTE_TOKEN &&
			hasTransferableBalance;
		const transferLabel = row.type === "perp" ? t`To Spot` : t`To Perp`;
		return (
			<TableRow key={`${row.type}-${row.asset}`} className={positionsPanelRowHoverClass}>
				<TableCell size="dense" className={cn(balancesTableCellClass, "font-medium text-market-close-fg")}>
					<div className="flex min-w-0 items-center gap-2">
						<AssetDisplay
							coin={row.asset}
							iconClassName="size-6"
							nameClassName="text-[13px] font-bold text-market-close-fg"
						/>
						{showBalanceAccountType ? (
							<span className="shrink-0 text-[10px] font-medium text-market-close-subtle">
								{row.type === "perp" ? t`Trading` : t`Spot`}
							</span>
						) : null}
					</div>
				</TableCell>
				<TableCell size="dense" className={cn(balancesTableCellClass, "text-right tabular-nums text-market-close-fg")}>
					{formatToken(row.total, decimals)}
				</TableCell>
				<TableCell size="dense" className={cn(balancesTableCellClass, "text-right tabular-nums text-market-close-fg")}>
					{row.tradeAvailable !== undefined ? (
						<Tooltip content={t`Balance available to trade`} side="top">
							<span className="cursor-default border-b border-dashed border-market-close-stroke-control">
								{displayAvailable === null ? "—" : formatToken(displayAvailable, decimals)}
							</span>
						</Tooltip>
					) : (
						formatToken(displayAvailable, decimals)
					)}
				</TableCell>
				<TableCell size="dense" className={cn(balancesTableCellClass, "text-right tabular-nums text-market-close-fg")}>
					{formatUSD(row.usdValue, { compact: true })}
				</TableCell>
				<TableCell size="dense" className={cn(balancesTableCellClass, "text-right")}>
					<div className="flex flex-nowrap items-center justify-end gap-1.5 whitespace-nowrap">
						{canTransfer && (
							<Button
								variant="outline"
								intent="neutral"
								size="xxs"
								onClick={() => handleTransferClick(row)}
								className={balancesTableActionClass}
							>
								{transferLabel}
							</Button>
						)}
						{canSwap && (
							<Button
								variant="outline"
								intent="neutral"
								size="xxs"
								onClick={() => openSwapModal(row.asset)}
								className={balancesTableActionClass}
							>
								{t`Swap`}
							</Button>
						)}
						{accountDataReady && fundsActionsEnabled && accountModeReady && hasTransferableBalance && (
							<Button
								variant="outline"
								intent="neutral"
								size="xxs"
								onClick={() => handleSendClick(row)}
								className={balancesTableActionClass}
							>
								{t`Send`}
							</Button>
						)}
						{canWithdraw && (
							<Button
								variant="outline"
								intent="neutral"
								size="xxs"
								onClick={() => openDepositModal("withdraw")}
								className={balancesTableActionClass}
							>
								{t`Withdraw`}
							</Button>
						)}
					</div>
				</TableCell>
			</TableRow>
		);
	}

	function renderPlaceholder() {
		if (!isConnected) {
			if (depositAvailability.path === "sponsored") {
				return renderDepositPlaceholder(t`Open Deposit to prepare your email wallet.`);
			}
			return <Placeholder>{t`Connect your wallet to view balances.`}</Placeholder>;
		}
		if (hasError || isDataStale) return <PassiveDataPlaceholder />;
		if (isLoading || !accountDataReady || accountAbstraction === "unknown") return <PassiveDataPlaceholder busy />;
		if (!accountModeReady) {
			return <Placeholder variant="error">{t`Select a supported account mode to view balances.`}</Placeholder>;
		}
		if (balances.length === 0) {
			return renderDepositPlaceholder(t`No balances found. Deposit funds to start trading.`);
		}
		return null;
	}

	function renderDepositPlaceholder(defaultLabel: string) {
		return (
			<Placeholder>
				<div className="flex flex-col items-center gap-2.5 text-center">
					<span>{depositAvailability.unavailableReason ?? defaultLabel}</span>
					<Button
						variant="outline"
						intent="neutral"
						size="xs"
						disabled={!depositAvailability.available}
						onClick={depositAvailability.available ? () => openDepositModal("deposit") : undefined}
						aria-label={depositAvailability.available ? undefined : depositAvailability.unavailableLabel}
						title={depositAvailability.unavailableReason ?? undefined}
						className="rounded-[7px] border-market-close-stroke-control px-3 text-market-close-fg"
					>
						{depositAvailability.available ? t`Deposit` : depositAvailability.unavailableLabel}
					</Button>
				</div>
			</Placeholder>
		);
	}

	const placeholder = renderPlaceholder();

	return (
		<div className={positionsPanelTabRootClass}>
			<DesktopTabToolbarPortal target={toolbarTarget}>
				<Checkbox
					size="xs"
					checked={hideSmallBalances}
					onCheckedChange={(checked: boolean | "indeterminate") => setHideSmallBalances(Boolean(checked))}
					label={t`Hide small`}
					className="shrink-0 items-center gap-[7px]"
					controlClassName="size-3.5 !rounded-[5px] border-market-close-stroke-control bg-surface transition-all duration-[120ms] focus-visible:border-market-close-focus focus-visible:outline-none data-checked:border-market-close-control data-checked:bg-market-close-control"
					indicatorClassName="text-market-close-on-control [&>svg]:size-2.5"
					labelClassName="whitespace-nowrap text-[13px] leading-[18px] font-normal normal-case tracking-normal text-market-close-muted"
				/>
			</DesktopTabToolbarPortal>
			<div className={positionsPanelTableShellClass}>
				{placeholder ?? (
					<div className="flex h-full min-h-0 flex-col">
						<ScrollArea className="min-h-0 flex-1">
							<Table className="table-fixed min-w-[52rem] w-full">
								<TableHeader className={balancesTableHeaderClass}>
									<TableRow className={positionsPanelTableHeaderRowClass}>
										<TableHead scope="col" size="dense" className={cn(balancesTableHeadClass, "w-[16%] text-start")}>
											{t`Asset`}
										</TableHead>
										<TableHead scope="col" size="dense" className={cn(balancesTableHeadClass, "w-[22%] text-right")}>
											{t`Total`}
										</TableHead>
										<TableHead scope="col" size="dense" className={cn(balancesTableHeadClass, "w-[22%] text-right")}>
											{t`Available`}
										</TableHead>
										<TableHead scope="col" size="dense" className={cn(balancesTableHeadClass, "w-[22%] text-right")}>
											{t`USD Value`}
										</TableHead>
										<TableHead scope="col" size="dense" className={cn(balancesTableHeadClass, "w-[18%] text-right")}>
											{t`Actions`}
										</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody className={positionsPanelTableBodyClass}>{filteredBalances.map(renderBalanceRow)}</TableBody>
							</Table>
						</ScrollArea>
					</div>
				)}
			</div>

			<TransferModal
				open={transferState.open}
				onOpenChange={(open) => setTransferState((prev) => ({ ...prev, open }))}
				initialDirection={transferState.direction}
			/>

			<SendModal
				open={sendState.open}
				onOpenChange={(open) => setSendState((prev) => ({ ...prev, open }))}
				initialAsset={sendState.asset}
				initialAccountType={sendState.accountType}
			/>
		</div>
	);
}
