import { WalletIcon } from "@phosphor-icons/react";
import { Suspense, useState, useTransition } from "react";
import { useConnection } from "wagmi";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAccountBalances } from "@/hooks/trade/use-account-balances";
import { cn } from "@/lib/cn";
import { useSubOpenOrders } from "@/lib/hyperliquid/hooks/subscription";
import { createLazyComponent } from "@/lib/lazy";
import { toNumber } from "@/lib/trade/numbers";

const BalancesTab = createLazyComponent(() => import("../positions/balances-tab"), "BalancesTab");
const FundingTab = createLazyComponent(() => import("../positions/funding-tab"), "FundingTab");
const HistoryTab = createLazyComponent(() => import("../positions/history-tab"), "HistoryTab");
const OrdersHistoryTab = createLazyComponent(() => import("../positions/orders-history-tab"), "OrdersHistoryTab");
const OrdersTab = createLazyComponent(() => import("../positions/orders-tab"), "OrdersTab");
const PositionsTab = createLazyComponent(() => import("../positions/positions-tab"), "PositionsTab");
const TwapTab = createLazyComponent(() => import("../positions/twap-tab"), "TwapTab");

const MOBILE_TABS = [
	{ value: "positions", label: "Positions" },
	{ value: "orders", label: "Open Orders" },
	{ value: "balances", label: "Balances" },
	{ value: "twap", label: "TWAP" },
	{ value: "history", label: "Trade History" },
	{ value: "orders-history", label: "Order History" },
	{ value: "funding", label: "Funding History" },
] as const;

type TabValue = (typeof MOBILE_TABS)[number]["value"];

interface Props {
	className?: string;
}

export function MobilePositionsView({ className }: Props) {
	const [activeTab, setActiveTab] = useState<TabValue>("positions");
	const [isPending, startTransition] = useTransition();
	const { address, isConnected } = useConnection();
	const { perpPositions, isLoading: isLoadingState } = useAccountBalances();

	const { data: ordersEvent, status: ordersStatus } = useSubOpenOrders(
		{ user: address ?? "0x0" },
		{ enabled: isConnected && !!address },
	);
	const openOrders = ordersEvent?.orders;
	const isLoadingOrders = ordersStatus === "subscribing" || ordersStatus === "idle";

	const positionsCount = isConnected
		? perpPositions.reduce((count, entry) => {
				const size = toNumber(entry.position.szi);
				return size ? count + 1 : count;
			}, 0)
		: 0;

	const ordersCount = isConnected ? (openOrders?.length ?? 0) : 0;

	function handleTabChange(value: string) {
		startTransition(() => setActiveTab(value as TabValue));
	}

	function getTabCount(tabValue: TabValue): number | null {
		if (tabValue === "positions") return positionsCount;
		if (tabValue === "orders") return ordersCount;
		return null;
	}

	function isTabLoading(tabValue: TabValue): boolean {
		if (!isConnected) return false;
		if (tabValue === "positions") return isLoadingState;
		if (tabValue === "orders") return isLoadingOrders;
		return false;
	}

	const tabContentClass = cn("flex-1 min-h-0 flex flex-col mt-0", isPending && "opacity-70");

	return (
		<div className={cn("flex-1 min-h-0 flex flex-col", className)}>
			<Tabs value={activeTab} onValueChange={handleTabChange} className="flex-1 min-h-0 flex flex-col">
				<div className="shrink-0 overflow-x-auto border-b border-border-200/60">
					<TabsList variant="underline" className="px-3 min-w-max">
						{MOBILE_TABS.map((tab) => {
							const count = getTabCount(tab.value);
							const loading = isTabLoading(tab.value);

							return (
								<TabsTrigger key={tab.value} value={tab.value} className="inline-flex items-center gap-1">
									<span>{tab.label}</span>
									{loading ? (
										<Spinner className="size-3" />
									) : typeof count === "number" && count > 0 ? (
										<span>({count})</span>
									) : null}
								</TabsTrigger>
							);
						})}
					</TabsList>
				</div>
				<div className="flex-1 min-h-0 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
					{!isConnected ? (
						<EmptyState />
					) : (
						<>
							<TabsContent value="positions" className={tabContentClass}>
								<Suspense fallback={<TabLoadingFallback />}>
									<PositionsTab />
								</Suspense>
							</TabsContent>
							<TabsContent value="orders" className={tabContentClass}>
								<Suspense fallback={<TabLoadingFallback />}>
									<OrdersTab />
								</Suspense>
							</TabsContent>
							<TabsContent value="balances" className={tabContentClass}>
								<Suspense fallback={<TabLoadingFallback />}>
									<BalancesTab />
								</Suspense>
							</TabsContent>
							<TabsContent value="twap" className={tabContentClass}>
								<Suspense fallback={<TabLoadingFallback />}>
									<TwapTab />
								</Suspense>
							</TabsContent>
							<TabsContent value="history" className={tabContentClass}>
								<Suspense fallback={<TabLoadingFallback />}>
									<HistoryTab />
								</Suspense>
							</TabsContent>
							<TabsContent value="orders-history" className={tabContentClass}>
								<Suspense fallback={<TabLoadingFallback />}>
									<OrdersHistoryTab />
								</Suspense>
							</TabsContent>
							<TabsContent value="funding" className={tabContentClass}>
								<Suspense fallback={<TabLoadingFallback />}>
									<FundingTab />
								</Suspense>
							</TabsContent>
						</>
					)}
				</div>
			</Tabs>
		</div>
	);
}

function TabLoadingFallback() {
	return (
		<div className="flex-1 flex items-center justify-center">
			<Spinner className="size-4 text-text-600" />
		</div>
	);
}

function EmptyState() {
	return (
		<div className="h-full flex flex-col items-center justify-center gap-4 p-6 text-center">
			<div className="size-16 rounded-full flex items-center justify-center bg-surface-analysis">
				<WalletIcon className="size-8 text-text-600" />
			</div>
			<p className="text-sm text-text-600 max-w-xs">Connect wallet to view positions</p>
		</div>
	);
}
