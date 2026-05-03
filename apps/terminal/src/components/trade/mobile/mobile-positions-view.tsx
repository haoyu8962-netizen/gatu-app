import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from "@hypeterminal/ui";
import { WalletIcon } from "@phosphor-icons/react";
import { useState, useTransition } from "react";
import { useConnection } from "wagmi";
import { Spinner } from "@/components/ui/spinner";
import { HL_ALL_DEXS } from "@/config/app";
import { MOBILE_POSITIONS_TABS, type MobilePositionsTabValue } from "@/config/trade";
import { cn } from "@/lib/cn";
import { useSubscription, useUserPositions } from "@/lib/hyperliquid";
import { toNumber } from "@/lib/trade/numbers";
import { useGlobalSettingsActions, usePositionsActiveTab } from "@/stores/use-global-settings-store";
import { WalletModal } from "../components/wallet-modal";
import { MobileBalancesTab } from "./mobile-balances-tab";
import { MobileBottomNavSpacer } from "./mobile-bottom-nav";
import { MobileFundingTab } from "./mobile-funding-tab";
import { MobileHistoryTab } from "./mobile-history-tab";
import { MobileOrdersHistoryTab } from "./mobile-orders-history-tab";
import { MobileOrdersTab } from "./mobile-orders-tab";
import { MobilePositionsTab } from "./mobile-positions-tab";
import { MobileTwapTab } from "./mobile-twap-tab";

type TabValue = MobilePositionsTabValue;

interface Props {
	className?: string;
}

export function MobilePositionsView({ className }: Props) {
	const activeTab = usePositionsActiveTab() as TabValue;
	const { setPositionsActiveTab } = useGlobalSettingsActions();
	const [isPending, startTransition] = useTransition();
	const { address, isConnected } = useConnection();
	const { positions, isLoading: isLoadingState } = useUserPositions();

	const { data: ordersEvent, status: ordersStatus } = useSubscription(
		"openOrders",
		{ user: address ?? "0x0", dex: HL_ALL_DEXS },
		{ enabled: isConnected && !!address },
	);
	const openOrders = ordersEvent?.orders;
	const isLoadingOrders = ordersStatus === "subscribing" || ordersStatus === "idle";

	const positionsCount = isConnected
		? positions.reduce((count, entry) => {
				const size = toNumber(entry.szi);
				return size ? count + 1 : count;
			}, 0)
		: 0;

	const ordersCount = isConnected ? (openOrders?.length ?? 0) : 0;

	function handleTabChange(value: string) {
		startTransition(() => setPositionsActiveTab(value));
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
				<div className="shrink-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
					<TabsList className="px-3 min-w-max">
						{MOBILE_POSITIONS_TABS.map((tab) => {
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
				<div className="flex-1 min-h-0 overflow-y-auto">
					{!isConnected ? (
						<EmptyState />
					) : (
						<>
							<TabsContent value="positions" className={tabContentClass}>
								<MobilePositionsTab />
							</TabsContent>
							<TabsContent value="orders" className={tabContentClass}>
								<MobileOrdersTab />
							</TabsContent>
							<TabsContent value="balances" className={tabContentClass}>
								<MobileBalancesTab />
							</TabsContent>
							<TabsContent value="twap" className={tabContentClass}>
								<MobileTwapTab />
							</TabsContent>
							<TabsContent value="history" className={tabContentClass}>
								<MobileHistoryTab />
							</TabsContent>
							<TabsContent value="orders-history" className={tabContentClass}>
								<MobileOrdersHistoryTab />
							</TabsContent>
							<TabsContent value="funding" className={tabContentClass}>
								<MobileFundingTab />
							</TabsContent>
						</>
					)}
					<MobileBottomNavSpacer />
				</div>
			</Tabs>
		</div>
	);
}

function EmptyState() {
	const [walletModalOpen, setWalletModalOpen] = useState(false);

	return (
		<>
			<div className="h-full flex flex-col items-center justify-center gap-4 p-6 text-center">
				<div className="size-16 rounded-full flex items-center justify-center bg-surface">
					<WalletIcon className="size-8 text-fg-muted" />
				</div>
				<p className="text-sm text-fg-muted max-w-xs text-pretty">Connect wallet to view positions</p>
				<Button variant="outline" intent="brand" size="sm" onClick={() => setWalletModalOpen(true)}>
					Connect Wallet
				</Button>
			</div>
			<WalletModal open={walletModalOpen} onOpenChange={setWalletModalOpen} />
		</>
	);
}
