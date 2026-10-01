import { Suspense } from "react";
import { BRAND_NAME } from "@/config/brand";
import { createLazyComponent, preloadLazyComponents } from "@/lib/lazy";
import { useIsTestnet } from "@/stores/use-global-settings-store";
import { GeoRestrictionBanner } from "../geo/geo-restriction-banner";
import { preloadTopNav, TopNav } from "../header/top-nav";
import { TestnetBanner } from "../testnet-banner";
import { DesktopTerminalFrameView } from "./desktop-terminal-frame-view";
import { MainWorkspace, preloadMainWorkspacePanels } from "./main-workspace";

const FooterBar = createLazyComponent(() => import("../footer/footer-bar"), "FooterBar");

export function preloadDesktopTerminalSurface(): Promise<void> {
	return Promise.all([preloadLazyComponents([FooterBar]), preloadTopNav(), preloadMainWorkspacePanels()]).then(
		() => undefined,
	);
}

interface Props {
	marketReady: boolean;
	orderEntryDraftReady?: boolean;
}

export function DesktopTerminalSurface({ marketReady, orderEntryDraftReady = true }: Props) {
	const isTestnet = useIsTestnet();
	const mode = marketReady ? "default" : "market-loading";

	return (
		<DesktopTerminalFrameView
			data-testid="desktop-terminal-surface"
			bannerOffset={isTestnet}
			banner={<TestnetBanner />}
			header={<TopNav mode={mode} />}
			notice={<GeoRestrictionBanner />}
			workspace={
				marketReady ? (
					<MainWorkspace orderEntryDraftReady={orderEntryDraftReady} />
				) : (
					<main className="min-h-0 flex-1 bg-grid-container" aria-busy="true">
						<output className="sr-only">{`Loading ${BRAND_NAME}...`}</output>
					</main>
				)
			}
			footer={
				<Suspense fallback={null}>
					<FooterBar mode={mode} />
				</Suspense>
			}
		/>
	);
}
