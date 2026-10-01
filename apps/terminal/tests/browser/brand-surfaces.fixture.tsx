import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { Button } from "@sairn/ui";
import { useEffect, useLayoutEffect } from "react";
import { toast } from "sonner";
import { BrandLogo } from "@/components/brand/brand-logo";
import { BrandMotion } from "@/components/brand/brand-motion";
import { BrandPageLoader } from "@/components/brand/brand-page-loader";
import { ButtonLoading } from "@/components/brand/button-loading";
import { StatusGlyph } from "@/components/brand/status-glyph";
import { Toaster } from "@/components/ui/sonner";
import * as brandMotions from "@/lib/brand/brand-motion.gen";
import * as statusGlyphs from "@/lib/brand/status-glyph.gen";
import type { BrandMotionDefinition, StatusGlyphDefinition } from "@/lib/brand/status-glyph.gen";
import { dynamicActivate, i18nReady } from "@/lib/i18n";
import { createI18nRoot } from "@/lib/tests/harness/react";
import { useSetTheme, useTheme } from "@/stores/use-global-settings-store";
import "./trade-slider.css";

declare global {
	interface Window {
		__sairnBrandSurfaces?: { ready: boolean; theme: "dark" | "light" };
	}
}

const requestedTheme = new URLSearchParams(window.location.search).get("theme") === "light" ? "light" : "dark";
const GLYPHS = Object.entries(statusGlyphs)
	.filter(([name]) => name.startsWith("STATUS_GLYPH_"))
	.map(([, value]) => value as StatusGlyphDefinition);
const MOTIONS = Object.values(brandMotions) as BrandMotionDefinition[];
const TOKEN_PROBES = ["--text-success", "--text-error", "--text-warning", "--text-weak", "--text-info", "--on-action"];

function Fixture() {
	const theme = useTheme();
	const setTheme = useSetTheme();
	const themeApplied = theme === requestedTheme;

	useLayoutEffect(() => {
		if (!themeApplied) setTheme(requestedTheme);
	}, [themeApplied, setTheme]);

	useEffect(() => {
		if (!themeApplied) return;
		toast.success("Order filled", { id: "success", duration: Number.POSITIVE_INFINITY });
		toast.info("Copied", { id: "info", duration: Number.POSITIVE_INFINITY });
		toast.warning("Check the details", { id: "warning", duration: Number.POSITIVE_INFINITY });
		toast.error("Order rejected", { id: "error", duration: Number.POSITIVE_INFINITY });
		toast.loading("Exporting", { id: "loading" });
		window.__sairnBrandSurfaces = { ready: true, theme: requestedTheme };
	}, [themeApplied]);

	if (!themeApplied) return null;
	return (
		<main className="min-h-screen bg-background p-6 text-fg">
			<section data-section="logo" className="flex items-center gap-6">
				<BrandLogo className="h-6 w-auto" />
				<BrandLogo variant="mark" className="h-6 w-auto" />
				<BrandPageLoader className="size-12" />
			</section>
			<section data-section="glyphs" className="mt-6 grid grid-cols-[repeat(10,auto)] items-center justify-start gap-4">
				{[16, 20, 24, 32].flatMap((size) =>
					GLYPHS.map((glyph) => (
						<StatusGlyph key={`${glyph.id}-${size}`} glyph={glyph} size={size} data-size={size} />
					)),
				)}
			</section>
			<section data-section="motions" className="mt-6 flex flex-wrap items-center gap-4">
				{MOTIONS.map((motion) => (
					<BrandMotion key={motion.id} motion={motion} size={motion.id === "copy-feedback" ? 32 : 64} />
				))}
			</section>
			<section data-section="buttons" className="mt-6 flex gap-4">
				<Button variant="filled" intent="neutral" disabled>
					<ButtonLoading />
					Enabling
				</Button>
				<Button variant="filled" intent="brand">
					<ButtonLoading />
					Switching
				</Button>
			</section>
			<section data-section="probes" className="sr-only">
				{TOKEN_PROBES.map((token) => (
					<span key={token} data-token={token} style={{ color: `var(${token})` }} />
				))}
			</section>
			<Toaster />
		</main>
	);
}

async function boot() {
	await i18nReady;
	await dynamicActivate("en");
	const root = document.getElementById("root");
	if (!root) throw new Error("Missing fixture root");
	const router = createRouter({
		routeTree: createRootRoute({ component: Fixture }),
		history: createMemoryHistory({ initialEntries: ["/"] }),
	});
	createI18nRoot(root).render(<RouterProvider router={router} />);
}

void boot();
