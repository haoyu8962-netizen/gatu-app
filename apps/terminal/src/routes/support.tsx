import { createFileRoute } from "@tanstack/react-router";
import { LegalDocPage } from "@/components/legal/legal-doc-page";
import { buildPageHead } from "@/lib/seo";
import content from "../../../../legal/support.md?raw";

export const Route = createFileRoute("/support")({
	ssr: true,
	head: () =>
		buildPageHead({
			title: "Support",
			description: "Help, FAQ, troubleshooting, and contact channels for gatu.",
			path: "/support",
		}),
	component: SupportRoute,
});

function SupportRoute() {
	return <LegalDocPage content={content} />;
}
