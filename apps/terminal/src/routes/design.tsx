import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { buildPageHead } from "@/lib/seo";

export const Route = createFileRoute("/design")({
	ssr: false,
	head: () =>
		buildPageHead({
			title: "Design System",
			description: "Internal design system workspace — tokens, components, and consistency checks.",
			path: "/design",
		}),
	component: function DesignRoute() {
		return (
			<ClientOnly fallback={<div className="flex h-screen items-center justify-center text-text-500">Loading…</div>}>
				<DesignSystem />
			</ClientOnly>
		);
	},
});

import { lazy } from "react";

const DesignSystem = lazy(() => import("@/components/design/design-system"));
