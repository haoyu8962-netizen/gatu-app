import { createFileRoute } from "@tanstack/react-router";
import { LegalDocPage } from "@/components/legal/legal-doc-page";
import { bootDashboardRoute } from "@/lib/navigation/boot-dashboard-route";
import { buildPageHead } from "@/lib/seo";
import content from "../../../../legal/docs.md?raw";

export const Route = createFileRoute("/docs")({
	beforeLoad: () => bootDashboardRoute(),
	ssr: false,
	head: () =>
		buildPageHead({
			title: "Docs",
			description: "Product documentation for the gatu trading terminal.",
			path: "/docs",
		}),
	component: DocsRoute,
});

function DocsRoute() {
	return <LegalDocPage content={content} />;
}
