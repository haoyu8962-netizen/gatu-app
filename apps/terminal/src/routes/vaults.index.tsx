import { createFileRoute } from "@tanstack/react-router";
import { VaultsPage } from "@/components/vaults/vaults-page";
import { buildPageHead } from "@/lib/seo";

export const Route = createFileRoute("/vaults/")({
	ssr: false,
	head: () =>
		buildPageHead({
			title: "Vaults",
			description: "Explore HyperCore Vaults and review verified public performance data.",
			path: "/vaults",
		}),
	component: VaultsPage,
});
