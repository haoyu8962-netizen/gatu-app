import { createFileRoute } from "@tanstack/react-router";
import { FundingHistoryPage } from "@/components/funding-history/funding-history-page";
import { bootDashboardRoute } from "@/lib/navigation/boot-dashboard-route";
import { buildPageHead } from "@/lib/seo";

export const Route = createFileRoute("/fundingHistory/$address")({
	beforeLoad: () => bootDashboardRoute(),
	ssr: false,
	remountDeps: ({ params }) => ({ address: params.address.toLowerCase() }),
	head: ({ params }) =>
		buildPageHead({
			title: "Funding Payments",
			description: "Review a Hyperliquid account's confirmed funding payments for the requested time window.",
			path: `/fundingHistory/${params.address}`,
			noIndex: true,
		}),
	component: FundingHistoryRoute,
});

function FundingHistoryRoute() {
	const { address } = Route.useParams();
	return <FundingHistoryPage address={address} />;
}
