import { createFileRoute } from "@tanstack/react-router";
import { LegalDocPage } from "@/components/legal/legal-doc-page";
import { BRAND_NAME } from "@/config/brand";
import { bootDashboardRoute } from "@/lib/navigation/boot-dashboard-route";
import { buildPageHead } from "@/lib/seo";
import content from "../../../../legal/privacyPolicy.md?raw";

export const Route = createFileRoute("/privacy")({
	beforeLoad: () => bootDashboardRoute(),
	ssr: false,
	head: () =>
		buildPageHead({
			title: "Privacy Policy",
			description: `Privacy Policy for the ${BRAND_NAME} trading terminal.`,
			path: "/privacy",
		}),
	component: PrivacyRoute,
});

function PrivacyRoute() {
	return <LegalDocPage content={content} />;
}
