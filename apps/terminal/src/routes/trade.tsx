import { createFileRoute } from "@tanstack/react-router";
import { AppShellSkeleton } from "@/components/trade/layout/app-shell-skeleton";
import { startMarketCatalogBootstrap } from "@/lib/hyperliquid/markets/market-catalog-bootstrap";
import { createLazyComponent } from "@/lib/lazy";

const TradeTerminalPage = createLazyComponent(
	() => import("@/components/trade/trade-terminal-page"),
	"TradeTerminalPage",
);

export const Route = createFileRoute("/trade")({
	ssr: false,
	pendingMinMs: 0,
	pendingComponent: AppShellSkeleton,
	beforeLoad: ({ context }) => {
		void TradeTerminalPage.preload?.();
		startMarketCatalogBootstrap(context.queryClient);
	},
	component: TradeTerminalPage,
});
