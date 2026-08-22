import { Suspense } from "react";
import { TopNav } from "@/components/trade/header/top-nav";
import { MobileHeader } from "@/components/trade/mobile/mobile-header";
import { TestnetBanner } from "@/components/trade/testnet-banner";
import { APP_HEADER_OFFSET_CLASS, APP_HEADER_PLUS_BANNER_OFFSET_CLASS } from "@/config/layout";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/cn";
import { createLazyComponent } from "@/lib/lazy";
import { useIsTestnet } from "@/stores/use-global-settings-store";
import { ApiWalletFixture, getApiWalletFixtureFromLocation } from "./api-wallet-fixture";
import { ApiWalletView } from "./api-wallet-view";
import { useApiWalletController } from "./use-api-wallet-controller";

const FooterBar = createLazyComponent(() => import("../trade/footer/footer-bar"), "FooterBar");
const GlobalModals = createLazyComponent(() => import("../trade/components/global-modals"), "GlobalModals");

export function ApiWalletPage() {
	const isMobile = useIsMobile();
	const isTestnet = useIsTestnet();
	const fixture = getApiWalletFixtureFromLocation();
	const isFixture = fixture !== null;

	return (
		<>
			<div
				className={cn(
					"min-h-dvh bg-grid-container font-market-close text-fg",
					!isMobile && "pb-8",
					!isMobile && !isFixture && (isTestnet ? APP_HEADER_PLUS_BANNER_OFFSET_CLASS : APP_HEADER_OFFSET_CLASS),
					isTestnet && "testnet-bg",
				)}
			>
				{isFixture ? null : isMobile ? (
					<MobileHeader />
				) : (
					<>
						<TestnetBanner />
						<TopNav />
					</>
				)}
				<main className="mx-auto w-full max-w-[var(--api-wallet-frame-max)] py-4 min-[1001px]:px-10 min-[1001px]:py-6">
					{fixture ? <ApiWalletFixture fixture={fixture} /> : <ApiWalletLive />}
				</main>
				{!isFixture && !isMobile ? (
					<Suspense fallback={null}>
						<FooterBar />
					</Suspense>
				) : null}
			</div>
			{isFixture ? null : (
				<Suspense fallback={null}>
					<GlobalModals />
				</Suspense>
			)}
		</>
	);
}

function ApiWalletLive() {
	const controller = useApiWalletController();
	return <ApiWalletView {...controller} />;
}
