import { createFileRoute, redirect } from "@tanstack/react-router";
import { AppShellSkeleton } from "@/components/trade/layout/app-shell-skeleton";
import { ROUTE_SEO } from "@/config/seo";
import { getTradePathForMarketName } from "@/lib/hyperliquid/market-route";
import { buildPageHead } from "@/lib/seo";
import { getTradeHomeMarketName } from "@/stores/use-market-store";

export const Route = createFileRoute("/")({
	ssr: false,
	pendingMinMs: 0,
	pendingComponent: AppShellSkeleton,
	beforeLoad: () => {
		throw redirect({
			to: getTradePathForMarketName(getTradeHomeMarketName()),
			search: { scope: "all" },
			replace: true,
		});
	},
	head: () => buildPageHead(ROUTE_SEO.TRADE),
});
