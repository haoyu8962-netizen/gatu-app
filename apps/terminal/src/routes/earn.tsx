import { createFileRoute } from "@tanstack/react-router";
import { EarnPage } from "@/components/earn/earn-page";
import { bootDashboardRoute } from "@/lib/navigation/boot-dashboard-route";
import { buildPageHead } from "@/lib/seo";

export const Route = createFileRoute("/earn")({
	beforeLoad: () => bootDashboardRoute(),
	ssr: false,
	head: () =>
		buildPageHead({
			title: "Earn",
			description: "Supply, withdraw, borrow and repay on Hyperliquid's borrow and lend reserves.",
			path: "/earn",
		}),
	component: EarnRoute,
});

function EarnRoute() {
	return <EarnPage />;
}
