import { createFileRoute } from "@tanstack/react-router";
import { ROUTE_SEO } from "@/config/seo";
import { buildPageHead } from "@/lib/seo";

export const Route = createFileRoute("/trade/$base/$quote")({
	ssr: false,
	head: ({ params }) =>
		buildPageHead({
			...ROUTE_SEO.TRADE,
			path: `/trade/${params.base}/${params.quote}`,
			keywords: [...ROUTE_SEO.TRADE.keywords, params.base, params.quote],
			noIndex: true,
		}),
	component: EmptyTradeRoute,
});

function EmptyTradeRoute() {
	return null;
}
