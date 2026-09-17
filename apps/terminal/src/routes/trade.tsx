import { createFileRoute } from "@tanstack/react-router";
import { StartupFallback } from "@/components/startup-fallback";
import { createLazyComponent } from "@/lib/lazy";
import { bootTradeRoute } from "@/lib/trade/trade-route-boot";

const TradeTerminalPage = createLazyComponent(
	() => import("@/components/trade/trade-terminal-page"),
	"TradeTerminalPage",
);

export const Route = createFileRoute("/trade")({
	ssr: false,
	pendingMinMs: 0,
	pendingComponent: StartupFallback,
	beforeLoad: async ({ context, location }) => {
		void TradeTerminalPage.preload?.();
		await bootTradeRoute(context.queryClient, location.pathname);
	},
	component: TradeTerminalPage,
});
