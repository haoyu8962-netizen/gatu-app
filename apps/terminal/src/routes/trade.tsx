import { createFileRoute } from "@tanstack/react-router";
import { TradeTerminalPage } from "@/components/trade/trade-terminal-page";

export const Route = createFileRoute("/trade")({
	component: TradeLayout,
});

function TradeLayout() {
	return <TradeTerminalPage />;
}
