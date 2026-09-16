import { Activity } from "react";
import * as mobileChrome from "@/components/trade/mobile/mobile-chrome-classes";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { cn } from "@/lib/cn";
import { useHyperliquid } from "@/lib/hyperliquid";
import { GeoRestrictionBanner } from "../geo/geo-restriction-banner";
import { MobileAccountView } from "./mobile-account-view";
import { MobileBottomNav } from "./mobile-bottom-nav";
import { MobileHeader } from "./mobile-header";
import { MobileMarketBarProvider } from "./mobile-market-bar-provider";
import { MobileTradeLayout } from "./mobile-trade-layout";
import { OfflineBanner } from "./offline-banner";
import { useMobilePositionsDisclosureStates } from "./use-mobile-disclosure-set";
import { useMobileTerminalTab } from "./use-mobile-terminal-tab";

interface Props {
	className?: string;
	orderEntryDraftReady?: boolean;
}

export function MobileTerminal({ className, orderEntryDraftReady = true }: Props) {
	const { activeTab, setActiveTab } = useMobileTerminalTab();
	const { address, isConnected } = useWalletSession();
	const { env } = useHyperliquid();
	const disclosureIdentity = isConnected && address ? `${env}:${address.toLowerCase()}` : null;
	const disclosureStates = useMobilePositionsDisclosureStates(disclosureIdentity);

	return (
		<div className={cn(mobileChrome.terminal, "overflow-hidden overscroll-none", className)}>
			<MobileHeader />
			<GeoRestrictionBanner />
			<OfflineBanner />
			<MobileMarketBarProvider enabled={activeTab !== "account"}>
				<main className={mobileChrome.workspace}>
					<div className="relative flex-1 min-h-0 overflow-hidden">
						<div
							aria-hidden={activeTab !== "markets"}
							className={cn(
								"absolute inset-0 min-h-0 w-full",
								activeTab === "markets" ? "visible z-10 pointer-events-auto" : "invisible z-0 pointer-events-none",
							)}
						>
							<MobileTradeLayout
								orderEntryDraftReady={orderEntryDraftReady}
								active={activeTab === "markets"}
								showMarketBar={activeTab === "markets"}
								showOrderForm={false}
								disclosureStates={disclosureStates}
							/>
						</div>
						<div
							aria-hidden={activeTab !== "trade"}
							className={cn(
								"absolute inset-0 min-h-0 w-full",
								activeTab === "trade" ? "visible z-10 pointer-events-auto" : "invisible z-0 pointer-events-none",
							)}
						>
							<MobileTradeLayout
								orderEntryDraftReady={orderEntryDraftReady}
								active={activeTab === "trade"}
								showMarketBar={activeTab === "trade"}
								disclosureStates={disclosureStates}
							/>
						</div>
						<Activity key={disclosureIdentity ?? "disconnected"} mode={activeTab === "account" ? "visible" : "hidden"}>
							<div
								aria-hidden={activeTab !== "account"}
								className="absolute inset-0 z-10 min-h-0 w-full pointer-events-auto"
							>
								<MobileAccountView />
							</div>
						</Activity>
					</div>
				</main>
			</MobileMarketBarProvider>
			<MobileBottomNav activeTab={activeTab} onTabChange={setActiveTab} />
		</div>
	);
}
