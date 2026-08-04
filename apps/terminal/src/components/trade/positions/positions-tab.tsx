import { Table, TableBody, TableHead, TableHeader, TableRow, Tooltip } from "@gatu/ui";
import { t } from "@lingui/core/macro";
import { useId, useMemo, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { HL_ALL_DEXS } from "@/config/app";
import {
	getPositionCloseAllQuoteSymbol,
	type PositionCloseAllSnapshot,
	type PositionCloseAllSnapshotIssue,
	resolvePositionCloseAllSnapshot,
} from "@/domain/trade/position-close-all";
import {
	filterPositions,
	getTotalPositionUnrealizedPnl,
	type PositionDirectionFilter,
	type PositionMarketFilter,
	type PositionMarketIdentity,
} from "@/domain/trade/position-toolbar";
import { getToolbarAccountRiskPresentation } from "@/domain/trade/trading-toolbar-metrics";
import { useMarketNavigation } from "@/hooks/trade/use-market-navigation";
import { usePositionMarketCloseAction } from "@/hooks/trade/use-position-market-close-action";
import type { PositionReverseTarget } from "@/hooks/trade/use-position-reverse-submit";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { cn } from "@/lib/cn";
import { formatPercent, formatUSD } from "@/lib/format";
import { useHyperliquid, useMarkets, useMarketsInfo, useSubscription, useUserPositions } from "@/lib/hyperliquid";
import { buildTpSlOrdersByCoin } from "@/lib/trade/open-orders";
import type { Side } from "@/lib/trade/types";
import { getMarketCloseValueColorClass } from "@/lib/ui/value-color";
import { useOrderEntryActions } from "@/stores/use-order-entry-store";
import { Placeholder } from "./placeholder";
import { PositionCloseAllController } from "./position-close-all-modal";
import type {
	IsolatedMarginPositionRef,
	IsolatedMarginPositionTarget,
	LimitClosePositionData,
	PositionMarketCloseRef,
	PositionPnlShareData,
	PositionReverseRef,
	TpSlPositionRef,
	TpSlPositionTarget,
} from "./position-dialog-types";
import { PositionIsolatedMarginModal } from "./position-isolated-margin-modal";
import { PositionLimitCloseModal } from "./position-limit-close-modal";
import { PositionPnlShareModal } from "./position-pnl-share-modal";
import { PositionReverseConfirmationController } from "./position-reverse-confirmation-controller";
import { type PositionPnlMode, PositionRow } from "./position-row";
import {
	POSITION_TABLE_COLUMNS,
	POSITION_TABLE_MIN_WIDTH,
	positionTableBodyClass,
	positionTableHeadClass,
	positionTableHeaderClass,
} from "./position-table-styles";
import { PositionTpSlModal } from "./position-tpsl-modal";
import {
	positionsPanelTableBodyClass,
	positionsPanelTableCaptionRowClass,
	positionsPanelTableHeaderRowClass,
	positionsPanelTableShellClass,
	positionsPanelTabRootClass,
} from "./positions-panel-table-styles";

interface Props {
	directionFilter: PositionDirectionFilter;
	marketFilter: PositionMarketFilter;
	currentMarket: PositionMarketIdentity | null;
	accountSummary: {
		accountEquity: string;
		unrealizedPnl: string;
		maintenanceMarginRatio: string | null;
	} | null;
}

interface OwnedPositionPnlShare {
	ownerKey: string;
	position: PositionPnlShareData;
}

export function PositionsTab({ directionFilter, marketFilter, currentMarket, accountSummary }: Props) {
	const closeAllUnavailableId = useId();
	const { address, isConnected } = useWalletSession();
	const { clientKey, env } = useHyperliquid();
	const navigateToMarket = useMarketNavigation();
	const { setSide } = useOrderEntryActions();
	const positionMarketClose = usePositionMarketCloseAction();

	function handleSelectMarket(name: string, side: Side) {
		navigateToMarket(name);
		setSide(side);
	}
	const [tpSlModalOpen, setTpSlModalOpen] = useState(false);
	const [selectedTpSlPosition, setSelectedTpSlPosition] = useState<TpSlPositionTarget | null>(null);
	const [limitCloseModalOpen, setLimitCloseModalOpen] = useState(false);
	const [selectedLimitClosePosition, setSelectedLimitClosePosition] = useState<LimitClosePositionData | null>(null);
	const [isolatedMarginModalOpen, setIsolatedMarginModalOpen] = useState(false);
	const [selectedIsolatedMarginPosition, setSelectedIsolatedMarginPosition] =
		useState<IsolatedMarginPositionTarget | null>(null);
	const [selectedReverseTarget, setSelectedReverseTarget] = useState<PositionReverseTarget | null>(null);
	const [closeAllSnapshot, setCloseAllSnapshot] = useState<PositionCloseAllSnapshot | null>(null);
	const [selectedPnlShare, setSelectedPnlShare] = useState<OwnedPositionPnlShare | null>(null);
	const [pnlMode, setPnlMode] = useState<PositionPnlMode>("roe");

	const {
		positions,
		isLoading: positionsLoading,
		hasError: positionsError,
		isStale: positionsStale,
	} = useUserPositions();

	const markets = useMarkets();
	const { getMarketInfo } = useMarketsInfo();

	const { data: openOrdersEvent } = useSubscription(
		"openOrders",
		{ user: address ?? "0x0", dex: HL_ALL_DEXS },
		{ enabled: isConnected && !!address },
	);
	const openOrders = openOrdersEvent?.orders ?? [];

	const tpSlOrdersByCoin = useMemo(() => buildTpSlOrdersByCoin(openOrders), [openOrders]);
	const filteredPositions = filterPositions(positions, directionFilter, marketFilter, currentMarket);
	const totalUnrealizedPnl = getTotalPositionUnrealizedPnl(positions);
	const summaryUnrealizedPnl = accountSummary?.unrealizedPnl ?? totalUnrealizedPnl;
	const accountRisk = getToolbarAccountRiskPresentation(accountSummary?.maintenanceMarginRatio ?? null);
	const closeAllResolution = resolvePositionCloseAllSnapshot({
		owner: address,
		env,
		candidates: positions.map((position) => {
			const market = markets.getMarket(position.coin);
			return {
				coin: position.coin,
				dex: position.dex,
				assetId: market?.assetId,
				szDecimals: market?.szDecimals,
				signedPositionSize: position.szi,
				markPx: getMarketInfo(position.coin)?.markPx,
				positionValue: position.positionValue,
				unrealizedPnl: position.unrealizedPnl,
				marginMode: position.leverage.type,
				quoteSymbol: getPositionCloseAllQuoteSymbol(market),
			};
		}),
	});
	const closeAllDataReady =
		isConnected && !positionsLoading && !positionsError && !positionsStale && !markets.isLoading && !markets.error;
	const closeAllPreview = closeAllDataReady ? closeAllResolution.snapshot : null;
	const closeAllIssues: readonly PositionCloseAllSnapshotIssue[] = closeAllResolution.issues;
	const visibleCloseAllSnapshot =
		address && closeAllSnapshot?.owner === address.toLowerCase() && closeAllSnapshot.env === env
			? closeAllSnapshot
			: null;
	const closeAllUnavailableReason = closeAllPreview
		? null
		: !closeAllDataReady || closeAllIssues.includes("invalid-market")
			? t`Close all is unavailable until every position market and mark price has loaded.`
			: closeAllIssues.includes("invalid-position")
				? t`Close all is unavailable because position data is incomplete.`
				: closeAllIssues.includes("duplicate-market")
					? t`Close all is unavailable because duplicate market data was detected.`
					: t`Close all is currently unavailable.`;

	const pnlHeader = pnlMode === "roe" ? t`PNL (ROE %)` : t`PNL (Price Change %)`;

	function handleOpenMarketClose(position: PositionMarketCloseRef) {
		positionMarketClose.open(position);
	}

	function handleOpenCloseAll() {
		if (!closeAllPreview) return;
		setCloseAllSnapshot(closeAllPreview);
	}

	function handleReverse(data: PositionReverseRef) {
		if (!address) return;
		setSelectedReverseTarget({ ...data, owner: address.toLowerCase(), env });
	}

	function handleOpenLimitCloseModal(data: LimitClosePositionData) {
		setSelectedLimitClosePosition(data);
		setLimitCloseModalOpen(true);
	}

	function handleOpenTpSlModal(data: TpSlPositionRef) {
		if (!address || clientKey === "disconnected" || address.toLowerCase() !== clientKey.toLowerCase()) return;
		setSelectedTpSlPosition({ ...data, owner: clientKey.toLowerCase(), env });
		setTpSlModalOpen(true);
	}

	function handleOpenIsolatedMarginModal(data: IsolatedMarginPositionRef) {
		if (!address || clientKey === "disconnected" || address.toLowerCase() !== clientKey.toLowerCase()) return;
		setSelectedIsolatedMarginPosition({ ...data, owner: clientKey.toLowerCase(), env });
		setIsolatedMarginModalOpen(true);
	}

	function handleOpenPnlShare(data: PositionPnlShareData) {
		if (!address) return;
		setSelectedPnlShare({ ownerKey: `${env}:${address.toLowerCase()}`, position: data });
	}

	function renderPlaceholder() {
		if (!isConnected) return <Placeholder>{t`Connect your wallet to view positions.`}</Placeholder>;
		if (positionsLoading) return <Placeholder>{t`Loading positions...`}</Placeholder>;
		if (positionsError) {
			return (
				<Placeholder variant="error">
					<span>{t`Failed to load positions.`}</span>
				</Placeholder>
			);
		}
		if (positions.length === 0) return <Placeholder>{t`No active positions.`}</Placeholder>;
		return null;
	}

	const placeholder = renderPlaceholder();
	const filteredPlaceholder =
		!placeholder && filteredPositions.length === 0 ? (
			<Placeholder>{t`No positions match the selected filters.`}</Placeholder>
		) : null;

	return (
		<div className={positionsPanelTabRootClass}>
			<div className={positionsPanelTableShellClass}>
				{!placeholder ? (
					<dl
						data-testid="positions-summary-bar"
						className={cn(
							positionsPanelTableCaptionRowClass,
							"h-[58px] justify-start gap-8 bg-market-close-card px-5 py-0 font-market-close",
						)}
					>
						<div className="flex min-w-[7rem] flex-col gap-[3px]">
							<dt className="text-[10px] leading-[14px] font-medium text-market-close-subtle">{t`Account Equity`}</dt>
							<dd className="m-0 text-xs leading-[17px] font-semibold text-market-close-fg tabular-nums">
								{formatUSD(accountSummary?.accountEquity ?? null, { compact: false })}
							</dd>
						</div>
						<div className="flex min-w-[7rem] flex-col gap-[3px]">
							<dt className="text-[10px] leading-[14px] font-medium text-market-close-subtle">{t`Unrealized PNL`}</dt>
							<dd
								className={cn(
									"m-0 text-xs leading-[17px] font-semibold tabular-nums",
									summaryUnrealizedPnl === null
										? "text-market-close-subtle"
										: getMarketCloseValueColorClass(summaryUnrealizedPnl),
								)}
							>
								{formatUSD(summaryUnrealizedPnl, { compact: false, signDisplay: "exceptZero" })}
							</dd>
						</div>
						<div className="flex min-w-[10rem] flex-col gap-[3px]">
							<dt className="text-[10px] leading-[14px] font-medium text-market-close-subtle">
								{t`Maintenance Margin Ratio`}
							</dt>
							<dd className="m-0 flex items-center gap-1.5">
								<span className="h-1 w-14 overflow-hidden rounded-[2px] bg-market-close-stroke-card">
									<span
										className={cn(
											"block h-full rounded-[2px] transition-[width] duration-150",
											accountRisk.tone === "danger"
												? "bg-market-close-danger"
												: accountRisk.tone === "warning"
													? "bg-warning"
													: "bg-market-close-profit",
										)}
										style={{ width: `${accountRisk.progressPercent ?? "0"}%` }}
									/>
								</span>
								<span
									className={cn(
										"text-xs leading-[17px] font-semibold tabular-nums",
										accountSummary?.maintenanceMarginRatio === null || !accountSummary
											? "text-market-close-subtle"
											: accountRisk.tone === "danger"
												? "text-market-close-danger"
												: accountRisk.tone === "warning"
													? "text-warning"
													: "text-market-close-profit",
									)}
								>
									{formatPercent(accountSummary?.maintenanceMarginRatio ?? null, {
										minimumFractionDigits: 1,
										maximumFractionDigits: 1,
										signDisplay: "never",
									})}
								</span>
							</dd>
						</div>
						<div className="ml-auto">
							<dt className="sr-only">{t`Position actions`}</dt>
							<dd className="m-0">
								<button
									type="button"
									onClick={handleOpenCloseAll}
									disabled={!closeAllPreview}
									aria-describedby={closeAllUnavailableReason ? closeAllUnavailableId : undefined}
									title={closeAllUnavailableReason ?? undefined}
									className="min-h-[27px] whitespace-nowrap rounded-[7px] border border-market-close-danger-disabled bg-modal px-2.5 text-xs leading-4 font-semibold text-market-close-danger transition-all duration-[120ms] hover:border-market-close-danger hover:bg-market-close-danger hover:text-market-close-danger-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-market-close-control disabled:cursor-not-allowed disabled:border-market-close-stroke-card disabled:text-market-close-subtle"
								>
									{t`Close All`}
								</button>
								{closeAllUnavailableReason ? (
									<span id={closeAllUnavailableId} className="sr-only">
										{closeAllUnavailableReason}
									</span>
								) : null}
							</dd>
						</div>
					</dl>
				) : null}
				{placeholder || filteredPlaceholder ? (
					<div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
						{placeholder ?? filteredPlaceholder}
					</div>
				) : (
					<ScrollArea className="min-h-0 w-full flex-1 [&_[data-slot=scroll-area-viewport]]:overscroll-x-none">
						<Table
							containerClassName="overflow-visible"
							className="table-fixed w-full"
							style={{ minWidth: POSITION_TABLE_MIN_WIDTH }}
						>
							<colgroup>
								{POSITION_TABLE_COLUMNS.map((column) => (
									<col key={column.id} style={{ width: column.width }} />
								))}
							</colgroup>
							<TableHeader className={positionTableHeaderClass}>
								<TableRow className={positionsPanelTableHeaderRowClass}>
									<TableHead scope="col" size="dense" className={cn(positionTableHeadClass, "min-w-0 pl-5 text-left")}>
										{t`Market`}
									</TableHead>
									<TableHead scope="col" size="dense" className={positionTableHeadClass}>
										{t`Size`} / {t`Position Value`}
									</TableHead>
									<TableHead scope="col" size="dense" className={positionTableHeadClass}>
										<Tooltip
											content={t`Mark price is derived from oracle prices and is used to calculate unrealized PnL and liquidation.`}
											side="top"
										>
											<button
												type="button"
												className="cursor-help border-0 border-b border-dotted border-market-close-stroke-control bg-transparent p-0 text-inherit focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-market-close-control"
											>
												{t`Entry Price`} / {t`Mark Price`}
											</button>
										</Tooltip>
									</TableHead>
									<TableHead scope="col" size="dense" className={positionTableHeadClass}>
										<Tooltip
											content={t`Unrealized PnL is estimated using the mark price. Click to switch the percentage display.`}
											side="top"
										>
											<button
												type="button"
												onClick={() => setPnlMode((current) => (current === "roe" ? "priceChange" : "roe"))}
												aria-label={pnlMode === "roe" ? t`Show price change percentage` : t`Show ROE percentage`}
												className="cursor-pointer border-0 border-b border-dotted border-market-close-stroke-control bg-transparent p-0 text-market-close-muted transition-colors duration-[120ms] hover:text-market-close-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-market-close-control"
											>
												{pnlHeader} <span aria-hidden="true">▾</span>
											</button>
										</Tooltip>
									</TableHead>
									<TableHead scope="col" size="dense" className={positionTableHeadClass}>
										<Tooltip
											content={t`A position may be liquidated when the mark price reaches its liquidation price.`}
											side="top"
										>
											<button
												type="button"
												className="cursor-help border-0 border-b border-dotted border-market-close-stroke-control bg-transparent p-0 text-inherit focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-market-close-control"
											>
												{t`Liquidation Price`}
											</button>
										</Tooltip>
									</TableHead>
									<TableHead scope="col" size="dense" className={positionTableHeadClass}>
										{t`TP/SL`}
									</TableHead>
									<TableHead scope="col" size="dense" className={positionTableHeadClass}>
										{t`Margin`}
									</TableHead>
									<TableHead scope="col" size="dense" className={positionTableHeadClass}>
										<Tooltip
											content={t`Cumulative funding paid or received since this position was opened.`}
											side="top"
										>
											<button
												type="button"
												className="cursor-help border-0 border-b border-dotted border-market-close-stroke-control bg-transparent p-0 text-inherit focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-market-close-control"
											>
												{t({ message: "Funding", context: "Cumulative position funding" })}
											</button>
										</Tooltip>
									</TableHead>
									<TableHead scope="col" size="dense" className={cn(positionTableHeadClass, "pr-5")}>
										{t`Actions`}
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody className={cn(positionsPanelTableBodyClass, positionTableBodyClass)}>
								{filteredPositions.map((p, i) => {
									const assetId = markets.getAssetId(p.coin);
									const marketCloseSession = positionMarketClose.session;
									const isMarketClosePending =
										marketCloseSession !== null &&
										marketCloseSession.position.assetId === assetId &&
										marketCloseSession.phase !== "idle";
									return (
										<PositionRow
											key={`${p.dex}:${p.coin}`}
											position={p}
											env={env}
											isDataStale={positionsStale}
											markets={markets}
											markPx={getMarketInfo(p.coin)?.markPx}
											tpSlInfo={tpSlOrdersByCoin.get(p.coin)}
											isRowClosing={isMarketClosePending}
											isEven={i % 2 === 1}
											pnlMode={pnlMode}
											onMarketClose={handleOpenMarketClose}
											onLimitClose={handleOpenLimitCloseModal}
											onShare={handleOpenPnlShare}
											onReverse={handleReverse}
											onOpenTpSl={handleOpenTpSlModal}
											onAdjustMargin={handleOpenIsolatedMarginModal}
											onSelectMarket={handleSelectMarket}
										/>
									);
								})}
							</TableBody>
						</Table>
					</ScrollArea>
				)}
			</div>

			<PositionTpSlModal open={tpSlModalOpen} onOpenChange={setTpSlModalOpen} position={selectedTpSlPosition} />
			<PositionLimitCloseModal
				open={limitCloseModalOpen}
				onOpenChange={setLimitCloseModalOpen}
				position={selectedLimitClosePosition}
			/>
			<PositionIsolatedMarginModal
				open={isolatedMarginModalOpen}
				onOpenChange={setIsolatedMarginModalOpen}
				position={selectedIsolatedMarginPosition}
			/>
			<PositionReverseConfirmationController
				target={selectedReverseTarget}
				onOpenChange={(open) => {
					if (!open) setSelectedReverseTarget(null);
				}}
			/>
			<PositionCloseAllController
				snapshot={visibleCloseAllSnapshot}
				onOpenChange={(open) => {
					if (!open) setCloseAllSnapshot(null);
				}}
			/>
			<PositionPnlShareModal
				position={
					address && selectedPnlShare?.ownerKey === `${env}:${address.toLowerCase()}` ? selectedPnlShare.position : null
				}
				onOpenChange={(open) => {
					if (!open) setSelectedPnlShare(null);
				}}
			/>
		</div>
	);
}
