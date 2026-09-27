import { createFileRoute } from "@tanstack/react-router";
import { LegalDocPage } from "@/components/legal/legal-doc-page";
import { bootDashboardRoute } from "@/lib/navigation/boot-dashboard-route";
import { buildPageHead } from "@/lib/seo";
import content from "../../../../legal/cookies.md?raw";

export const Route = createFileRoute("/cookies")({
	beforeLoad: () => bootDashboardRoute(),
	ssr: false,
	head: () =>
		buildPageHead({
			title: "Cookie Policy",
			description: "Cookie and browser storage policy for the gatu trading terminal.",
			path: "/cookies",
		}),
	component: CookiesRoute,
});

function CookiesRoute() {
	return <LegalDocPage content={content} />;
}
