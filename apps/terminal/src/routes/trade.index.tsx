import { createFileRoute } from "@tanstack/react-router";
import { ROUTE_SEO } from "@/config/seo";
import { buildPageHead } from "@/lib/seo";

export const Route = createFileRoute("/trade/")({
	ssr: false,
	head: () => buildPageHead(ROUTE_SEO.TRADE),
	component: EmptyTradeRoute,
});

function EmptyTradeRoute() {
	return null;
}
