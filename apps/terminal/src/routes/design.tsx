import { createFileRoute } from "@tanstack/react-router";
import { MarketOverviewVariantsDemo } from "@/components/trade/layout/market-overview-variants-demo";
import { buildPageHead } from "@/lib/seo";

export const Route = createFileRoute("/design")({
	ssr: false,
	head: () =>
		buildPageHead({
			title: "Design — market stats row",
			description: "Compare layout options for the market overview strip.",
			path: "/design",
		}),
	component: function DesignRoute() {
		return <MarketOverviewVariantsDemo />;
	},
});
