import { cn } from "@/lib/cn";
import { useGlobalSettingsActions, useMobileActiveTab } from "@/stores/use-global-settings-store";
import { GeoRestrictionBanner } from "../geo/geo-restriction-banner";
import { MobileAccountView } from "./mobile-account-view";
import { MobileBottomNav, type MobileTab } from "./mobile-bottom-nav";
import { MobileHeader } from "./mobile-header";
import { MobileTradeLayout } from "./mobile-trade-layout";
import { OfflineBanner } from "./offline-banner";

interface Props {
	className?: string;
}

export function MobileTerminal({ className }: Props) {
	const rawTab = useMobileActiveTab();
	const activeTab: MobileTab = rawTab === "markets" || rawTab === "trade" || rawTab === "account" ? rawTab : "trade";
	const { setMobileActiveTab } = useGlobalSettingsActions();

	return (
		<div className={cn("h-dvh w-full flex flex-col bg-background text-fg font-sans", "overflow-hidden", className)}>
			<MobileHeader />
			<GeoRestrictionBanner />
			<OfflineBanner />
			<main className="flex-1 min-h-0 flex flex-col overflow-hidden">
				{activeTab === "markets" && <MobileTradeLayout showOrderForm={false} />}
				{activeTab === "trade" && <MobileTradeLayout />}
				{activeTab === "account" && <MobileAccountView />}
			</main>
			<MobileBottomNav activeTab={activeTab} onTabChange={setMobileActiveTab} />
		</div>
	);
}
