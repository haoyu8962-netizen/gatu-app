import { Button, Tabs, TabsContent, TabsList, TabsTrigger, Tooltip } from "@gatu/ui";
import { useLingui } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import { Suspense, useEffect, useId, useMemo, useRef, useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { PORTFOLIO_TRANSFERS_TAB } from "@/config/account-ledger";
import { HL_ALL_DEXS } from "@/config/app";
import { POSITIONS_TABS } from "@/config/trade";
import {
	ALL_POSITION_MARKETS,
	getReadyItemCount,
	type PositionDirectionFilter,
	type PositionMarketFilter,
	type PositionMarketIdentity,
} from "@/domain/trade/position-toolbar";
import { useAccountOverview } from "@/hooks/trade/use-account-overview";
import { useDepositAvailability } from "@/hooks/trade/use-deposit-availability";
import { useFundsActionAvailability } from "@/hooks/trade/use-funds-action-availability";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { cn } from "@/lib/cn";
import { useMarkets, useSelectedMarketInfo, useSubscription, useUserPositions } from "@/lib/hyperliquid";
import { createLazyComponent, preloadLazyComponents } from "@/lib/lazy";
import { useRenderCommitTrack } from "@/lib/performance/render-profile";
import { toNumberOrZero } from "@/lib/trade/numbers";
import { useDepositModalActions } from "@/stores/use-global-modal-store";
import {
	getPositionsActiveTab,
	useGlobalSettingsActions,
	usePositionsActiveTab,
} from "@/stores/use-global-settings-store";
import {
	ACCOUNT_TAB_COUNT_CLASS,
	ACCOUNT_TAB_INDICATOR_CLASS,
	ACCOUNT_TAB_LIST_CLASS,
	ACCOUNT_TAB_TRIGGER_CLASS,
	ACCOUNT_TABLE_AUTO_HEIGHT_CLASS,
	ACCOUNT_TABLE_FIXED_CLASS,
	ACCOUNT_TABLE_PANEL_CLASS,
	ACCOUNT_TABLE_TABS_CLASS,
	AccountTableHeaderView,
} from "./account-table-header-view";
import { PositionFilterToolbar } from "./position-filter-toolbar";
import type { PositionMarketOption } from "./position-market-filter";

const tabContentBaseClass = "mt-0 flex min-h-0 flex-1 flex-col pt-0";
const CONTEXTUAL_TOOLBAR_TABS = new Set(["balances", "orders", "funding", "orders-history"]);
const COUNTED_POSITION_TABS = new Set(["balances", "positions", "orders", "twap"]);

const BalancesTab = createLazyComponent(() => import("./balances-tab"), "BalancesTab");
const AccountTransfersTab = createLazyComponent(() => import("./account-transfers-tab"), "AccountTransfersTab");
const FundingTab = createLazyComponent(() => import("./funding-tab"), "FundingTab");
const HistoryTab = createLazyComponent(() => import("./history-tab"), "HistoryTab");
const OrdersHistoryTab = createLazyComponent(() => import("./orders-history-tab"), "OrdersHistoryTab");
const OrdersTab = createLazyComponent(() => import("./orders-tab"), "OrdersTab");
const PositionsTab = createLazyComponent(() => import("./positions-tab"), "PositionsTab");
const TwapTab = createLazyComponent(() => import("./twap-tab"), "TwapTab");

const TAB_COMPONENTS = {
	balances: BalancesTab,
	positions: PositionsTab,
	orders: OrdersTab,
	twap: TwapTab,
	history: HistoryTab,
	funding: FundingTab,
	"orders-history": OrdersHistoryTab,
} as const;

export function preloadPositionsPanel(): Promise<void> {
	const restoredTab = resolvePositionsTab(getPositionsActiveTab(), false);
	const restored = TAB_COMPONENTS[restoredTab as keyof typeof TAB_COMPONENTS] ?? PositionsTab;
	return preloadLazyComponents(restored === PositionsTab ? [PositionsTab] : [PositionsTab, restored]);
}

const HISTORY_TAB_PRELOADERS: Readonly<Record<string, () => void>> = {
	funding: () => void FundingTab.preload?.(),
	history: () => void HistoryTab.preload?.(),
	"orders-history": () => void OrdersHistoryTab.preload?.(),
};

function preloadHistoryTab(value: string) {
	HISTORY_TAB_PRELOADERS[value]?.();
}

function preloadHistoryTabs() {
	for (const preload of Object.values(HISTORY_TAB_PRELOADERS)) preload();
}

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
	const withdrawUnavailableId = useId();
	useRenderCommitTrack("positions-table");
	const storedActiveTab = usePositionsActiveTab();
	const activeTab = resolvePositionsTab(storedActiveTab, includeTransfers);
	const tabs = includeTransfers ? [...POSITIONS_TABS, PORTFOLIO_TRANSFERS_TAB] : POSITIONS_TABS;
	const { setPositionsActiveTab } = useGlobalSettingsActions();
	const { open: openDepositModal } = useDepositModalActions();
	const depositAvailability = useDepositAvailability();
	const [toolbarTarget, setToolbarTarget] = useState<HTMLDivElement | null>(null);
	const tabScrollRef = useRef<HTMLDivElement>(null);
	const { address, hasWalletAccess, isConnected } = useWalletSession();
	const ownerKey = address?.toLowerCase() ?? null;
	const [positionFilters, setPositionFilters] = useState<PositionFiltersState>({
		ownerKey,
		direction: "all",
		market: ALL_POSITION_MARKETS,
	});
	const positionDirectionFilter = positionFilters.ownerKey === ownerKey ? positionFilters.direction : "all";
	const positionMarketFilter = positionFilters.ownerKey === ownerKey ? positionFilters.market : ALL_POSITION_MARKETS;
	const markets = useMarkets();
	const { accountAbstraction, defaultBalances, fundsActionsReady } = useAccountOverview();
	const fundsActionAvailability = useFundsActionAvailability({
		accountDataReady: fundsActionsReady,
		accountAbstraction,
		fundsActionsEnabled: true,
		hasWalletAccess,
		internalTransfersEnabled: false,
	});
	const {
		perpSummary,
		spotBalances,
		hasAllDexsSnapshot,
		hasSpotStateSnapshot,
		hasError: balancesError,
	} = defaultBalances;
	const withdrawDisabledReason = fundsActionAvailability.withdrawal.unavailableReason;
	const {
		positions,
		isLoading: positionsLoading,
		hasError: positionsError,
		isStale: positionsStale,
	} = useUserPositions();
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
		preloadHistoryTab(value);
		setPositionsActiveTab(value);
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
		isReady: hasAllDexsSnapshot && !positionsLoading && !positionsError && !positionsStale,
		count: positions.length,
	});

	const ordersCount = getReadyItemCount({
		isConnected,
		isReady: ordersStatus === "active" && !ordersStale && ordersEvent !== undefined,
		count: openOrders?.length ?? 0,
	});
	const showsFundsActions = includeTransfers && activeTab === PORTFOLIO_TRANSFERS_TAB.value;
	const showsPositionToolbar = activeTab === "positions" && positionsCount !== null;
	const hasHeaderActions = showsFundsActions || showsPositionToolbar || CONTEXTUAL_TOOLBAR_TABS.has(activeTab);

	useEffect(() => {
		if (typeof window === "undefined") return;

		const browserWindow = window;
		if (browserWindow.requestIdleCallback) {
			const idleId = browserWindow.requestIdleCallback(preloadHistoryTabs, { timeout: 2_000 });
			return () => browserWindow.cancelIdleCallback(idleId);
		}

		const timeoutId = browserWindow.setTimeout(preloadHistoryTabs, 1_000);
		return () => browserWindow.clearTimeout(timeoutId);
	}, []);

	useEffect(() => {
		const scroller = tabScrollRef.current;
		if (!scroller) return;
		const scrollContainer: HTMLDivElement = scroller;

		function revealActiveTab() {
			const activeTabElement = scrollContainer.querySelector<HTMLElement>(`[data-positions-tab="${activeTab}"]`);
			if (!activeTabElement) return;

			const scrollerRect = scrollContainer.getBoundingClientRect();
			const activeTabRect = activeTabElement.getBoundingClientRect();
			let horizontalDelta = 0;
			if (activeTabRect.left < scrollerRect.left) horizontalDelta = activeTabRect.left - scrollerRect.left;
			else if (activeTabRect.right > scrollerRect.right) horizontalDelta = activeTabRect.right - scrollerRect.right;
			if (horizontalDelta === 0) return;

			if (typeof scrollContainer.scrollBy === "function") {
				scrollContainer.scrollBy({ behavior: "auto", left: horizontalDelta, top: 0 });
			} else {
				scrollContainer.scrollLeft += horizontalDelta;
			}
		}

		revealActiveTab();
		if (typeof ResizeObserver === "undefined") return;

		const observer = new ResizeObserver(revealActiveTab);
		observer.observe(scrollContainer);
		if (toolbarTarget) observer.observe(toolbarTarget);
		for (const tab of scrollContainer.querySelectorAll<HTMLElement>("[data-positions-tab]")) observer.observe(tab);
		return () => observer.disconnect();
	}, [activeTab, toolbarTarget]);

	const balancesCount = useMemo(() => {
		if (
			!isConnected ||
			balancesError ||
			defaultBalances.isDataStale ||
			defaultBalances.perpStateStatus !== "success" ||
			defaultBalances.spotStateStatus !== "success" ||
			!hasAllDexsSnapshot ||
			!hasSpotStateSnapshot
		)
			return null;
		let count = 0;
		const perpAccountValue = toNumberOrZero(perpSummary?.accountValue);
		if (perpAccountValue > 0) count++;
		if (spotBalances.length) {
			for (const b of spotBalances) {
				if (toNumberOrZero(b.total) > 0) count++;
			}
		}
		return count;
	}, [
		balancesError,
		defaultBalances.isDataStale,
		defaultBalances.perpStateStatus,
		defaultBalances.spotStateStatus,
		hasAllDexsSnapshot,
		hasSpotStateSnapshot,
		isConnected,
		perpSummary?.accountValue,
		spotBalances,
	]);

	function getTabCount(tabValue: string): number | null {
		if (tabValue === "balances") return balancesCount;
		if (tabValue === "positions") return positionsCount;
		if (tabValue === "orders") return ordersCount;
		if (tabValue === "twap") return twapCount;
		return null;
	}

	return (
		<div
			className={cn(
				ACCOUNT_TABLE_PANEL_CLASS,
				autoHeight ? ACCOUNT_TABLE_AUTO_HEIGHT_CLASS : ACCOUNT_TABLE_FIXED_CLASS,
			)}
		>
			<Tabs
				value={activeTab}
				onValueChange={handleTabChange}
				className={ACCOUNT_TABLE_TABS_CLASS}
				size="xs"
				variant="underline"
			>
				<AccountTableHeaderView
					scrollRef={tabScrollRef}
					actionsRef={setToolbarTarget}
					hasActions={hasHeaderActions}
					tabs={
						<TabsList className={ACCOUNT_TAB_LIST_CLASS} indicatorClassName={ACCOUNT_TAB_INDICATOR_CLASS}>
							{tabs.map((tab) => {
								const count = getTabCount(tab.value);
								const showCountSlot = isConnected && COUNTED_POSITION_TABS.has(tab.value);

								return (
									<TabsTrigger
										key={tab.value}
										value={tab.value}
										data-positions-tab={tab.value}
										onPointerEnter={() => preloadHistoryTab(tab.value)}
										onPointerDown={() => preloadHistoryTab(tab.value)}
										onFocus={() => preloadHistoryTab(tab.value)}
										className={ACCOUNT_TAB_TRIGGER_CLASS}
									>
										<span>{_(tab.label)}</span>
										{showCountSlot ? (
											<span data-position-tab-count={tab.value} className={ACCOUNT_TAB_COUNT_CLASS}>
												{typeof count === "number" ? `(${count})` : null}
											</span>
										) : null}
									</TabsTrigger>
								);
							})}
						</TabsList>
					}
					actions={
						<>
							{showsFundsActions ? (
								<>
									<Tooltip content={depositAvailability.unavailableReason} side="top">
										<span className="inline-flex">
											<Button
												variant="filled"
												intent="neutral"
												size="xxs"
												disabled={!depositAvailability.available}
												onClick={depositAvailability.available ? () => openDepositModal("deposit") : undefined}
												aria-label={depositAvailability.available ? undefined : depositAvailability.unavailableLabel}
												title={depositAvailability.unavailableReason ?? undefined}
												className="h-[25px] rounded-[7px] bg-market-close-control px-3 text-xs font-semibold text-market-close-on-control shadow-none transition-colors duration-[120ms] hover:opacity-90 active:scale-100"
											>
												<Trans context="Trading toolbar action">Deposit</Trans>
											</Button>
										</span>
									</Tooltip>
									{withdrawDisabledReason ? (
										<span id={withdrawUnavailableId} className="sr-only">
											{withdrawDisabledReason}
										</span>
									) : null}
									<Tooltip content={withdrawDisabledReason} side="top">
										<span className="inline-flex">
											<Button
												variant="outline"
												intent="neutral"
												size="xxs"
												disabled={!!withdrawDisabledReason}
												focusableWhenDisabled
												aria-describedby={withdrawDisabledReason ? withdrawUnavailableId : undefined}
												onClick={
													fundsActionAvailability.withdrawal.available ? () => openDepositModal("withdraw") : undefined
												}
												className="h-[27px] rounded-[7px] border-market-close-stroke-input bg-surface px-3 text-xs font-semibold text-market-close-fg shadow-none transition-colors duration-[120ms] hover:border-market-close-control active:scale-100"
											>
												<Trans context="Trading toolbar action">Withdraw</Trans>
											</Button>
										</span>
									</Tooltip>
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
						</>
					}
				/>
				<TabsContent value="balances" className={tabContentBaseClass}>
					<Suspense fallback={<TabLoadingFallback />}>
						<BalancesTab toolbarTarget={activeTab === "balances" ? toolbarTarget : null} />
					</Suspense>
				</TabsContent>
				<TabsContent value="positions" className={tabContentBaseClass}>
					<Suspense fallback={<TabLoadingFallback />}>
						<PositionsTab
							directionFilter={positionDirectionFilter}
							marketFilter={positionMarketFilter}
							currentMarket={currentPositionMarket}
						/>
					</Suspense>
				</TabsContent>
				<TabsContent value="orders" className={tabContentBaseClass}>
					<Suspense fallback={<TabLoadingFallback />}>
						<OrdersTab toolbarTarget={activeTab === "orders" ? toolbarTarget : null} />
					</Suspense>
				</TabsContent>
				<TabsContent value="twap" className={tabContentBaseClass}>
					<Suspense fallback={<TabLoadingFallback />}>
						<TwapTab />
					</Suspense>
				</TabsContent>
				<TabsContent value="orders-history" className={tabContentBaseClass}>
					<Suspense fallback={<TabLoadingFallback />}>
						<OrdersHistoryTab toolbarTarget={activeTab === "orders-history" ? toolbarTarget : null} />
					</Suspense>
				</TabsContent>
				<TabsContent value="history" className={tabContentBaseClass}>
					<Suspense fallback={<TabLoadingFallback />}>
						<HistoryTab />
					</Suspense>
				</TabsContent>
				<TabsContent value="funding" className={tabContentBaseClass}>
					<Suspense fallback={<TabLoadingFallback />}>
						<FundingTab toolbarTarget={activeTab === "funding" ? toolbarTarget : null} />
					</Suspense>
				</TabsContent>
				{includeTransfers ? (
					<TabsContent value="transfers" className={tabContentBaseClass}>
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
