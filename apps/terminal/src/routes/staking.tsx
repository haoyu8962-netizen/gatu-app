import { createFileRoute } from "@tanstack/react-router";
import { StakingPage } from "@/components/staking/staking-page";
import { bootDashboardRoute } from "@/lib/navigation/boot-dashboard-route";
import { buildPageHead } from "@/lib/seo";

export const Route = createFileRoute("/staking")({
	beforeLoad: () => bootDashboardRoute(),
	ssr: false,
	head: () =>
		buildPageHead({
			title: "Staking",
			description: "Review Hyperliquid staking balances, validators, rewards, and account history.",
			path: "/staking",
		}),
	component: StakingRoute,
});

function StakingRoute() {
	return <StakingPage />;
}
