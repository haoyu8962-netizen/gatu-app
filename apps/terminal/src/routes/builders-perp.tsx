import { createFileRoute, Outlet } from "@tanstack/react-router";
import { bootTradeRoute } from "@/lib/trade/trade-route-boot";

function BuildersPerpLayout() {
	return <Outlet />;
}

export const Route = createFileRoute("/builders-perp")({
	beforeLoad: ({ context }) => {
		bootTradeRoute(context.queryClient);
	},
	component: BuildersPerpLayout,
});
