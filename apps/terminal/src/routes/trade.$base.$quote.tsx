import { createFileRoute } from "@tanstack/react-router";
import { buildPageHead } from "@/lib/seo";

export const Route = createFileRoute("/trade/$base/$quote")({
	ssr: false,
	head: ({ params }) =>
		buildPageHead({
			title: `${params.base}/${params.quote} Market`,
			description: `Trade ${params.base}/${params.quote} on Hyperliquid.`,
			path: `/trade/${params.base}/${params.quote}`,
			keywords: ["trade", "hyperliquid", params.base, params.quote],
		}),
	component: EmptyTradeRoute,
});

function EmptyTradeRoute() {
	return null;
}
