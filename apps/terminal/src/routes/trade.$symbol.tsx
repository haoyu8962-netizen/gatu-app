import { createFileRoute } from "@tanstack/react-router";
import { buildPageHead } from "@/lib/seo";

export const Route = createFileRoute("/trade/$symbol")({
	ssr: false,
	head: ({ params }) =>
		buildPageHead({
			title: `${params.symbol} Market`,
			description: `Trade ${params.symbol} on Hyperliquid.`,
			path: `/trade/${params.symbol}`,
			keywords: ["trade", "hyperliquid", params.symbol],
			noIndex: true,
		}),
	component: EmptyTradeRoute,
});

function EmptyTradeRoute() {
	return null;
}
