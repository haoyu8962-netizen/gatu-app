import { MOBILE_BOTTOM_NAV_HEIGHT_PX } from "@/config/layout";
import { cn } from "@/lib/cn";
import { GeoRestrictionBanner } from "../geo/geo-restriction-banner";
import { MobileAccountView } from "./mobile-account-view";
import { MobileBottomNav } from "./mobile-bottom-nav";
import { MobileHeader } from "./mobile-header";
import { MobileTradeLayout } from "./mobile-trade-layout";
import { OfflineBanner } from "./offline-banner";
import { useMobileTerminalTab } from "./use-mobile-terminal-tab";

interface Props {
	className?: string;
}

export function MobileTerminal({ className }: Props) {
	const { activeTab, setActiveTab } = useMobileTerminalTab();

	return (
		<div
			className={cn(
				"mobile-terminal h-dvh w-full flex flex-col bg-background text-fg font-sans",
				"overflow-hidden",
				className,
			)}
		>
			<MobileHeader />
			<GeoRestrictionBanner />
			<OfflineBanner />
			<main
				className="flex-1 min-h-0 flex flex-col overflow-hidden"
				style={{ paddingBottom: `calc(${MOBILE_BOTTOM_NAV_HEIGHT_PX}px + env(safe-area-inset-bottom))` }}
			>
				<div className="relative flex-1 min-h-0 overflow-hidden">
					<div
						aria-hidden={activeTab !== "markets"}
						className={cn(
							"absolute inset-0 min-h-0 w-full",
							activeTab === "markets" ? "visible z-10 pointer-events-auto" : "invisible z-0 pointer-events-none",
						)}
					>
						<MobileTradeLayout
							active={activeTab === "markets"}
							showMarketBar={activeTab === "markets"}
							showOrderForm={false}
						/>
					</div>
					<div
						aria-hidden={activeTab !== "trade"}
						className={cn(
							"absolute inset-0 min-h-0 w-full",
							activeTab === "trade" ? "visible z-10 pointer-events-auto" : "invisible z-0 pointer-events-none",
						)}
					>
						<MobileTradeLayout active={activeTab === "trade"} showMarketBar={activeTab === "trade"} />
					</div>
					{activeTab === "account" && (
						<div className={cn("absolute inset-0 min-h-0 w-full", "visible z-10 opacity-100 pointer-events-auto")}>
							<MobileAccountView />
						</div>
					)}
				</div>
			</main>
			<MobileBottomNav activeTab={activeTab} onTabChange={setActiveTab} />
		</div>
	);
}
