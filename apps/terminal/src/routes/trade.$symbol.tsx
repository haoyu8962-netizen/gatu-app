import { createFileRoute } from "@tanstack/react-router";
import { ROUTE_SEO } from "@/config/seo";
import { buildPageHead } from "@/lib/seo";

export const Route = createFileRoute("/trade/$symbol")({
	ssr: false,
	head: ({ params }) =>
		buildPageHead({
			...ROUTE_SEO.TRADE,
			path: `/trade/${params.symbol}`,
			keywords: [...ROUTE_SEO.TRADE.keywords, params.symbol],
			noIndex: true,
		}),
	component: EmptyTradeRoute,
});

function EmptyTradeRoute() {
	return null;
}
