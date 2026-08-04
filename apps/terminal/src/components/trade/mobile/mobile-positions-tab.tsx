import { Button } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import { ChartLineIcon, TrendUpIcon } from "@phosphor-icons/react";
import { Skeleton } from "boneyard-js/react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { HL_ALL_DEXS } from "@/config/app";
import { buildOrderPlan } from "@/domain/trade/order-intent";
import { throwIfAnyResponseError } from "@/domain/trade/orders";
import {
	ALL_POSITION_MARKETS,
	filterPositions,
	type PositionDirectionFilter,
	type PositionMarketFilter,
	type PositionMarketIdentity,
} from "@/domain/trade/position-toolbar";
import { useMarketNavigation } from "@/hooks/trade/use-market-navigation";
import { usePositionMarketCloseAction } from "@/hooks/trade/use-position-market-close-action";
import { useTrackedOrder } from "@/hooks/trade/use-tracked-order";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { cn } from "@/lib/cn";
import {
	useMarkets,
	useMarketsInfo,
	useSelectedMarketInfo,
	useSubscription,
	useUserPositions,
} from "@/lib/hyperliquid";
import { buildClosePositionDescription } from "@/lib/trade/close-toast";
import { buildTpSlOrdersByCoin } from "@/lib/trade/open-orders";
import type { Side } from "@/lib/trade/types";
import { useMarketOrderSlippageBps } from "@/stores/use-global-settings-store";
import { useOrderEntryActions } from "@/stores/use-order-entry-store";
import type {
	ClosePositionData,
	IsolatedMarginPositionRef,
	LimitClosePositionData,
	PositionMarketCloseRef,
	TpSlPositionRef,
} from "../positions/position-dialog-types";
import { PositionFilterToolbar } from "../positions/position-filter-toolbar";
import { PositionIsolatedMarginModal } from "../positions/position-isolated-margin-modal";
import { PositionLimitCloseModal } from "../positions/position-limit-close-modal";
import type { PositionMarketOption } from "../positions/position-market-filter";
import { PositionTpSlModal } from "../positions/position-tpsl-modal";
import { MobilePositionCard } from "./mobile-position-card";
import type { MobileDataScrollMode } from "./mobile-positions-view";
import { useMobileTerminalTab } from "./use-mobile-terminal-tab";

interface Props {
	scrollMode?: MobileDataScrollMode;
}

interface PositionFiltersState {
	ownerKey: string | null;
	direction: PositionDirectionFilter;
	market: PositionMarketFilter;
}

interface MobilePositionBulkDetailsActionsProps {
	filteredPositionKeys: readonly string[];
	expandedPositionKeys: ReadonlySet<string>;
	onExpandAll: () => void;
	onCollapseAll: () => void;
}

const mobileBulkActionClass =
	"relative min-h-0 whitespace-nowrap p-0 text-xs leading-4 transition-colors duration-[120ms] after:absolute after:top-1/2 after:left-0 after:h-11 after:w-full after:-translate-y-1/2 after:content-[''] focus-visible:rounded-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-market-close-control disabled:cursor-not-allowed disabled:text-fg-disabled";

export function MobilePositionBulkDetailsActions({
	filteredPositionKeys,
	expandedPositionKeys,
	onExpandAll,
	onCollapseAll,
}: MobilePositionBulkDetailsActionsProps) {
	const { t } = useLingui();
	const canExpand = filteredPositionKeys.some((key) => !expandedPositionKeys.has(key));
	const canCollapse = filteredPositionKeys.some((key) => expandedPositionKeys.has(key));

	return (
		<div data-testid="mobile-position-bulk-details-actions" className="flex shrink-0 items-center gap-3">
			<button
				type="button"
				data-testid="expand-all-position-details"
				onClick={onExpandAll}
				disabled={!canExpand}
				className={cn(mobileBulkActionClass, "font-semibold text-market-close-fg")}
			>
				{t`Expand all`}
			</button>
			<button
				type="button"
				data-testid="collapse-all-position-details"
				onClick={onCollapseAll}
				disabled={!canCollapse}
				className={cn(mobileBulkActionClass, "font-normal text-market-close-muted")}
			>
				{t`Collapse all`}
			</button>
		</div>
	);
}

export function MobilePositionsTab({ scrollMode = "contained" }: Props) {
	const { t } = useLingui();
	const { address, isConnected } = useWalletSession();
	const ownerKey = address?.toLowerCase() ?? null;
	const slippageBps = useMarketOrderSlippageBps();
	const navigateToMarket = useMarketNavigation();
	const { setActiveTab } = useMobileTerminalTab();
	const { setSide } = useOrderEntryActions();
	const positionMarketClose = usePositionMarketCloseAction();

	function handleSelectMarket(name: string, side: Side) {
		navigateToMarket(name, undefined, { displayedContent: "trade" });
		setSide(side);
		setActiveTab("trade");
	}
	const [tpSlModalOpen, setTpSlModalOpen] = useState(false);
	const [selectedTpSlPosition, setSelectedTpSlPosition] = useState<TpSlPositionRef | null>(null);
	const [limitCloseModalOpen, setLimitCloseModalOpen] = useState(false);
	const [selectedLimitClosePosition, setSelectedLimitClosePosition] = useState<LimitClosePositionData | null>(null);
	const [isolatedMarginModalOpen, setIsolatedMarginModalOpen] = useState(false);
	const [selectedIsolatedMarginPosition, setSelectedIsolatedMarginPosition] =
		useState<IsolatedMarginPositionRef | null>(null);
	const [closingAssetIds, setClosingAssetIds] = useState<Set<number>>(() => new Set());
	const [closeErrors, setCloseErrors] = useState<Map<number, string>>(() => new Map());
	const [expandedPositionKeys, setExpandedPositionKeys] = useState<Set<string>>(() => new Set());
	const [positionFilters, setPositionFilters] = useState<PositionFiltersState>({
		ownerKey,
		direction: "all",
		market: ALL_POSITION_MARKETS,
	});

	const { submitOrder, reset: resetCloseError } = useTrackedOrder();
	const { positions, isLoading: positionsLoading, hasError: positionsError } = useUserPositions();
	const markets = useMarkets();
	const { getMarketInfo } = useMarketsInfo();
	const { data: selectedMarket } = useSelectedMarketInfo();

	const { data: openOrdersEvent } = useSubscription(
		"openOrders",
		{ user: address ?? "0x0", dex: HL_ALL_DEXS },
		{ enabled: isConnected && !!address },
	);
	const openOrders = openOrdersEvent?.orders ?? [];

	const tpSlOrdersByCoin = useMemo(() => buildTpSlOrdersByCoin(openOrders), [openOrders]);
	const isPageScroll = scrollMode === "page";
	const positionDirectionFilter = positionFilters.ownerKey === ownerKey ? positionFilters.direction : "all";
	const positionMarketFilter = positionFilters.ownerKey === ownerKey ? positionFilters.market : ALL_POSITION_MARKETS;
	const currentPositionMarket: PositionMarketIdentity | null = selectedMarket
		? {
				coin: selectedMarket.name,
				dex: selectedMarket.kind === "builderPerp" ? selectedMarket.dex : "",
			}
		: null;
	const positionMarketOptions: PositionMarketOption[] = positions.map((position) => {
		const market = markets.getMarket(position.coin);
		const baseLabel = market?.shortName ?? position.coin;
		return {
			coin: position.coin,
			dex: position.dex,
			label: position.dex ? `${baseLabel} (${position.dex})` : baseLabel,
		};
	});
	const filteredPositions = filterPositions(
		positions,
		positionDirectionFilter,
		positionMarketFilter,
		currentPositionMarket,
	);
	const filteredPositionKeys = filteredPositions.map(
		(position) => `${ownerKey ?? "disconnected"}:${position.dex}:${position.coin}`,
	);

	function handlePositionDirectionChange(direction: PositionDirectionFilter) {
		setPositionFilters((current) => ({
			ownerKey,
			direction,
			market: current.ownerKey === ownerKey ? current.market : ALL_POSITION_MARKETS,
		}));
	}

	function handlePositionMarketChange(market: PositionMarketFilter) {
		setPositionFilters((current) => ({
			ownerKey,
			direction: current.ownerKey === ownerKey ? current.direction : "all",
			market,
		}));
	}

	function handlePositionExpandedChange(key: string, expanded: boolean) {
		setExpandedPositionKeys((current) => {
			if (current.has(key) === expanded) return current;
			const next = new Set(current);
			if (expanded) next.add(key);
			else next.delete(key);
			return next;
		});
	}

	function handleExpandAllDetails() {
		setExpandedPositionKeys((current) => {
			const next = new Set(current);
			for (const key of filteredPositionKeys) next.add(key);
			return next;
		});
	}

	function handleCollapseAllDetails() {
		setExpandedPositionKeys((current) => {
			const next = new Set(current);
			for (const key of filteredPositionKeys) next.delete(key);
			return next;
		});
	}

	async function submitReverse(data: ClosePositionData) {
		const { assetId, size, markPx, szDecimals, isLong, coin, unrealizedPnl, roe, marginMode } = data;
		if (closingAssetIds.has(assetId)) return;
		resetCloseError();
		setCloseErrors((prev) => {
			if (!prev.has(assetId)) return prev;
			const next = new Map(prev);
			next.delete(assetId);
			return next;
		});
		setClosingAssetIds((prev) => {
			const next = new Set(prev);
			next.add(assetId);
			return next;
		});

		const { orders, grouping } = buildOrderPlan({
			kind: "reverse",
			assetId,
			size,
			szDecimals,
			isLong,
			markPx,
			slippageBps,
		});

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
			toast.success(t`Position reversed — ${coin}`, {
				description: buildClosePositionDescription({ size, szDecimals, coin, unrealizedPnl, roe }),
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : t`Failed to reverse position`;
			toast.error(message);
			setCloseErrors((prev) => {
				const next = new Map(prev);
				next.set(assetId, message);
				return next;
			});
		} finally {
			setClosingAssetIds((prev) => {
				const next = new Set(prev);
				next.delete(assetId);
				return next;
			});
		}
	}

	function handleOpenMarketClose(position: PositionMarketCloseRef) {
		positionMarketClose.open(position);
	}

	function handleReverse(data: ClosePositionData) {
		void submitReverse(data);
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

	if (!isConnected) {
		return (
			<div className="flex-1 flex items-center justify-center p-6 text-sm text-fg-muted">
				{t`Connect your wallet to view positions.`}
			</div>
		);
	}

	if (positionsError) {
		return (
			<div className="flex-1 flex items-center justify-center p-6 text-sm text-error">
				{t`Failed to load positions.`}
			</div>
		);
	}

	if (!positionsLoading && positions.length === 0) {
		return (
			<div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
				<div className="size-12 rounded-full flex items-center justify-center bg-surface">
					<ChartLineIcon className="size-6 text-fg-muted" />
				</div>
				<p className="text-sm text-fg-muted text-pretty">{t`No active positions.`}</p>
				<Button
					variant="outline"
					intent="neutral"
					size="sm"
					iconLeft={<TrendUpIcon className="size-4" />}
					onClick={() => setActiveTab("trade")}
				>
					{t`Go to Trade`}
				</Button>
			</div>
		);
	}

	return (
		<Skeleton name="positions-tab" loading={positionsLoading}>
			<div className={cn(isPageScroll ? "min-h-0 flex flex-col" : "flex-1 min-h-0 flex flex-col")}>
				<div
					data-testid="mobile-position-filter-row"
					className="flex shrink-0 items-center justify-between border-b border-market-close-stroke-card px-3.5 py-2.5"
				>
					<PositionFilterToolbar
						direction={positionDirectionFilter}
						market={positionMarketFilter}
						marketOptions={positionMarketOptions}
						onDirectionChange={handlePositionDirectionChange}
						onMarketChange={handlePositionMarketChange}
						mobile
					/>
					<MobilePositionBulkDetailsActions
						filteredPositionKeys={filteredPositionKeys}
						expandedPositionKeys={expandedPositionKeys}
						onExpandAll={handleExpandAllDetails}
						onCollapseAll={handleCollapseAllDetails}
					/>
				</div>
				<div className={cn("space-y-2.5 px-3.5 py-3", !isPageScroll && "flex-1 min-h-0 overflow-y-auto")}>
					{filteredPositions.length === 0 ? (
						<div className="flex min-h-28 items-center justify-center px-4 text-center text-xs text-fg-muted">
							{t`No positions match the selected filters.`}
						</div>
					) : null}
					{filteredPositions.map((p) => {
						const assetId = markets.getAssetId(p.coin);
						const marketCloseSession = positionMarketClose.session;
						const isMarketClosePending =
							marketCloseSession !== null &&
							marketCloseSession.position.assetId === assetId &&
							marketCloseSession.phase !== "idle";
						const isRowClosing = (typeof assetId === "number" && closingAssetIds.has(assetId)) || isMarketClosePending;
						const closeErrorMessage = typeof assetId === "number" ? (closeErrors.get(assetId) ?? null) : null;
						const positionKey = `${ownerKey ?? "disconnected"}:${p.dex}:${p.coin}`;
						return (
							<MobilePositionCard
								key={positionKey}
								position={p}
								markets={markets}
								markPx={getMarketInfo(p.coin)?.markPx}
								tpSlInfo={tpSlOrdersByCoin.get(p.coin)}
								isRowClosing={isRowClosing}
								closeErrorMessage={closeErrorMessage}
								expanded={expandedPositionKeys.has(positionKey)}
								onExpandedChange={(expanded) => handlePositionExpandedChange(positionKey, expanded)}
								onMarketClose={handleOpenMarketClose}
								onReverse={handleReverse}
								onLimitClose={handleOpenLimitCloseModal}
								onOpenTpSl={handleOpenTpSlModal}
								onAdjustMargin={handleOpenIsolatedMarginModal}
								onSelectMarket={handleSelectMarket}
							/>
						);
					})}
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
		</Skeleton>
	);
}
