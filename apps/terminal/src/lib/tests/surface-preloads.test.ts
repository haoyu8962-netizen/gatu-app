// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { DESKTOP_MEDIA_QUERY, MOBILE_BREAKPOINT_PX } from "@/config/layout";
import { readPreloadList, SURFACE_PRELOAD_META, startSurfacePreloads } from "@/lib/preload/surface-preloads";

function installMeta() {
	document.head.innerHTML = `
		<link rel="modulepreload" href="/assets/common-A.js"/>
		<meta name="${SURFACE_PRELOAD_META.desktop}" content="/assets/desktop-B.js /assets/common-A.js /assets/desktop-C.js"/>
		<meta name="${SURFACE_PRELOAD_META.mobile}" content="/assets/mobile-D.js"/>
		<meta name="${SURFACE_PRELOAD_META.chart}" content="/charting_library/bundles/runtime.4d986d07cb97d8edacba.js /charting_library/sameorigin.html"/>
	`;
}

function links(rel: string): string[] {
	return [...document.head.querySelectorAll(`link[rel="${rel}"]`)].map((link) => link.getAttribute("href") ?? "");
}

describe("surface preloads", () => {
	beforeEach(installMeta);

	it("derives the desktop query from the mobile breakpoint", () => {
		expect(DESKTOP_MEDIA_QUERY).toBe(`(min-width: ${MOBILE_BREAKPOINT_PX + 1}px)`);
	});

	it("appends only the desktop list and the chart prefetches on desktop, without duplicates", () => {
		const result = startSurfacePreloads(document, () => true);
		expect(result.modulepreload).toEqual(["/assets/desktop-B.js", "/assets/desktop-C.js"]);
		expect(result.prefetch).toEqual([
			"/charting_library/bundles/runtime.4d986d07cb97d8edacba.js",
			"/charting_library/sameorigin.html",
		]);
		expect(links("modulepreload")).toEqual(["/assets/common-A.js", "/assets/desktop-B.js", "/assets/desktop-C.js"]);
		expect(startSurfacePreloads(document, () => true)).toEqual({ modulepreload: [], prefetch: [] });
	});

	it("appends only the mobile list and never the chart on phones", () => {
		const result = startSurfacePreloads(document, () => false);
		expect(result).toEqual({ modulepreload: ["/assets/mobile-D.js"], prefetch: [] });
		expect(links("prefetch")).toEqual([]);
		expect(links("modulepreload")).not.toContain("/assets/desktop-B.js");
	});

	it("does nothing on documents without the shell metadata", () => {
		document.head.innerHTML = "";
		expect(readPreloadList(document, SURFACE_PRELOAD_META.desktop)).toEqual([]);
		expect(startSurfacePreloads(document, () => true)).toEqual({ modulepreload: [], prefetch: [] });
	});
});
