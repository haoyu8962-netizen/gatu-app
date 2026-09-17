import { createFileRoute } from "@tanstack/react-router";
import { LeaderboardPage } from "@/components/leaderboard/leaderboard-page";
import { bootDashboardRoute } from "@/lib/navigation/boot-dashboard-route";
import { buildPageHead } from "@/lib/seo";

export const Route = createFileRoute("/leaderboard")({
	beforeLoad: () => bootDashboardRoute(),
	ssr: false,
	head: () =>
		buildPageHead({
			title: "Leaderboard",
			description: "Compare public Hyperliquid account performance across supported time windows.",
			path: "/leaderboard",
		}),
	component: LeaderboardRoute,
});

function LeaderboardRoute() {
	return <LeaderboardPage />;
}
