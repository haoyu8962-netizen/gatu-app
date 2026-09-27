import { createFileRoute } from "@tanstack/react-router";
import { LegalDocPage } from "@/components/legal/legal-doc-page";
import { bootDashboardRoute } from "@/lib/navigation/boot-dashboard-route";
import { buildPageHead } from "@/lib/seo";
import content from "../../../../legal/privacyPolicy.md?raw";

export const Route = createFileRoute("/privacy")({
	beforeLoad: () => bootDashboardRoute(),
	ssr: false,
	head: () =>
		buildPageHead({
			title: "Privacy Policy",
			description: "Privacy Policy for the gatu trading terminal.",
			path: "/privacy",
		}),
	component: PrivacyRoute,
});

function PrivacyRoute() {
	return <LegalDocPage content={content} />;
}
