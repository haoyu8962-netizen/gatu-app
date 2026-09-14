import { Suspense } from "react";
import { APP_HEADER_OFFSET_CLASS, APP_HEADER_PLUS_BANNER_OFFSET_CLASS } from "@/config/layout";
import { cn } from "@/lib/cn";
import { createLazyComponent } from "@/lib/lazy";
import { useIsTestnet } from "@/stores/use-global-settings-store";
import { GeoRestrictionBanner } from "../geo/geo-restriction-banner";
import { preloadTopNav, TopNav } from "../header/top-nav";
import { TestnetBanner } from "../testnet-banner";
import { MainWorkspace, preloadMainWorkspacePanels } from "./main-workspace";
import { TerminalLoadingWorkspace } from "./terminal-loading-workspace";

const FooterBar = createLazyComponent(() => import("../footer/footer-bar"), "FooterBar");

export function preloadDesktopTerminalSurface(): void {
	void FooterBar.preload?.();
	preloadTopNav();
	preloadMainWorkspacePanels();
}

interface Props {
	marketReady: boolean;
	orderEntryDraftReady?: boolean;
}

export function DesktopTerminalSurface({ marketReady, orderEntryDraftReady = true }: Props) {
	const isTestnet = useIsTestnet();
	const mode = marketReady ? "default" : "market-loading";

	return (
		<div
			data-testid="desktop-terminal-surface"
			className={cn(
				"bg-background text-fg min-h-dvh w-full flex flex-col overflow-x-hidden font-sans pb-8",
				isTestnet ? APP_HEADER_PLUS_BANNER_OFFSET_CLASS : APP_HEADER_OFFSET_CLASS,
				isTestnet && "testnet-bg",
			)}
		>
			<TestnetBanner />
			<TopNav mode={mode} />
			<GeoRestrictionBanner />
			{marketReady ? <MainWorkspace orderEntryDraftReady={orderEntryDraftReady} /> : <TerminalLoadingWorkspace />}
			<Suspense fallback={null}>
				<FooterBar mode={mode} />
			</Suspense>
		</div>
	);
}
