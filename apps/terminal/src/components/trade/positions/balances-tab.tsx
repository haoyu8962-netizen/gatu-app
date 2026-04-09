import { Button, Checkbox, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@hypeterminal/ui";
import { t } from "@lingui/core/macro";
import { ArrowsDownUpIcon, ArrowsLeftRightIcon, PaperPlaneTiltIcon } from "@phosphor-icons/react";
import { type ReactNode, useMemo, useState } from "react";
import { useConnection } from "wagmi";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { DEFAULT_QUOTE_TOKEN, HL_ALL_DEXS } from "@/config/constants";
import {
	type BalanceRow,
	filterBalanceRowsByUsdValue,
	getBalanceRows,
	getTotalUsdValue,
} from "@/domain/trade/balances";
import { useDefaultDexBalances } from "@/hooks/trade/use-account-balances";
import { cn } from "@/lib/cn";
import { formatToken, formatUSD } from "@/lib/format";
import { useSubscription } from "@/lib/hyperliquid";
import { useSpotTokens } from "@/lib/hyperliquid/markets/use-spot-tokens";
import { toNumberOrZero } from "@/lib/trade/numbers";
import { useSwapModalActions } from "@/stores/use-global-modal-store";
import { useGlobalSettingsActions, useHideSmallBalances } from "@/stores/use-global-settings-store";
import { AssetDisplay } from "../components/asset-display";
import {
	positionsPanelRowHoverClass,
	positionsPanelRowStripeClass,
	positionsPanelTableBodyClass,
	positionsPanelTableCaptionRowClass,
	positionsPanelTableCellClass,
	positionsPanelTableHeadClass,
	positionsPanelTableHeaderClass,
	positionsPanelTableHeaderRowClass,
	positionsPanelTableShellClass,
	positionsPanelTabRootClass,
} from "./positions-panel-table-styles";
import { SendDialog } from "./send-dialog";
import { TransferDialog } from "./transfer-dialog";

interface PlaceholderProps {
	children: ReactNode;
	variant?: "error";
}

function Placeholder({ children, variant }: PlaceholderProps) {
	return (
		<div
			className={cn(
				"h-full w-full flex flex-col items-center justify-center px-2 py-6 text-xs",
				variant === "error" ? "text-text-error" : "text-text-strong",
			)}
		>
			{children}
		</div>
	);
}

type TransferDirection = "toSpot" | "toPerp";

const SMALL_BALANCE_THRESHOLD = 1;

export function BalancesTab() {
	const { isConnected } = useConnection();
	const { getToken } = useSpotTokens();
	const hideSmallBalances = useHideSmallBalances();
	const { setHideSmallBalances } = useGlobalSettingsActions();
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

	const { perpSummary, spotBalances, isLoading, hasError } = useDefaultDexBalances();
	const { data: allMidsEvent } = useSubscription("allMids", { dex: HL_ALL_DEXS }, { enabled: isConnected });
	const mids = allMidsEvent?.mids;

	const balances = useMemo(() => getBalanceRows(perpSummary, spotBalances), [perpSummary, spotBalances]);

	function getPnl(row: BalanceRow): { pnl: number; pnlPercent: number } | null {
		if (row.type === "perp") return null;
		const entryNtl = toNumberOrZero(row.entryNtl);
		if (entryNtl === 0) return null;

		const midPx = toNumberOrZero(mids?.[row.asset]);
		if (midPx === 0) return null;

		const total = toNumberOrZero(row.total);
		const currentValue = total * midPx;
		const pnl = currentValue - entryNtl;
		const pnlPercent = (pnl / entryNtl) * 100;
		return { pnl, pnlPercent };
	}

	const filteredBalances = useMemo(() => {
		if (!hideSmallBalances) return balances;
		return filterBalanceRowsByUsdValue(balances, SMALL_BALANCE_THRESHOLD);
	}, [balances, hideSmallBalances]);

	const perpBalances = useMemo(() => filteredBalances.filter((row) => row.type === "perp"), [filteredBalances]);
	const spotBalancesFiltered = useMemo(() => filteredBalances.filter((row) => row.type === "spot"), [filteredBalances]);

	const totalValue = useMemo(() => getTotalUsdValue(balances), [balances]);

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

	function renderBalanceRow(row: BalanceRow, index: number) {
		const token = getToken(row.asset);
		const decimals = row.type === "perp" ? 2 : (token?.szDecimals ?? 2);
		const canTransfer = row.asset === DEFAULT_QUOTE_TOKEN && parseFloat(row.available) > 0;
		const canSwap = row.type === "spot" && parseFloat(row.available) > 0;
		const transferLabel = row.type === "perp" ? t`To Spot` : t`To Perp`;
		const pnlData = getPnl(row);
		return (
			<TableRow
				key={`${row.type}-${row.asset}`}
				className={cn(positionsPanelRowHoverClass, index % 2 === 1 && positionsPanelRowStripeClass)}
			>
				<TableCell className={cn(positionsPanelTableCellClass, "font-medium text-text-strong")}>
					<AssetDisplay coin={row.asset} />
				</TableCell>
				<TableCell className={cn(positionsPanelTableCellClass, "text-right tabular-nums text-text-strong")}>
					{formatToken(row.available, decimals)}
				</TableCell>
				<TableCell className={cn(positionsPanelTableCellClass, "text-right tabular-nums text-text-strong")}>
					{formatToken(row.total, decimals)}
				</TableCell>
				<TableCell className={cn(positionsPanelTableCellClass, "text-right tabular-nums text-text-success")}>
					{formatUSD(row.usdValue, { compact: true })}
				</TableCell>
				<TableCell className={cn(positionsPanelTableCellClass, "text-right tabular-nums text-text-strong")}>
					{pnlData ? (
						<span className={pnlData.pnl >= 0 ? "text-text-success" : "text-text-error"}>
							{pnlData.pnl >= 0 ? "+" : ""}
							{formatUSD(pnlData.pnl, { compact: true })} ({pnlData.pnlPercent >= 0 ? "+" : ""}
							{pnlData.pnlPercent.toFixed(1)}%)
						</span>
					) : (
						<span className="text-text-weak">—</span>
					)}
				</TableCell>
				<TableCell className={cn(positionsPanelTableCellClass, "text-right")}>
					<div className="flex flex-nowrap items-center justify-end gap-1 whitespace-nowrap">
						{canTransfer && (
							<Button
								variant="link"
								onClick={() => handleTransferClick(row)}
								className="shrink-0 text-xs text-text-brand hover:text-text-brand/80 hover:bg-transparent px-1.5 py-0.5 gap-1"
							>
								<ArrowsLeftRightIcon className="size-2.5" />
								{transferLabel}
							</Button>
						)}
						{canSwap && (
							<Button
								variant="link"
								onClick={() => openSwapModal(row.asset)}
								className="shrink-0 text-xs text-text-brand hover:text-text-brand/80 hover:bg-transparent px-1.5 py-0.5 gap-1"
							>
								<ArrowsDownUpIcon className="size-2.5" />
								{t`Swap`}
							</Button>
						)}
						{parseFloat(row.available) > 0 && (
							<Button
								variant="link"
								onClick={() => handleSendClick(row)}
								className="shrink-0 text-xs text-text-brand hover:text-text-brand/80 hover:bg-transparent px-1.5 py-0.5 gap-1"
							>
								<PaperPlaneTiltIcon className="size-2.5" />
								{t`Send`}
							</Button>
						)}
					</div>
				</TableCell>
			</TableRow>
		);
	}

	function renderPlaceholder() {
		if (!isConnected) return <Placeholder>{t`Connect your wallet to view balances.`}</Placeholder>;
		if (isLoading) return <Placeholder>{t`Loading balances...`}</Placeholder>;
		if (hasError) return <Placeholder variant="error">{t`Failed to load balances.`}</Placeholder>;
		if (balances.length === 0)
			return <Placeholder>{t`No balances found. Deposit funds to start trading.`}</Placeholder>;
		return null;
	}

	const placeholder = renderPlaceholder();

	return (
		<div className={positionsPanelTabRootClass}>
			<div className={positionsPanelTableCaptionRowClass}>
				<Checkbox
					size="xxs"
					checked={hideSmallBalances}
					onCheckedChange={(checked: boolean | "indeterminate") => setHideSmallBalances(Boolean(checked))}
					label={
						<span className="text-3xs font-normal normal-case tracking-normal text-text-weak">{t`Hide small`}</span>
					}
					className="gap-1.5 items-center"
				/>
				{isConnected && !isLoading ? (
					<span className="tabular-nums text-3xs font-medium text-text-success">
						{formatUSD(totalValue, { compact: true })}
					</span>
				) : null}
			</div>
			<div className={positionsPanelTableShellClass}>
				{placeholder ?? (
					<ScrollArea className="h-full w-full">
						<Table className="table-fixed min-w-[44rem] w-full">
							<TableHeader className={positionsPanelTableHeaderClass}>
								<TableRow className={positionsPanelTableHeaderRowClass}>
									<TableHead scope="col" className={cn(positionsPanelTableHeadClass, "w-[20%] text-left")}>
										{t`Asset`}
									</TableHead>
									<TableHead scope="col" className={cn(positionsPanelTableHeadClass, "w-[14%] text-right")}>
										{t`Available`}
									</TableHead>
									<TableHead scope="col" className={cn(positionsPanelTableHeadClass, "w-[14%] text-right")}>
										{t`Total`}
									</TableHead>
									<TableHead scope="col" className={cn(positionsPanelTableHeadClass, "w-[16%] text-right")}>
										{t`USD Value`}
									</TableHead>
									<TableHead scope="col" className={cn(positionsPanelTableHeadClass, "w-[16%] text-right")}>
										{t`PNL`}
									</TableHead>
									<TableHead scope="col" className={cn(positionsPanelTableHeadClass, "w-[20%] text-right")}>
										{t`Actions`}
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody className={positionsPanelTableBodyClass}>
								{perpBalances.length > 0 && (
									<>
										<TableRow className="border-stroke-weak/40 hover:bg-transparent">
											<TableCell
												colSpan={6}
												className="!h-auto !min-h-0 border-stroke-weak/40 bg-fill-brand-strong/8 px-2.5 py-1.5 text-3xs font-semibold uppercase tracking-widest text-text-brand"
											>
												{t`Perpetuals`}
											</TableCell>
										</TableRow>
										{perpBalances.map((row, i) => renderBalanceRow(row, i))}
									</>
								)}
								{spotBalancesFiltered.length > 0 && (
									<>
										<TableRow className="border-stroke-weak/40 hover:bg-transparent">
											<TableCell
												colSpan={6}
												className="!h-auto !min-h-0 border-stroke-weak/40 bg-fill-warning-strong/8 px-2.5 py-1.5 text-3xs font-semibold uppercase tracking-widest text-text-warning"
											>
												{t`Spot`}
											</TableCell>
										</TableRow>
										{spotBalancesFiltered.map((row, i) => renderBalanceRow(row, i))}
									</>
								)}
							</TableBody>
						</Table>
						<ScrollBar orientation="horizontal" />
					</ScrollArea>
				)}
			</div>

			<TransferDialog
				open={transferState.open}
				onOpenChange={(open) => setTransferState((prev) => ({ ...prev, open }))}
				initialDirection={transferState.direction}
			/>

			<SendDialog
				open={sendState.open}
				onOpenChange={(open) => setSendState((prev) => ({ ...prev, open }))}
				initialAsset={sendState.asset}
				initialAccountType={sendState.accountType}
			/>
		</div>
	);
}
