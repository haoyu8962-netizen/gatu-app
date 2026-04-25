import { createFileRoute } from "@tanstack/react-router";
import { TradeTerminalPage } from "@/components/trade/trade-terminal-page";
import { ROUTE_SEO } from "@/config/seo";
import { buildPageHead } from "@/lib/seo";

export const Route = createFileRoute("/spot")({
	ssr: false,
	head: () => buildPageHead(ROUTE_SEO.SPOT),
	component: TradeTerminalPage,
});
