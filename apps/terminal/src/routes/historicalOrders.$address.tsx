import { createFileRoute } from "@tanstack/react-router";
import { HistoricalOrdersPage } from "@/components/historical-orders/historical-orders-page";
import { bootDashboardRoute } from "@/lib/navigation/boot-dashboard-route";
import { buildPageHead } from "@/lib/seo";

export const Route = createFileRoute("/historicalOrders/$address")({
	beforeLoad: () => bootDashboardRoute(),
	ssr: false,
	remountDeps: ({ params }) => ({ address: params.address.toLowerCase() }),
	head: ({ params }) =>
		buildPageHead({
			title: "Order History",
			description: "Review the most recent ordinary Hyperliquid orders for an account.",
			path: `/historicalOrders/${params.address}`,
			noIndex: true,
		}),
	component: HistoricalOrdersRoute,
});

function HistoricalOrdersRoute() {
	const { address } = Route.useParams();
	return <HistoricalOrdersPage address={address} />;
}
