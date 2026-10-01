import { DESKTOP_MEDIA_QUERY } from "@/config/layout";

/**
 * The build writes surface-specific preload lists into the shell as `<meta>` tags because HTML
 * `modulepreload` and `prefetch` links cannot be limited to one viewport: Chromium ignores `media`
 * on prefetch links entirely. The bootstrap entry appends the links for the surface it is on, so a
 * phone never downloads desktop panels or the chart iframe bundles it will not mount.
 */
export const SURFACE_PRELOAD_META = {
	desktop: "sairn-preload-desktop",
	mobile: "sairn-preload-mobile",
	chart: "sairn-chart-prefetch",
} as const;

export interface SurfacePreloadResult {
	modulepreload: string[];
	prefetch: string[];
}

export function readPreloadList(doc: Document, name: string): string[] {
	const content = doc.querySelector(`meta[name="${name}"]`)?.getAttribute("content") ?? "";
	return content.split(/\s+/).filter((href) => href.startsWith("/"));
}

function appendLinks(doc: Document, rel: "modulepreload" | "prefetch", hrefs: readonly string[]): string[] {
	const appended: string[] = [];
	for (const href of hrefs) {
		if (doc.head.querySelector(`link[rel="${rel}"][href="${href}"]`)) continue;
		const link = doc.createElement("link");
		link.rel = rel;
		link.href = href;
		doc.head.append(link);
		appended.push(href);
	}
	return appended;
}

function matchesDesktopViewport(): boolean {
	return typeof window.matchMedia === "function" && window.matchMedia(DESKTOP_MEDIA_QUERY).matches;
}

export function startSurfacePreloads(
	doc: Document = document,
	matchesDesktop: () => boolean = matchesDesktopViewport,
): SurfacePreloadResult {
	const desktop = matchesDesktop();
	const modulepreload = appendLinks(
		doc,
		"modulepreload",
		readPreloadList(doc, desktop ? SURFACE_PRELOAD_META.desktop : SURFACE_PRELOAD_META.mobile),
	);
	const prefetch = desktop ? appendLinks(doc, "prefetch", readPreloadList(doc, SURFACE_PRELOAD_META.chart)) : [];
	return { modulepreload, prefetch };
}
