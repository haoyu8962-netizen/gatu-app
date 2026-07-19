import { Suspense } from "react";
import { APP_HEADER_OFFSET_CLASS, APP_HEADER_PLUS_BANNER_OFFSET_CLASS } from "@/config/layout";
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
	const isMobile = useIsMobile();
	const isTestnet = useIsTestnet();

	return (
		<>
			<div
				className={cn(
					"min-h-dvh bg-background text-fg font-sans",
					!isMobile && "pb-8",
					!isMobile && (isTestnet ? APP_HEADER_PLUS_BANNER_OFFSET_CLASS : APP_HEADER_OFFSET_CLASS),
				)}
			>
				{isMobile ? (
					<MobileHeader />
				) : (
					<>
						<TestnetBanner />
						<TopNav />
					</>
				)}
				<main className={cn("mx-auto max-w-3xl px-5 py-12", isMobile && "py-8")}>
					<article>{renderMarkdown(content)}</article>
				</main>
				{!isMobile && (
					<Suspense fallback={null}>
						<FooterBar />
					</Suspense>
				)}
			</div>
			<Suspense fallback={null}>
				<GlobalModals />
			</Suspense>
		</>
	);
}
