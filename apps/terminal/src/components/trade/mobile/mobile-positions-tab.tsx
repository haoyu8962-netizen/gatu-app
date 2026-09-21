import { Button } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import { ChartLineIcon, TrendUpIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { DataPendingState } from "@/components/ui/data-pending-state";
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
import { usePositionDialogActions } from "@/stores/use-position-dialog-store";
import type {
	IsolatedMarginPositionRef,
	LimitClosePositionData,
	PositionMarketCloseRef,
	PositionPnlShareData,
	PositionReverseRef,
	TpSlPositionRef,
} from "../positions/position-dialog-types";
import { PositionFilterToolbar } from "../positions/position-filter-toolbar";
import type { PositionMarketOption } from "../positions/position-market-filter";
import { PositionPnlShareModal } from "../positions/position-pnl-share-modal";
import { MobileBulkDisclosureActions } from "./mobile-bulk-disclosure-actions";
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
	const { openIsolatedMargin, openLimitClose, openReverse, openTpSl } = usePositionDialogActions();
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
	const positionsDisclosure = disclosureState.createController(filteredPositionKeys);
	const { expandedKeys: expandedPositionKeys, setExpanded: setPositionExpanded } = positionsDisclosure;

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

	function renderFilterRow(disabled: boolean) {
		return (
			<div
				data-testid="mobile-position-filter-row"
				className="flex h-9 shrink-0 items-center justify-between border-b border-market-close-stroke-card px-3.5"
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
					disabled={disabled}
				/>
				<MobileBulkDisclosureActions keys={disabled ? [] : filteredPositionKeys} controller={positionsDisclosure} />
			</div>
		);
	}

	if (!isConnected) {
		return (
			<>
				<div className={cn(isPageScroll ? "min-h-0 flex flex-col" : "flex-1 min-h-0 flex flex-col")}>
					{renderFilterRow(true)}
				</div>
				{pnlShareModal}
			</>
		);
	}

	if (positionsLoading || positionsError || positionsStale) {
		return (
			<>
				<DataPendingState loading={positionsLoading} />
				{pnlShareModal}
			</>
		);
	}

	if (positions.length === 0) {
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
			<div className={cn(isPageScroll ? "min-h-0 flex flex-col" : "flex-1 min-h-0 flex flex-col")}>
				{renderFilterRow(false)}
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
			</div>
			{pnlShareModal}
		</>
	);
}
