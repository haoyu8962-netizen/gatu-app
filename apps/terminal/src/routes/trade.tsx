import { createFileRoute } from "@tanstack/react-router";
import { AppShellSkeleton } from "@/components/trade/layout/app-shell-skeleton";
import { createLazyComponent } from "@/lib/lazy";
import { bootTradeRoute } from "@/lib/trade/trade-route-boot";

const TradeTerminalPage = createLazyComponent(
	() => import("@/components/trade/trade-terminal-page"),
	"TradeTerminalPage",
);

export const Route = createFileRoute("/trade")({
	ssr: false,
	pendingMinMs: 0,
	pendingComponent: AppShellSkeleton,
	beforeLoad: ({ context }) => {
		void TradeTerminalPage.preload?.();
		bootTradeRoute(context.queryClient);
	},
	component: TradeTerminalPage,
});
