import { createFileRoute } from "@tanstack/react-router";
import { isVaultAddress } from "@/components/vaults/domain/vaults";
import { VaultDetailPage } from "@/components/vaults/vaults-page";
import { bootDashboardRoute } from "@/lib/navigation/boot-dashboard-route";
import { buildPageHead } from "@/lib/seo";

export const Route = createFileRoute("/vaults/$vaultAddress")({
	beforeLoad: () => bootDashboardRoute(),
	ssr: false,
	head: ({ params }) =>
		buildPageHead({
			title: "Vault Details",
			description: "Review verified HyperCore Vault details, performance, lock state, and risk disclosures.",
			path: `/vaults/${params.vaultAddress}`,
			noIndex: !isVaultAddress(params.vaultAddress),
		}),
	component: VaultDetailRoute,
});

function VaultDetailRoute() {
	const { vaultAddress } = Route.useParams();
	return <VaultDetailPage vaultAddress={vaultAddress} />;
}
