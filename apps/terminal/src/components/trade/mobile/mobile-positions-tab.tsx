import { Button } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import { ChartLineIcon, TrendUpIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { HL_ALL_DEXS } from "@/config/app";
import {
	ALL_POSITION_MARKETS,
	filterPositions,
	type PositionDirectionFilter,
	type PositionMarginFilter,
	type PositionMarketFilter,
	type PositionMarketIdentity,
} from "@/domain/trade/position-toolbar";
import { useMarketNavigation } from "@/hooks/trade/use-market-navigation";
import { usePositionMarketCloseAction } from "@/hooks/trade/use-position-market-close-action";
import type { PositionReverseTarget } from "@/hooks/trade/use-position-reverse-submit";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { cn } from "@/lib/cn";
import {
	useHyperliquid,
	useMarkets,
	useMarketsInfo,
	useSelectedMarketInfo,
	useSubscription,
	useUserPositions,
} from "@/lib/hyperliquid";
import { buildTpSlOrdersByCoin } from "@/lib/trade/open-orders";
import type { Side } from "@/lib/trade/types";
import { useOrderEntryActions } from "@/stores/use-order-entry-store";
import type {
	IsolatedMarginPositionRef,
	IsolatedMarginPositionTarget,
	LimitClosePositionData,
	PositionMarketCloseRef,
	PositionPnlShareData,
	PositionReverseRef,
	TpSlPositionRef,
	TpSlPositionTarget,
} from "../positions/position-dialog-types";
import { PositionFilterToolbar } from "../positions/position-filter-toolbar";
import { PositionIsolatedMarginModal } from "../positions/position-isolated-margin-modal";
import { PositionLimitCloseModal } from "../positions/position-limit-close-modal";
import type { PositionMarketOption } from "../positions/position-market-filter";
import { PositionPnlShareModal } from "../positions/position-pnl-share-modal";
import { PositionReverseConfirmationController } from "../positions/position-reverse-confirmation-controller";
import { PositionTpSlModal } from "../positions/position-tpsl-modal";
import { MobilePositionCard } from "./mobile-position-card";
import type { MobileDataScrollMode } from "./mobile-positions-view";
import type { MobileDisclosureSetState } from "./use-mobile-disclosure-set";
import { useMobileTerminalTab } from "./use-mobile-terminal-tab";

interface Props {
	scrollMode?: MobileDataScrollMode;
	disclosureState: MobileDisclosureSetState;
}

interface PositionFiltersState {
	ownerKey: string | null;
	direction: PositionDirectionFilter;
	margin: PositionMarginFilter;
	market: PositionMarketFilter;
}

interface OwnedPositionPnlShare {
	ownerKey: string;
	position: PositionPnlShareData;
}

interface MobilePositionBulkDetailsActionsProps {
	filteredPositionKeys: readonly string[];
	expandedPositionKeys: ReadonlySet<string>;
	onExpandAll: () => void;
	onCollapseAll: () => void;
}

const mobileBulkActionClass =
	"relative min-h-0 whitespace-nowrap p-0 text-xs leading-4 transition-colors duration-[120ms] after:absolute after:top-1/2 after:left-0 after:h-11 after:w-full after:-translate-y-1/2 after:content-[''] focus-visible:rounded-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-market-close-focus disabled:cursor-not-allowed disabled:text-fg-disabled";

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

export function MobilePositionsTab({ scrollMode = "contained", disclosureState }: Props) {
	const { t } = useLingui();
	const { address, isConnected } = useWalletSession();
	const { clientKey, env } = useHyperliquid();
	const ownerKey = address?.toLowerCase() ?? null;
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
	const [selectedTpSlPosition, setSelectedTpSlPosition] = useState<TpSlPositionTarget | null>(null);
	const [limitCloseModalOpen, setLimitCloseModalOpen] = useState(false);
	const [selectedLimitClosePosition, setSelectedLimitClosePosition] = useState<LimitClosePositionData | null>(null);
	const [isolatedMarginModalOpen, setIsolatedMarginModalOpen] = useState(false);
	const [selectedIsolatedMarginPosition, setSelectedIsolatedMarginPosition] =
		useState<IsolatedMarginPositionTarget | null>(null);
	const [selectedReverseTarget, setSelectedReverseTarget] = useState<PositionReverseTarget | null>(null);
	const [selectedPnlShare, setSelectedPnlShare] = useState<OwnedPositionPnlShare | null>(null);
	const [positionFilters, setPositionFilters] = useState<PositionFiltersState>({
		ownerKey,
		direction: "all",
		margin: "all",
		market: ALL_POSITION_MARKETS,
	});

	const {
		positions,
		isLoading: positionsLoading,
		hasError: positionsError,
		isStale: positionsStale,
	} = useUserPositions();
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
	const positionMarginFilter = positionFilters.ownerKey === ownerKey ? positionFilters.margin : "all";
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
		positionMarginFilter,
	);
	const filteredPositionKeys = filteredPositions.map(
		(position) => `${ownerKey ?? "disconnected"}:${position.dex}:${position.coin}`,
	);
	const {
		expandedKeys: expandedPositionKeys,
		setExpanded: setPositionExpanded,
		expandAll: expandAllPositions,
		collapseAll: collapseAllPositions,
	} = disclosureState.createController(filteredPositionKeys);

	function handlePositionDirectionChange(direction: PositionDirectionFilter) {
		setPositionFilters((current) => ({
			ownerKey,
			direction,
			margin: current.ownerKey === ownerKey ? current.margin : "all",
			market: current.ownerKey === ownerKey ? current.market : ALL_POSITION_MARKETS,
		}));
	}

	function handlePositionMarginChange(margin: PositionMarginFilter) {
		setPositionFilters((current) => ({
			ownerKey,
			direction: current.ownerKey === ownerKey ? current.direction : "all",
			margin,
			market: current.ownerKey === ownerKey ? current.market : ALL_POSITION_MARKETS,
		}));
	}

	function handlePositionMarketChange(market: PositionMarketFilter) {
		setPositionFilters((current) => ({
			ownerKey,
			direction: current.ownerKey === ownerKey ? current.direction : "all",
			margin: current.ownerKey === ownerKey ? current.margin : "all",
			market,
		}));
	}

	function handlePositionExpandedChange(key: string, expanded: boolean) {
		if (expandedPositionKeys.has(key) === expanded) return;
		setPositionExpanded(key, expanded);
	}

	function handleExpandAllDetails() {
		expandAllPositions(filteredPositionKeys);
	}

	function handleCollapseAllDetails() {
		collapseAllPositions(filteredPositionKeys);
	}

	function handleOpenMarketClose(position: PositionMarketCloseRef) {
		positionMarketClose.open(position);
	}

	const pnlShareModal = (
		<PositionPnlShareModal
			position={
				address && selectedPnlShare?.ownerKey === `${env}:${address.toLowerCase()}` ? selectedPnlShare.position : null
			}
			onOpenChange={(open) => {
				if (!open) setSelectedPnlShare(null);
			}}
		/>
	);

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

	if (!isConnected) {
		return (
			<>
				<div className="flex-1 flex items-center justify-center p-6 text-sm text-fg-muted">
					{t`Connect your wallet to view positions.`}
				</div>
				{pnlShareModal}
			</>
		);
	}

	if (positionsError) {
		return (
			<>
				<div className="flex-1 flex items-center justify-center p-6 text-sm text-error">
					{t`Failed to load positions.`}
				</div>
				{pnlShareModal}
			</>
		);
	}

	if (!positionsLoading && positions.length === 0) {
		return (
			<>
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
				{pnlShareModal}
			</>
		);
	}

	return (
		<>
			<Skeleton name="positions-tab" loading={positionsLoading}>
				<div className={cn(isPageScroll ? "min-h-0 flex flex-col" : "flex-1 min-h-0 flex flex-col")}>
					<div
						data-testid="mobile-position-filter-row"
						className="flex shrink-0 items-center justify-between border-b border-market-close-stroke-card px-3.5 py-2.5"
					>
						<PositionFilterToolbar
							direction={positionDirectionFilter}
							margin={positionMarginFilter}
							market={positionMarketFilter}
							marketOptions={positionMarketOptions}
							onDirectionChange={handlePositionDirectionChange}
							onMarginChange={handlePositionMarginChange}
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
							const isMarketClosePending = positionMarketClose.pendingAssetId === assetId;
							const isRowClosing = isMarketClosePending;
							const positionKey = `${ownerKey ?? "disconnected"}:${p.dex}:${p.coin}`;
							const marketInfo = getMarketInfo(p.coin);
							return (
								<MobilePositionCard
									key={positionKey}
									position={p}
									env={env}
									isDataStale={positionsStale}
									markets={markets}
									markPx={marketInfo?.markPx}
									markPriceStatus={marketInfo?.markPriceStatus ?? "loading"}
									tpSlInfo={tpSlOrdersByCoin.get(p.coin)}
									isRowClosing={isRowClosing}
									expanded={expandedPositionKeys.has(positionKey)}
									onExpandedChange={(expanded) => handlePositionExpandedChange(positionKey, expanded)}
									onMarketClose={handleOpenMarketClose}
									onShare={handleOpenPnlShare}
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
					<PositionReverseConfirmationController
						target={selectedReverseTarget}
						onOpenChange={(open) => {
							if (!open) setSelectedReverseTarget(null);
						}}
					/>
				</div>
			</Skeleton>
			{pnlShareModal}
		</>
	);
}
