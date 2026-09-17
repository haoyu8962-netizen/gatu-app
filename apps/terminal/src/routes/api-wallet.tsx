import { createFileRoute } from "@tanstack/react-router";
import { ApiWalletPage } from "@/components/api-wallet/api-wallet-page";
import { bootDashboardRoute } from "@/lib/navigation/boot-dashboard-route";
import { buildPageHead } from "@/lib/seo";

export const Route = createFileRoute("/api-wallet")({
	beforeLoad: () => bootDashboardRoute(),
	ssr: false,
	head: () =>
		buildPageHead({
			title: "API Wallet",
			description: "Create and manage Hyperliquid API wallets for delegated trading actions.",
			path: "/api-wallet",
		}),
	component: ApiWalletRoute,
});

function ApiWalletRoute() {
	return <ApiWalletPage />;
}
