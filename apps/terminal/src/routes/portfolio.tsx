import { createFileRoute } from "@tanstack/react-router";
import { PortfolioPage } from "@/components/portfolio/portfolio-page";
import { bootDashboardRoute } from "@/lib/navigation/boot-dashboard-route";
import { buildPageHead } from "@/lib/seo";

export const Route = createFileRoute("/portfolio")({
	beforeLoad: () => bootDashboardRoute(),
	ssr: false,
	head: () =>
		buildPageHead({
			title: "Portfolio",
			description: "Review Hyperliquid account performance, balances, positions, orders, and trading history.",
			path: "/portfolio",
		}),
	component: PortfolioRoute,
});

function PortfolioRoute() {
	return <PortfolioPage />;
}
