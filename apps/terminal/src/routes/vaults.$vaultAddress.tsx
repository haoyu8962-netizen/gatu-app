import { createFileRoute } from "@tanstack/react-router";
import { VaultDetailPage } from "@/components/vaults/vaults-page";
import { buildPageHead } from "@/lib/seo";

export const Route = createFileRoute("/vaults/$vaultAddress")({
	ssr: false,
	head: ({ params }) =>
		buildPageHead({
			title: "Vault Details",
			description: "Review verified HyperCore Vault details, performance, lock state, and risk disclosures.",
			path: `/vaults/${params.vaultAddress}`,
		}),
	component: VaultDetailRoute,
});

function VaultDetailRoute() {
	const { vaultAddress } = Route.useParams();
	return <VaultDetailPage vaultAddress={vaultAddress} />;
}
