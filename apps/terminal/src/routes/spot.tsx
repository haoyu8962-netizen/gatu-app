import { createFileRoute } from "@tanstack/react-router";
import { AppShellSkeleton } from "@/components/trade/layout/app-shell-skeleton";
import { ROUTE_SEO } from "@/config/seo";
import { startMarketCatalogBootstrap } from "@/lib/hyperliquid/markets/market-catalog-bootstrap";
import { createLazyComponent } from "@/lib/lazy";
import { buildPageHead } from "@/lib/seo";

const TradeTerminalPage = createLazyComponent(
	() => import("@/components/trade/trade-terminal-page"),
	"TradeTerminalPage",
);

export const Route = createFileRoute("/spot")({
	ssr: false,
	pendingMinMs: 0,
	pendingComponent: AppShellSkeleton,
	beforeLoad: ({ context }) => {
		void TradeTerminalPage.preload?.();
		startMarketCatalogBootstrap(context.queryClient);
	},
	head: () => buildPageHead(ROUTE_SEO.SPOT),
	component: TradeTerminalPage,
});
