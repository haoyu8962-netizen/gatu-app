import { createFileRoute } from "@tanstack/react-router";
import { TradeHistoryPage } from "@/components/trade-history/trade-history-page";
import { bootDashboardRoute } from "@/lib/navigation/boot-dashboard-route";
import { buildPageHead } from "@/lib/seo";

export const Route = createFileRoute("/tradeHistory/$address")({
	beforeLoad: () => bootDashboardRoute(),
	ssr: false,
	remountDeps: ({ params }) => ({ address: params.address.toLowerCase() }),
	head: ({ params }) =>
		buildPageHead({
			title: "Trade History",
			description: "Review a Hyperliquid account's most recent public trade history snapshot.",
			path: `/tradeHistory/${params.address}`,
			noIndex: true,
		}),
	component: TradeHistoryRoute,
});

function TradeHistoryRoute() {
	const { address } = Route.useParams();
	return <TradeHistoryPage address={address} />;
}
