import { createFileRoute } from "@tanstack/react-router";
import { FundingComparisonPage } from "@/components/funding-comparison/funding-comparison-page";
import { bootDashboardRoute } from "@/lib/navigation/boot-dashboard-route";
import { buildPageHead } from "@/lib/seo";

export const Route = createFileRoute("/fundingComparison")({
	beforeLoad: () => bootDashboardRoute(),
	ssr: false,
	head: () =>
		buildPageHead({
			title: "Funding Comparison",
			description: "Compare predicted Hyperliquid, Binance and Bybit funding rates for Hyperliquid main perp markets.",
			path: "/fundingComparison",
		}),
	component: FundingComparisonRoute,
});

function FundingComparisonRoute() {
	return <FundingComparisonPage />;
}
