import { createFileRoute } from "@tanstack/react-router";
import { AppShellSkeleton } from "@/components/trade/layout/app-shell-skeleton";
import { TradeTerminalPage } from "@/components/trade/trade-terminal-page";

export const Route = createFileRoute("/trade")({
	ssr: false,
	pendingMinMs: 0,
	pendingComponent: AppShellSkeleton,
	component: TradeLayout,
});

function TradeLayout() {
	return <TradeTerminalPage />;
}
