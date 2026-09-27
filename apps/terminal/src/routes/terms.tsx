import { createFileRoute } from "@tanstack/react-router";
import { LegalDocPage } from "@/components/legal/legal-doc-page";
import { bootLegalRoute } from "@/lib/navigation/boot-legal-route";
import { buildPageHead } from "@/lib/seo";
import content from "../../../../legal/terms.md?raw";

export const Route = createFileRoute("/terms")({
	beforeLoad: () => bootLegalRoute(),
	ssr: false,
	head: () =>
		buildPageHead({
			title: "Terms of Use",
			description: "Terms of Use for the gatu trading terminal.",
			path: "/terms",
		}),
	component: TermsRoute,
});

function TermsRoute() {
	return <LegalDocPage content={content} />;
}
