import { Button, Checkbox, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@gatu/ui";
import { t } from "@lingui/core/macro";
import { SpinnerGapIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DEFAULT_QUOTE_TOKEN } from "@/config/app";
import { SMALL_BALANCE_THRESHOLD_USD } from "@/config/trade";
import { getTradingToolbarBalanceSummary, isTradingToolbarBalancePositive } from "@/domain/trade/balance-toolbar";
import {
	type BalanceRow,
	filterBalanceRowsByUsdValue,
	getPerpBalanceRows,
	getSpotBalanceRows,
	isQuoteBalanceSharedWithPerps,
} from "@/domain/trade/balances";
import { isSupportedAccountAbstraction, useDefaultDexBalances } from "@/hooks/trade/use-account-balances";
import { useSpotTokenUsdPrices } from "@/hooks/trade/use-spot-token-usd-prices";
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
	balancesToolbarClass,
} from "./balances-table-styles";
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

export function BalancesTab() {
	useNumberFormatRevision();
	const { isConnected } = useWalletSession();
	const { getToken } = useSpotTokens();
	const hideSmallBalances = useHideSmallBalances();
	const { setHideSmallBalances } = useGlobalSettingsActions();
	const { open: openDepositModal } = useDepositModalActions();
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
		marginSummary,
		perpSummary,
		spotBalances,
		spotAvailableAfterMaintenance,
		accountAbstraction,
		withdrawable,
		isSpotStateStale,
		isLoading,
		hasError,
	} = useDefaultDexBalances();
	const mids = useSpotTokenUsdPrices(isConnected);
	const accountModeReady = isSupportedAccountAbstraction(accountAbstraction);

	const perpBalances = useMemo(
		() =>
			getPerpBalanceRows(perpSummary, spotBalances, spotAvailableAfterMaintenance, accountAbstraction, withdrawable),
		[accountAbstraction, perpSummary, spotBalances, spotAvailableAfterMaintenance, withdrawable],
	);
	const spotBalanceRows = useMemo(
		() => getSpotBalanceRows(spotBalances, spotAvailableAfterMaintenance, accountAbstraction, mids),
		[accountAbstraction, spotBalances, spotAvailableAfterMaintenance, mids],
	);
	const balances = useMemo(() => [...perpBalances, ...spotBalanceRows], [perpBalances, spotBalanceRows]);
	const internalTransfersEnabled = accountModeReady && !isQuoteBalanceSharedWithPerps(accountAbstraction);
	const summary = useMemo(
		() =>
			getTradingToolbarBalanceSummary({
				accountAbstraction,
				marginSummary,
				perpSummary,
				spotBalances,
				tokenUsdPrices: mids,
				withdrawable,
			}),
		[accountAbstraction, marginSummary, mids, perpSummary, spotBalances, withdrawable],
	);

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
		const hasAvailableBalance = isTradingToolbarBalancePositive(row.available);
		const canTransfer = internalTransfersEnabled && row.asset === DEFAULT_QUOTE_TOKEN && hasAvailableBalance;
		const canSwap = accountModeReady && row.type === "spot" && hasAvailableBalance;
		const canWithdraw = accountModeReady && row.asset === DEFAULT_QUOTE_TOKEN && hasAvailableBalance;
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
						{internalTransfersEnabled ? (
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
					{formatToken(row.available, decimals)}
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
						{accountModeReady && hasAvailableBalance && (
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
		if (!isConnected) return <Placeholder>{t`Connect your wallet to view balances.`}</Placeholder>;
		if (hasError) return <Placeholder variant="error">{t`Failed to load balances.`}</Placeholder>;
		if (isLoading) return <Placeholder>{t`Loading balances...`}</Placeholder>;
		if (!accountModeReady) {
			return <Placeholder variant="error">{t`Select a supported account mode to view balances.`}</Placeholder>;
		}
		if (balances.length === 0) {
			return (
				<Placeholder>
					<div className="flex flex-col items-center gap-2.5 text-center">
						<span>{t`No balances found. Deposit funds to start trading.`}</span>
						<Button
							variant="outline"
							intent="neutral"
							size="xs"
							onClick={() => openDepositModal("deposit")}
							className="rounded-[7px] border-market-close-stroke-control px-3 text-market-close-fg"
						>
							{t`Deposit`}
						</Button>
					</div>
				</Placeholder>
			);
		}
		return null;
	}

	const placeholder = renderPlaceholder();

	return (
		<div className={positionsPanelTabRootClass}>
			<div
				data-testid="balances-summary-bar"
				className={cn(balancesToolbarClass, "justify-between gap-6 font-market-close")}
			>
				<dl className="flex min-w-0 items-center gap-7">
					<div className="flex min-w-[7rem] flex-col gap-[3px]">
						<dt className="text-[10px] leading-[14px] font-medium text-market-close-subtle">{t`Total assets`}</dt>
						<dd className="m-0 inline-flex items-center gap-1 text-sm leading-[17px] font-bold text-market-close-fg tabular-nums">
							{isSpotStateStale && isConnected && !isLoading && !hasError ? (
								<SpinnerGapIcon className="size-3 animate-spin text-warning" aria-label={t`Loading...`} />
							) : null}
							{formatUSD(isConnected && accountModeReady && !isLoading && !hasError ? summary.totalAssets : null, {
								compact: false,
							})}
						</dd>
					</div>
					<div className="flex min-w-[7rem] flex-col gap-[3px]">
						<dt className="text-[10px] leading-[14px] font-medium text-market-close-subtle">{t`Withdrawable`}</dt>
						<dd className="m-0 text-sm leading-[17px] font-semibold text-market-close-fg tabular-nums">
							{formatUSD(isConnected && accountModeReady && !isLoading && !hasError ? summary.withdrawable : null, {
								compact: false,
							})}
						</dd>
					</div>
				</dl>
				<Checkbox
					size="xs"
					checked={hideSmallBalances}
					onCheckedChange={(checked: boolean | "indeterminate") => setHideSmallBalances(Boolean(checked))}
					label={t`Hide small`}
					className="shrink-0 items-center gap-[7px]"
					controlClassName="size-3.5 !rounded-[5px] border-market-close-stroke-control bg-modal transition-all duration-[120ms] focus-visible:border-market-close-control focus-visible:outline-none data-checked:border-market-close-control data-checked:bg-market-close-control"
					indicatorClassName="text-market-close-on-control [&>svg]:size-2.5"
					labelClassName="whitespace-nowrap text-[13px] leading-[18px] font-normal normal-case tracking-normal text-market-close-muted"
				/>
			</div>
			<div className={positionsPanelTableShellClass}>
				{placeholder ?? (
					<ScrollArea className="h-full w-full">
						<Table className="table-fixed min-w-[52rem] w-full">
							<TableHeader className={balancesTableHeaderClass}>
								<TableRow className={positionsPanelTableHeaderRowClass}>
									<TableHead scope="col" size="dense" className={cn(balancesTableHeadClass, "w-[16%] text-left")}>
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
