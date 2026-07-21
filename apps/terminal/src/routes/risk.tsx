import { createFileRoute } from "@tanstack/react-router";
import { LegalDocPage } from "@/components/legal/legal-doc-page";
import { buildPageHead } from "@/lib/seo";
import content from "../../../../legal/riskDisclosure.md?raw";

export const Route = createFileRoute("/risk")({
	ssr: true,
	head: () =>
		buildPageHead({
			title: "Risk Disclosure",
			description: "Risk Disclosure for trading through the gatu interface.",
			path: "/risk",
		}),
	component: RiskRoute,
});

function RiskRoute() {
	return <LegalDocPage content={content} />;
}
