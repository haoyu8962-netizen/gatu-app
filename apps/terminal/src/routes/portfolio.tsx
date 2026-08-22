import { createFileRoute } from "@tanstack/react-router";
import { PortfolioPage } from "@/components/portfolio/portfolio-page";
import { buildPageHead } from "@/lib/seo";

export const Route = createFileRoute("/portfolio")({
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
