import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from "@gatu/ui";
import { useLingui } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import { Suspense, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Spinner } from "@/components/ui/spinner";
import { PORTFOLIO_TRANSFERS_TAB } from "@/config/account-ledger";
import { DEFAULT_QUOTE_TOKEN, HL_ALL_DEXS } from "@/config/app";
import { POSITIONS_TABS } from "@/config/trade";
import {
	getAccountEquityValue,
	getPerpRiskSummaryValue,
	getUnifiedAccountMarginRatioValue,
	isQuoteBalanceSharedWithPerps,
} from "@/domain/trade/balances";
import {
	ALL_POSITION_MARKETS,
	getReadyItemCount,
	type PositionDirectionFilter,
	type PositionMarketFilter,
	type PositionMarketIdentity,
} from "@/domain/trade/position-toolbar";
import { getToolbarAccountMarginRatio } from "@/domain/trade/trading-toolbar-metrics";
import {
	isSupportedAccountAbstraction,
	useDefaultDexBalances,
	useSelectedDexBalances,
} from "@/hooks/trade/use-account-balances";
import { useSpotTokenUsdPrices } from "@/hooks/trade/use-spot-token-usd-prices";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { cn } from "@/lib/cn";
import { useMarkets, useSelectedMarketInfo, useSubscription, useUserPositions } from "@/lib/hyperliquid";
import { createLazyComponent } from "@/lib/lazy";
import { useRenderCommitTrack } from "@/lib/performance/render-profile";
import { toNumberOrZero } from "@/lib/trade/numbers";
import { useDepositModalActions } from "@/stores/use-global-modal-store";
import { useGlobalSettingsActions, usePositionsActiveTab } from "@/stores/use-global-settings-store";
import { PositionFilterToolbar } from "./position-filter-toolbar";
import type { PositionMarketOption } from "./position-market-filter";

const tabContentBaseClass = "mt-0 flex min-h-0 flex-1 flex-col pt-0";
const CONTEXTUAL_TOOLBAR_TABS = new Set(["orders", "funding", "orders-history"]);

const BalancesTab = createLazyComponent(() => import("./balances-tab"), "BalancesTab");
const AccountTransfersTab = createLazyComponent(() => import("./account-transfers-tab"), "AccountTransfersTab");
const FundingTab = createLazyComponent(() => import("./funding-tab"), "FundingTab");
const HistoryTab = createLazyComponent(() => import("./history-tab"), "HistoryTab");
const OrdersHistoryTab = createLazyComponent(() => import("./orders-history-tab"), "OrdersHistoryTab");
const OrdersTab = createLazyComponent(() => import("./orders-tab"), "OrdersTab");
const PositionsTab = createLazyComponent(() => import("./positions-tab"), "PositionsTab");
const TwapTab = createLazyComponent(() => import("./twap-tab"), "TwapTab");

interface Props {
	includeTransfers?: boolean;
	autoHeight?: boolean;
}

interface PositionFiltersState {
	ownerKey: string | null;
	direction: PositionDirectionFilter;
	market: PositionMarketFilter;
}

const POSITIONS_TAB_VALUES = new Set<string>(POSITIONS_TABS.map((tab) => tab.value));

export function PositionsPanel({ includeTransfers = false, autoHeight = false }: Props) {
	const { _ } = useLingui();
	useRenderCommitTrack("positions-table");
	const storedActiveTab = usePositionsActiveTab();
	const activeTab = resolvePositionsTab(storedActiveTab, includeTransfers);
	const tabs = includeTransfers ? [...POSITIONS_TABS, PORTFOLIO_TRANSFERS_TAB] : POSITIONS_TABS;
	const { setPositionsActiveTab } = useGlobalSettingsActions();
	const { open: openDepositModal } = useDepositModalActions();
	const [isPending, startTransition] = useTransition();
	const [toolbarTarget, setToolbarTarget] = useState<HTMLDivElement | null>(null);
	const tabScrollRef = useRef<HTMLDivElement>(null);
	const { address, isConnected } = useWalletSession();
	const ownerKey = address?.toLowerCase() ?? null;
	const [positionFilters, setPositionFilters] = useState<PositionFiltersState>({
		ownerKey,
		direction: "all",
		market: ALL_POSITION_MARKETS,
	});
	const positionDirectionFilter = positionFilters.ownerKey === ownerKey ? positionFilters.direction : "all";
	const positionMarketFilter = positionFilters.ownerKey === ownerKey ? positionFilters.market : ALL_POSITION_MARKETS;
	const markets = useMarkets();
	const defaultBalances = useDefaultDexBalances();
	const selectedBalances = useSelectedDexBalances();
	const {
		perpSummary,
		spotBalances,
		hasAllDexsSnapshot,
		hasSpotStateSnapshot,
		hasError: balancesError,
	} = defaultBalances;
	const tokenUsdPrices = useSpotTokenUsdPrices(isConnected);
	const usesSharedQuoteBalance = isQuoteBalanceSharedWithPerps(selectedBalances.accountAbstraction);
	const summaryBalances = usesSharedQuoteBalance ? defaultBalances : selectedBalances;
	const accountEquity = getAccountEquityValue({
		accountAbstraction: selectedBalances.accountAbstraction,
		marginSummary: summaryBalances.marginSummary,
		perpSummary: summaryBalances.perpSummary,
		spotBalances: summaryBalances.spotBalances,
		tokenUsdPrices,
	});
	const riskSummary = getPerpRiskSummaryValue(
		usesSharedQuoteBalance
			? selectedBalances.allDexClearinghouseStates.map(([, state]) => state)
			: [
					{
						marginSummary: summaryBalances.marginSummary,
						crossMaintenanceMarginUsed: summaryBalances.crossMaintenanceMarginUsed,
						assetPositions: summaryBalances.perpPositions,
					},
				],
	);
	const accountAbstraction = selectedBalances.accountAbstraction;
	const accountModeReady = isSupportedAccountAbstraction(accountAbstraction);
	const defaultCollateralToken = markets.getToken(DEFAULT_QUOTE_TOKEN);
	const maintenanceMarginRatio =
		accountAbstraction === "unifiedAccount"
			? getUnifiedAccountMarginRatioValue({
					states: selectedBalances.allDexClearinghouseStates.map(([dex, state]) => ({ dex, ...state })),
					collaterals: [
						...(defaultCollateralToken ? [{ dex: "", token: defaultCollateralToken.index }] : []),
						...markets.builderPerp.flatMap((market) =>
							market.quoteToken ? [{ dex: market.dex, token: market.quoteToken.index }] : [],
						),
					],
					spotBalances: summaryBalances.spotBalances,
				})
			: accountAbstraction === "portfolioMargin"
				? null
				: getToolbarAccountMarginRatio({
						crossMaintenanceMarginUsed: riskSummary.crossMaintenanceMarginUsed,
						accountEquity,
					});
	const accountSummaryReady =
		isConnected &&
		accountModeReady &&
		!summaryBalances.hasError &&
		summaryBalances.hasAllDexsSnapshot &&
		(!usesSharedQuoteBalance || summaryBalances.hasSpotStateSnapshot);
	const { positions, isLoading: positionsLoading, hasError: positionsError } = useUserPositions();
	const { data: selectedMarket } = useSelectedMarketInfo();
	const {
		data: ordersEvent,
		status: ordersStatus,
		isStale: ordersStale,
	} = useSubscription(
		"openOrders",
		{ user: address ?? "0x0", dex: HL_ALL_DEXS },
		{ enabled: isConnected && !!address },
	);
	const {
		data: twapStatesEvent,
		status: twapStatesStatus,
		isStale: twapStatesStale,
	} = useSubscription(
		"twapStates",
		{ user: address ?? "0x0", dex: HL_ALL_DEXS },
		{ enabled: isConnected && !!address },
	);
	const openOrders = ordersEvent?.orders;
	const twapCount = getReadyItemCount({
		isConnected,
		isReady: twapStatesStatus === "active" && !twapStatesStale && twapStatesEvent !== undefined,
		count: twapStatesEvent?.states?.length ?? 0,
	});
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

	function handleTabChange(value: string) {
		startTransition(() => setPositionsActiveTab(value));
	}

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

	const positionsCount = getReadyItemCount({
		isConnected,
		isReady: hasAllDexsSnapshot && !positionsLoading && !positionsError,
		count: positions.length,
	});

	const ordersCount = getReadyItemCount({
		isConnected,
		isReady: ordersStatus === "active" && !ordersStale && ordersEvent !== undefined,
		count: openOrders?.length ?? 0,
	});

	const tabContentClass = cn(tabContentBaseClass, isPending && "opacity-70");
	const showsFundsActions = includeTransfers && activeTab === PORTFOLIO_TRANSFERS_TAB.value;
	const showsPositionToolbar = activeTab === "positions" && positionsCount !== null;
	const hasHeaderActions = showsFundsActions || showsPositionToolbar || CONTEXTUAL_TOOLBAR_TABS.has(activeTab);

	useEffect(() => {
		function revealActiveTab() {
			const activeTabElement = tabScrollRef.current?.querySelector<HTMLElement>(`[data-positions-tab="${activeTab}"]`);
			activeTabElement?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
		}

		revealActiveTab();
		if (!toolbarTarget || typeof ResizeObserver === "undefined") return;

		const observer = new ResizeObserver(revealActiveTab);
		observer.observe(toolbarTarget);
		return () => observer.disconnect();
	}, [activeTab, toolbarTarget]);

	const balancesCount = useMemo(() => {
		if (!isConnected || balancesError || !hasAllDexsSnapshot || !hasSpotStateSnapshot) return null;
		let count = 0;
		const perpAccountValue = toNumberOrZero(perpSummary?.accountValue);
		if (perpAccountValue > 0) count++;
		if (spotBalances.length) {
			for (const b of spotBalances) {
				if (toNumberOrZero(b.total) > 0) count++;
			}
		}
		return count;
	}, [balancesError, hasAllDexsSnapshot, hasSpotStateSnapshot, isConnected, perpSummary?.accountValue, spotBalances]);

	function getTabCount(tabValue: string): number | null {
		if (tabValue === "balances") return balancesCount;
		if (tabValue === "positions") return positionsCount;
		if (tabValue === "orders") return ordersCount;
		if (tabValue === "twap") return twapCount;
		return null;
	}

	return (
		<div className={cn("flex flex-col bg-surface", autoHeight ? "min-h-64" : "h-full overflow-hidden")}>
			<Tabs
				value={activeTab}
				onValueChange={handleTabChange}
				className="flex-1 min-h-0 flex flex-col"
				size="xs"
				variant="underline"
			>
				<div
					data-testid="positions-toolbar-header"
					className="font-market-close flex h-[45px] shrink-0 items-stretch overflow-hidden border-b border-market-close-stroke-card px-5"
				>
					<div
						ref={tabScrollRef}
						className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
					>
						<TabsList
							className="h-full min-w-max gap-0.5 border-b-0"
							indicatorClassName="bg-market-close-fg duration-[120ms] ease-linear"
						>
							{tabs.map((tab) => {
								const count = getTabCount(tab.value);

								return (
									<TabsTrigger
										key={tab.value}
										value={tab.value}
										data-positions-tab={tab.value}
										className="inline-flex h-full items-center gap-1 px-3 py-0 text-[13px] leading-[18px] font-medium whitespace-nowrap text-market-close-subtle transition-colors duration-[120ms] hover:text-market-close-fg focus-visible:outline-market-close-control data-active:font-bold data-active:text-market-close-fg"
									>
										<span>{_(tab.label)}</span>
										{typeof count === "number" ? <span className="tabular-nums">({count})</span> : null}
									</TabsTrigger>
								);
							})}
						</TabsList>
					</div>
					<div
						ref={setToolbarTarget}
						data-testid="positions-header-actions"
						className={cn("flex shrink-0 items-center gap-2", hasHeaderActions && "pl-3")}
					>
						{showsFundsActions ? (
							<>
								<Button
									variant="filled"
									intent="neutral"
									size="xxs"
									onClick={() => openDepositModal("deposit")}
									className="h-[25px] rounded-[7px] bg-market-close-control px-3 text-xs font-semibold text-market-close-on-control shadow-none transition-colors duration-[120ms] hover:opacity-90 active:scale-100"
								>
									<Trans context="Trading toolbar action">Deposit</Trans>
								</Button>
								<Button
									variant="outline"
									intent="neutral"
									size="xxs"
									disabled={!accountModeReady}
									onClick={() => openDepositModal("withdraw")}
									className="h-[27px] rounded-[7px] border-market-close-stroke-input bg-modal px-3 text-xs font-semibold text-market-close-fg shadow-none transition-colors duration-[120ms] hover:border-market-close-control active:scale-100"
								>
									<Trans context="Trading toolbar action">Withdraw</Trans>
								</Button>
							</>
						) : null}
						{showsPositionToolbar ? (
							<PositionFilterToolbar
								direction={positionDirectionFilter}
								market={positionMarketFilter}
								marketOptions={positionMarketOptions}
								onDirectionChange={handlePositionDirectionChange}
								onMarketChange={handlePositionMarketChange}
							/>
						) : null}
					</div>
				</div>
				<TabsContent value="balances" className={tabContentClass}>
					<Suspense fallback={<TabLoadingFallback />}>
						<BalancesTab />
					</Suspense>
				</TabsContent>
				<TabsContent value="positions" className={tabContentClass}>
					<Suspense fallback={<TabLoadingFallback />}>
						<PositionsTab
							directionFilter={positionDirectionFilter}
							marketFilter={positionMarketFilter}
							currentMarket={currentPositionMarket}
							accountSummary={
								accountSummaryReady
									? {
											accountEquity,
											unrealizedPnl: riskSummary.unrealizedPnl,
											maintenanceMarginRatio,
										}
									: null
							}
						/>
					</Suspense>
				</TabsContent>
				<TabsContent value="orders" className={tabContentClass}>
					<Suspense fallback={<TabLoadingFallback />}>
						<OrdersTab toolbarTarget={activeTab === "orders" ? toolbarTarget : null} />
					</Suspense>
				</TabsContent>
				<TabsContent value="twap" className={tabContentClass}>
					<Suspense fallback={<TabLoadingFallback />}>
						<TwapTab />
					</Suspense>
				</TabsContent>
				<TabsContent value="orders-history" className={tabContentClass}>
					<Suspense fallback={<TabLoadingFallback />}>
						<OrdersHistoryTab toolbarTarget={activeTab === "orders-history" ? toolbarTarget : null} />
					</Suspense>
				</TabsContent>
				<TabsContent value="history" className={tabContentClass}>
					<Suspense fallback={<TabLoadingFallback />}>
						<HistoryTab />
					</Suspense>
				</TabsContent>
				<TabsContent value="funding" className={tabContentClass}>
					<Suspense fallback={<TabLoadingFallback />}>
						<FundingTab toolbarTarget={activeTab === "funding" ? toolbarTarget : null} />
					</Suspense>
				</TabsContent>
				{includeTransfers ? (
					<TabsContent value="transfers" className={tabContentClass}>
						<Suspense fallback={<TabLoadingFallback />}>
							<AccountTransfersTab />
						</Suspense>
					</TabsContent>
				) : null}
			</Tabs>
		</div>
	);
}

function resolvePositionsTab(value: string, includeTransfers: boolean): string {
	if (includeTransfers && value === PORTFOLIO_TRANSFERS_TAB.value) return PORTFOLIO_TRANSFERS_TAB.value;
	return POSITIONS_TAB_VALUES.has(value) ? value : "positions";
}

function TabLoadingFallback() {
	return (
		<div className="flex-1 flex items-center justify-center">
			<Spinner className="size-4 text-fg-muted" />
		</div>
	);
}
