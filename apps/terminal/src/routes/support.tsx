import { createFileRoute } from "@tanstack/react-router";
import { LegalDocPage } from "@/components/legal/legal-doc-page";
import { BRAND_NAME } from "@/config/brand";
import { bootDashboardRoute } from "@/lib/navigation/boot-dashboard-route";
import { buildPageHead } from "@/lib/seo";
import content from "../../../../legal/support.md?raw";

export const Route = createFileRoute("/support")({
	beforeLoad: () => bootDashboardRoute(),
	ssr: false,
	head: () =>
		buildPageHead({
			title: "Support",
			description: `Help, FAQ, troubleshooting, and contact channels for ${BRAND_NAME}.`,
			path: "/support",
		}),
	component: SupportRoute,
});

function SupportRoute() {
	return <LegalDocPage content={content} />;
}
