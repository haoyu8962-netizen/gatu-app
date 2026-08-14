import { createFileRoute, Outlet } from "@tanstack/react-router";
import { startMarketCatalogBootstrap } from "@/lib/hyperliquid/markets/market-catalog-bootstrap";

function BuildersPerpLayout() {
	return <Outlet />;
}

export const Route = createFileRoute("/builders-perp")({
	beforeLoad: ({ context }) => {
		startMarketCatalogBootstrap(context.queryClient);
	},
	component: BuildersPerpLayout,
});
