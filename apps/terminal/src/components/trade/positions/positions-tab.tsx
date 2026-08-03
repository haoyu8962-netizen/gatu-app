import { Table, TableBody, TableHead, TableHeader, TableRow } from "@gatu/ui";
import { t } from "@lingui/core/macro";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { HL_ALL_DEXS } from "@/config/app";
import { buildOrderPlan } from "@/domain/trade/order-intent";
import { throwIfAnyResponseError } from "@/domain/trade/orders";
import {
	filterPositions,
	type PositionDirectionFilter,
	type PositionMarketFilter,
	type PositionMarketIdentity,
} from "@/domain/trade/position-toolbar";
import { useMarketNavigation } from "@/hooks/trade/use-market-navigation";
import { useTrackedOrder } from "@/hooks/trade/use-tracked-order";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { cn } from "@/lib/cn";
import { useMarkets, useMarketsInfo, useSubscription, useUserPositions } from "@/lib/hyperliquid";
import { buildClosePositionDescription } from "@/lib/trade/close-toast";
import { buildTpSlOrdersByCoin } from "@/lib/trade/open-orders";
import type { Side } from "@/lib/trade/types";
import { useMarketOrderSlippageBps } from "@/stores/use-global-settings-store";
import { useOrderEntryActions } from "@/stores/use-order-entry-store";
import { Placeholder } from "./placeholder";
import type {
	ClosePositionData,
	IsolatedMarginPositionRef,
	LimitClosePositionData,
	TpSlPositionRef,
} from "./position-dialog-types";
import { PositionIsolatedMarginModal } from "./position-isolated-margin-modal";
import { PositionLimitCloseModal } from "./position-limit-close-modal";
import { PositionRow } from "./position-row";
import {
	POSITION_TABLE_MIN_WIDTH,
	positionTableBodyClass,
	positionTableHeadClass,
	positionTableHeaderClass,
} from "./position-table-styles";
import { PositionTpSlModal } from "./position-tpsl-modal";
import {
	positionsPanelTableBodyClass,
	positionsPanelTableHeaderRowClass,
	positionsPanelTableShellClass,
	positionsPanelTabRootClass,
} from "./positions-panel-table-styles";

type CloseIntent = "close" | "reverse";

interface Props {
	directionFilter: PositionDirectionFilter;
	marketFilter: PositionMarketFilter;
	currentMarket: PositionMarketIdentity | null;
}

export function PositionsTab({ directionFilter, marketFilter, currentMarket }: Props) {
	const { address, isConnected } = useWalletSession();
	const slippageBps = useMarketOrderSlippageBps();
	const navigateToMarket = useMarketNavigation();
	const { setSide } = useOrderEntryActions();

	function handleSelectMarket(name: string, side: Side) {
		navigateToMarket(name);
		setSide(side);
	}
	const [tpSlModalOpen, setTpSlModalOpen] = useState(false);
	const [selectedTpSlPosition, setSelectedTpSlPosition] = useState<TpSlPositionRef | null>(null);
	const [limitCloseModalOpen, setLimitCloseModalOpen] = useState(false);
	const [selectedLimitClosePosition, setSelectedLimitClosePosition] = useState<LimitClosePositionData | null>(null);
	const [isolatedMarginModalOpen, setIsolatedMarginModalOpen] = useState(false);
	const [selectedIsolatedMarginPosition, setSelectedIsolatedMarginPosition] =
		useState<IsolatedMarginPositionRef | null>(null);
	const [closingAssetIds, setClosingAssetIds] = useState<Set<number>>(() => new Set());

	const { submitOrder, error: closeError, reset: resetCloseError } = useTrackedOrder();

	const { positions, isLoading: positionsLoading, hasError: positionsError } = useUserPositions();

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

	const actionError = closeError?.message;

	async function submitCloseOrReverse(intent: CloseIntent, data: ClosePositionData) {
		const { assetId, size, markPx, szDecimals, isLong, coin, unrealizedPnl, roe, marginMode } = data;
		if (closingAssetIds.has(assetId)) return;

		resetCloseError();
		setClosingAssetIds((prev) => {
			const next = new Set(prev);
			next.add(assetId);
			return next;
		});

		const { orders, grouping } = buildOrderPlan({
			kind: intent === "close" ? "marketClose" : "reverse",
			assetId,
			size,
			szDecimals,
			isLong,
			markPx,
			slippageBps,
		});

		const title = intent === "close" ? t`Position closed — ${coin}` : t`Position reversed — ${coin}`;
		const failureMessage = intent === "close" ? t`Failed to close position` : t`Failed to reverse position`;

		try {
			const submission = await submitOrder({ orders, grouping }, { riskContext: { marketKind: "perp", marginMode } });
			if (submission.state === "blocked") {
				toast.warning(t`Another order for this market is still being confirmed.`);
				return;
			}
			if (submission.state === "reconciling") {
				toast.info(t`Order submitted. Confirming exchange status; do not retry.`);
				return;
			}
			throwIfAnyResponseError(submission.result.response?.data?.statuses);
			toast.success(title, {
				description: buildClosePositionDescription({ size, szDecimals, coin, unrealizedPnl, roe }),
			});
		} catch (error) {
			toast.error(error instanceof Error ? error.message : failureMessage);
		} finally {
			setClosingAssetIds((prev) => {
				const next = new Set(prev);
				next.delete(assetId);
				return next;
			});
		}
	}

	function handleClosePosition(data: ClosePositionData) {
		void submitCloseOrReverse("close", data);
	}

	function handleReverse(data: ClosePositionData) {
		void submitCloseOrReverse("reverse", data);
	}

	function handleOpenLimitCloseModal(data: LimitClosePositionData) {
		setSelectedLimitClosePosition(data);
		setLimitCloseModalOpen(true);
	}

	function handleOpenTpSlModal(data: TpSlPositionRef) {
		setSelectedTpSlPosition(data);
		setTpSlModalOpen(true);
	}

	function handleOpenIsolatedMarginModal(data: IsolatedMarginPositionRef) {
		setSelectedIsolatedMarginPosition(data);
		setIsolatedMarginModalOpen(true);
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
			{actionError ? <div className="px-2.5 py-1 text-2xs text-error">{actionError}</div> : null}
			<div className={positionsPanelTableShellClass}>
				{placeholder || filteredPlaceholder ? (
					<div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
						{placeholder ?? filteredPlaceholder}
					</div>
				) : (
					<ScrollArea className="min-h-0 w-full flex-1 [&_[data-slot=scroll-area-scrollbar]]:hidden [&_[data-slot=scroll-area-viewport]]:overscroll-x-none">
						<Table
							containerClassName="overflow-visible"
							className="table-auto w-full"
							style={{ minWidth: POSITION_TABLE_MIN_WIDTH }}
						>
							<TableHeader className={positionTableHeaderClass}>
								<TableRow className={positionsPanelTableHeaderRowClass}>
									<TableHead scope="col" size="dense" className={cn(positionTableHeadClass, "min-w-0 pl-3")}>
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
										{t`Mark Price`}
									</TableHead>
									<TableHead scope="col" size="dense" className={positionTableHeadClass}>
										{t`PNL`} (ROE)
									</TableHead>
									<TableHead scope="col" size="dense" className={positionTableHeadClass}>
										{t`Liquidation Price`}
									</TableHead>
									<TableHead scope="col" size="dense" className={positionTableHeadClass}>
										{t`Margin`}
									</TableHead>
									<TableHead scope="col" size="dense" className={positionTableHeadClass}>
										{t({ message: "Funding", context: "Cumulative position funding" })}
									</TableHead>
									<TableHead scope="col" size="dense" className={positionTableHeadClass}>
										{t`Actions`}
									</TableHead>
									<TableHead scope="col" size="dense" className={positionTableHeadClass}>
										{t`TP/SL`}
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody className={cn(positionsPanelTableBodyClass, positionTableBodyClass)}>
								{filteredPositions.map((p, i) => {
									const assetId = markets.getAssetId(p.coin);
									return (
										<PositionRow
											key={p.coin}
											position={p}
											markets={markets}
											markPx={getMarketInfo(p.coin)?.markPx}
											tpSlInfo={tpSlOrdersByCoin.get(p.coin)}
											isRowClosing={typeof assetId === "number" && closingAssetIds.has(assetId)}
											isEven={i % 2 === 1}
											onClose={handleClosePosition}
											onLimitClose={handleOpenLimitCloseModal}
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
		</div>
	);
}
