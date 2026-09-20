import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Tooltip } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import { useId, useMemo, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { HL_ALL_DEXS } from "@/config/app";
import {
	getPositionCloseAllQuoteSymbol,
	type PositionCloseAllSnapshotIssue,
	resolvePositionCloseAllSnapshot,
} from "@/domain/trade/position-close-all";
import {
	filterPositions,
	type PositionDirectionFilter,
	type PositionMarketFilter,
	type PositionMarketIdentity,
} from "@/domain/trade/position-toolbar";
import { useMarketNavigation } from "@/hooks/trade/use-market-navigation";
import { usePositionMarketCloseAction } from "@/hooks/trade/use-position-market-close-action";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { cn } from "@/lib/cn";
import { useHyperliquid, useMarkets, useMarketsInfo, useSubscription, useUserPositions } from "@/lib/hyperliquid";
import { buildTpSlOrdersByCoin } from "@/lib/trade/open-orders";
import type { Side } from "@/lib/trade/types";
import { useOrderEntryActions } from "@/stores/use-order-entry-store";
import { usePositionCloseAllSession, usePositionDialogActions } from "@/stores/use-position-dialog-store";
import { PassiveDataPlaceholder } from "./passive-data-placeholder";
import { Placeholder } from "./placeholder";
import type {
	IsolatedMarginPositionRef,
	LimitClosePositionData,
	PositionMarketCloseRef,
	PositionPnlShareData,
	PositionReverseRef,
	TpSlPositionRef,
} from "./position-dialog-types";
import { PositionPnlShareModal } from "./position-pnl-share-modal";
import { type PositionPnlMode, PositionRow } from "./position-row";
import {
	POSITION_TABLE_COLUMNS,
	POSITION_TABLE_MIN_WIDTH,
	positionTableBodyClass,
	positionTableHeadClass,
	positionTableHeaderClass,
} from "./position-table-styles";
import {
	positionsPanelTableBodyClass,
	positionsPanelTableHeaderRowClass,
	positionsPanelTableShellClass,
	positionsPanelTabRootClass,
} from "./positions-panel-table-styles";

interface Props {
	directionFilter: PositionDirectionFilter;
	marketFilter: PositionMarketFilter;
	currentMarket: PositionMarketIdentity | null;
}

interface OwnedPositionPnlShare {
	ownerKey: string;
	position: PositionPnlShareData;
}

export function PositionsTab({ directionFilter, marketFilter, currentMarket }: Props) {
	const { t } = useLingui();
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
	const closeAllSession = usePositionCloseAllSession();
	const { openCloseAll, openIsolatedMargin, openLimitClose, openReverse, openTpSl } = usePositionDialogActions();
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
	const signingIdentityReady =
		isConnected && !!address && clientKey !== "disconnected" && address.toLowerCase() === clientKey.toLowerCase();
	const closeAllMarketDataReady =
		!positionsLoading && !positionsError && !positionsStale && !markets.isLoading && !markets.error;
	const closeAllDataReady = signingIdentityReady && closeAllMarketDataReady;

	function resolveCurrentCloseAllSnapshot(capturedAtMs = Date.now()) {
		return resolvePositionCloseAllSnapshot({
			owner: address,
			env,
			capturedAtMs,
			candidates: positions.map((position) => {
				const market = markets.getMarket(position.coin);
				return {
					coin: position.coin,
					dex: position.dex,
					assetId: market?.assetId,
					szDecimals: market?.szDecimals,
					signedPositionSize: position.szi,
					positionValue: position.positionValue,
					unrealizedPnl: position.unrealizedPnl,
					marginMode: position.leverage.type,
					quoteSymbol: getPositionCloseAllQuoteSymbol(market),
				};
			}),
		});
	}

	const closeAllResolution = resolveCurrentCloseAllSnapshot();
	const closeAllPreview = closeAllDataReady ? closeAllResolution.snapshot : null;
	const closeAllIssues: readonly PositionCloseAllSnapshotIssue[] = closeAllResolution.issues;
	const hasCloseAllSession =
		!!address && closeAllSession?.snapshot.owner === address.toLowerCase() && closeAllSession.snapshot.env === env;

	function getCloseAllUnavailableReason() {
		if (closeAllPreview) return null;
		if (!signingIdentityReady) return t`Close all is currently unavailable.`;
		if (!closeAllMarketDataReady || closeAllIssues.includes("invalid-market")) {
			return t`Close all is unavailable until every position market has loaded.`;
		}
		if (closeAllIssues.includes("invalid-position")) {
			return t`Close all is unavailable because position data is incomplete.`;
		}
		if (closeAllIssues.includes("duplicate-market")) {
			return t`Close all is unavailable because duplicate market data was detected.`;
		}
		return t`Close all is currently unavailable.`;
	}

	const closeAllUnavailableReason = getCloseAllUnavailableReason();

	const pnlHeader = pnlMode === "roe" ? t`PNL (ROE %)` : t`PNL (Price Change %)`;

	function handleOpenMarketClose(position: PositionMarketCloseRef) {
		positionMarketClose.open(position);
	}

	function handleOpenCloseAll() {
		if (!closeAllDataReady || hasCloseAllSession) return;
		const resolution = resolveCurrentCloseAllSnapshot(Date.now());
		if (resolution.snapshot) openCloseAll(resolution.snapshot);
	}

	function handleReverse(data: PositionReverseRef) {
		if (!address) return;
		openReverse({ ...data, owner: address.toLowerCase(), env });
	}

	function handleOpenLimitCloseModal(data: LimitClosePositionData) {
		openLimitClose(data);
	}

	function handleOpenTpSlModal(data: TpSlPositionRef) {
		if (!address || clientKey === "disconnected" || address.toLowerCase() !== clientKey.toLowerCase()) return;
		openTpSl({ ...data, owner: clientKey.toLowerCase(), env });
	}

	function handleOpenIsolatedMarginModal(data: IsolatedMarginPositionRef) {
		if (!address || clientKey === "disconnected" || address.toLowerCase() !== clientKey.toLowerCase()) return;
		openIsolatedMargin({ ...data, owner: clientKey.toLowerCase(), env });
	}

	function handleOpenPnlShare(data: PositionPnlShareData) {
		if (!address) return;
		setSelectedPnlShare({ ownerKey: `${env}:${address.toLowerCase()}`, position: data });
	}

	function renderPlaceholder() {
		if (!isConnected) return <Placeholder>{t`Connect your wallet to view positions.`}</Placeholder>;
		if (positionsError || positionsStale) return <PassiveDataPlaceholder />;
		if (positionsLoading) return <PassiveDataPlaceholder busy />;
		if (positions.length === 0) return <Placeholder>{t`No active positions.`}</Placeholder>;
		return null;
	}

	const placeholder = renderPlaceholder();

	return (
		<div className={positionsPanelTabRootClass}>
			<div className={positionsPanelTableShellClass}>
				{placeholder ? (
					<div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{placeholder}</div>
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
									<TableHead scope="col" size="dense" className={cn(positionTableHeadClass, "min-w-0 ps-5 text-start")}>
										{t`Market`}
									</TableHead>
									<TableHead scope="col" size="dense" className={positionTableHeadClass}>
										{t`Size`}
									</TableHead>
									<TableHead scope="col" size="dense" className={positionTableHeadClass}>
										{t`Position Value`}
									</TableHead>
									<TableHead scope="col" size="dense" className={positionTableHeadClass}>
										{t`Entry Price`}
									</TableHead>
									<TableHead scope="col" size="dense" className={positionTableHeadClass}>
										<Tooltip
											content={t`Mark price is derived from oracle prices and is used to calculate unrealized PnL and liquidation.`}
											side="top"
										>
											<button
												type="button"
												className="cursor-help border-0 border-b border-dotted border-market-close-stroke-control bg-transparent p-0 text-inherit focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-market-close-focus"
											>
												{t`Mark Price`}
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
												className="cursor-pointer border-0 border-b border-dotted border-market-close-stroke-control bg-transparent p-0 text-market-close-muted transition-colors duration-[120ms] hover:text-market-close-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-market-close-focus"
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
												className="cursor-help border-0 border-b border-dotted border-market-close-stroke-control bg-transparent p-0 text-inherit focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-market-close-focus"
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
												className="cursor-help border-0 border-b border-dotted border-market-close-stroke-control bg-transparent p-0 text-inherit focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-market-close-focus"
											>
												{t({ message: "Funding", context: "Cumulative position funding" })}
											</button>
										</Tooltip>
									</TableHead>
									<TableHead scope="col" size="dense" className={cn(positionTableHeadClass, "pe-5")}>
										<span className="sr-only">{t`Actions`}</span>
										{closeAllUnavailableReason ? (
											<span id={closeAllUnavailableId} className="sr-only">
												{closeAllUnavailableReason}
											</span>
										) : null}
										<Tooltip content={closeAllUnavailableReason} side="top">
											<span className="inline-flex max-w-full">
												<Button
													type="button"
													variant="ghost"
													intent="brand"
													size="xxs"
													disabled={!closeAllPreview || hasCloseAllSession}
													focusableWhenDisabled
													onClick={closeAllPreview ? handleOpenCloseAll : undefined}
													aria-describedby={closeAllUnavailableReason ? closeAllUnavailableId : undefined}
													className="h-[26px] min-h-0 max-w-full rounded-[6px] bg-transparent px-1 py-0 text-right text-2xs leading-4 font-semibold whitespace-nowrap text-market-close-success shadow-none transition-colors duration-[120ms] hover:bg-market-close-hover hover:text-market-close-fg focus-visible:!outline-market-close-focus active:not-data-disabled:scale-100 data-disabled:bg-transparent data-disabled:text-market-close-subtle"
												>
													{t`Close All Positions`}
												</Button>
											</span>
										</Tooltip>
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody className={cn(positionsPanelTableBodyClass, positionTableBodyClass)}>
								{filteredPositions.length === 0 ? (
									<TableRow>
										<TableCell
											colSpan={POSITION_TABLE_COLUMNS.length}
											className="h-24 text-center text-xs text-market-close-subtle"
										>
											{t`No positions match the selected filters.`}
										</TableCell>
									</TableRow>
								) : null}
								{filteredPositions.map((p, i) => {
									const assetId = markets.getAssetId(p.coin);
									const isMarketClosePending = positionMarketClose.pendingAssetId === assetId;
									const marketInfo = getMarketInfo(p.coin);
									return (
										<PositionRow
											key={`${p.dex}:${p.coin}`}
											position={p}
											env={env}
											isDataStale={positionsStale}
											markets={markets}
											markPx={marketInfo?.markPx}
											markPriceStatus={marketInfo?.markPriceStatus ?? "loading"}
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
