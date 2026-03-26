import { Suspense } from "react";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/cn";
import { createLazyComponent } from "@/lib/lazy";
import { useGlobalSettings, useIsTestnet } from "@/stores/use-global-settings-store";
import { FooterBar } from "./footer/footer-bar";
import { TopNav } from "./header/top-nav";
import { MainWorkspace } from "./layout/main-workspace";
import { TestnetBanner } from "./testnet-banner";

const MobileTerminal = createLazyComponent(() => import("./mobile/mobile-terminal"), "MobileTerminal");

const GlobalModals = createLazyComponent(() => import("./components/global-modals"), "GlobalModals");

export function TradeTerminalPage() {
	useDocumentTitle();
	const isMobile = useIsMobile();
	const { showChartScanlines } = useGlobalSettings();
	const isTestnet = useIsTestnet();

	return (
		<>
			{isMobile ? (
				<Suspense fallback={<MobileLoadingFallback />}>
					<MobileTerminal />
				</Suspense>
			) : (
				<div
					className={cn(
						"bg-surface-200 text-fg-950 min-h-screen w-full flex flex-col font-mono pb-6",
						isTestnet ? "pt-[4.75rem]" : "pt-11",
						isTestnet && "testnet-bg",
						showChartScanlines && "terminal-scanlines",
					)}
				>
					<TestnetBanner />
					<TopNav />
					<MainWorkspace />
					<FooterBar />
				</div>
			)}
			<Suspense fallback={null}>
				<GlobalModals />
			</Suspense>
		</>
	);
}

function MobileLoadingFallback() {
	return (
		<div className="h-dvh w-full flex items-center justify-center bg-surface-200 text-fg-950">
			<div className="animate-pulse text-fg-600">Loading...</div>
		</div>
	);
}
