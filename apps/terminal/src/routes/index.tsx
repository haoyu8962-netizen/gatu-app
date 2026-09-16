import { createFileRoute, redirect } from "@tanstack/react-router";
import { StartupFallback } from "@/components/startup-fallback";
import { ROUTE_SEO } from "@/config/seo";
import { getTradePathForMarketName } from "@/lib/hyperliquid/market-route";
import { startMarketCatalogBootstrap } from "@/lib/hyperliquid/markets/market-catalog-bootstrap";
import { buildPageHead } from "@/lib/seo";
import { getTradeHomeMarketName } from "@/stores/use-market-store";

export const Route = createFileRoute("/")({
	ssr: false,
	pendingMinMs: 0,
	pendingComponent: StartupFallback,
	beforeLoad: ({ context }) => {
		startMarketCatalogBootstrap(context.queryClient);
		throw redirect({
			to: getTradePathForMarketName(getTradeHomeMarketName()),
			search: { scope: "all" },
			replace: true,
			headers: { "cache-control": "no-store" },
		});
	},
	head: () => buildPageHead(ROUTE_SEO.TRADE),
});
