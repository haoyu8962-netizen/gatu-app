import { ClientOnly } from "@tanstack/react-router";
import { Suspense } from "react";
import { APP_HEADER_HEIGHT_CLASS } from "@/config/layout";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/cn";
import { createLazyComponent } from "@/lib/lazy";
import { renderMarkdown } from "@/lib/markdown";
import { useIsTestnet } from "@/stores/use-global-settings-store";
import { TopNav } from "../trade/header/top-nav";
import { MobileHeader } from "../trade/mobile/mobile-header";
import { TestnetBanner } from "../trade/testnet-banner";

const FooterBar = createLazyComponent(() => import("../trade/footer/footer-bar"), "FooterBar");
const GlobalModals = createLazyComponent(() => import("../trade/components/global-modals"), "GlobalModals");

interface Props {
	content: string;
}

export function LegalDocPage({ content }: Props) {
	return (
		<div className="min-h-dvh bg-background text-fg font-sans min-[1001px]:pb-8">
			<ClientOnly fallback={<div className={APP_HEADER_HEIGHT_CLASS} aria-hidden />}>
				<LegalNavigation />
			</ClientOnly>
			<main className="mx-auto max-w-3xl px-5 py-8 min-[1001px]:py-12">
				<article>{renderMarkdown(content)}</article>
			</main>
			<ClientOnly>
				<LegalClientOverlays />
			</ClientOnly>
		</div>
	);
}

function LegalNavigation() {
	const isMobile = useIsMobile();
	const isTestnet = useIsTestnet();

	if (isMobile) return <MobileHeader />;

	return (
		<>
			<TestnetBanner />
			<TopNav />
			<div className={cn(isTestnet ? "h-[5.5rem]" : APP_HEADER_HEIGHT_CLASS)} aria-hidden />
		</>
	);
}

function LegalClientOverlays() {
	const isMobile = useIsMobile();

	return (
		<>
			{!isMobile && (
				<Suspense fallback={null}>
					<FooterBar />
				</Suspense>
			)}
			<Suspense fallback={null}>
				<GlobalModals />
			</Suspense>
		</>
	);
}
