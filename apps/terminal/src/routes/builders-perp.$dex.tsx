import { createFileRoute } from "@tanstack/react-router";
import { AppShellSkeleton } from "@/components/trade/layout/app-shell-skeleton";
import { ROUTE_SEO } from "@/config/seo";
import { createLazyComponent } from "@/lib/lazy";
import { buildPageHead } from "@/lib/seo";
import { bootTradeRoute } from "@/lib/trade/trade-route-boot";

const TradeTerminalPage = createLazyComponent(
	() => import("@/components/trade/trade-terminal-page"),
	"TradeTerminalPage",
);

export const Route = createFileRoute("/builders-perp/$dex")({
	ssr: false,
	pendingMinMs: 0,
	pendingComponent: AppShellSkeleton,
	beforeLoad: ({ context, location }) => {
		void TradeTerminalPage.preload?.();
		bootTradeRoute(context.queryClient, location.pathname);
	},
	head: ({ params }) =>
		buildPageHead({
			...ROUTE_SEO.BUILDERS_PERP,
			path: `/builders-perp/${params.dex}`,
			keywords: [...ROUTE_SEO.BUILDERS_PERP.keywords, params.dex],
		}),
	component: TradeTerminalPage,
});
