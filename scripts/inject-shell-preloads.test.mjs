import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	collectChartPrefetches,
	collectShellPreloadFiles,
	DESKTOP_MEDIA_QUERY,
	findChartBundles,
	injectShellPreloads,
	readShellAssetHrefs,
	renderChartPreloadLink,
	renderShellPreloadLinks,
	renderSurfacePreloadMeta,
	SHELL_PRELOAD_END,
	SHELL_PRELOAD_START,
	SURFACE_PRELOAD_META,
} from "./inject-shell-preloads.mjs";

const SHELL =
	'<html><head><link rel="modulepreload" href="/assets/index-A.js"/><link rel="stylesheet" href="/assets/styles-B.css" data-precedence="default"/></head><body></body></html>';

test("startup files split into the shared closure and surface-only lists", () => {
	const surfaces = collectShellPreloadFiles({
		tradeStartupFiles: new Set(["index-A.js", "client-root-C.js", "styles-B.css"]),
		runtimeProfileSizes: [
			{ name: "mobile", files: new Set(["mobile-D.js", "client-root-C.js", "shared-G.js"]) },
			{ name: "desktop", files: new Set(["chart-E.js", "panel-F.css", "shared-G.js"]) },
		],
	});
	assert.deepEqual(surfaces.common, ["index-A.js", "client-root-C.js", "styles-B.css", "shared-G.js"]);
	assert.deepEqual(surfaces.desktopOnly, ["chart-E.js", "panel-F.css"]);
	assert.deepEqual(surfaces.mobileOnly, ["mobile-D.js"]);
	const meta = renderSurfacePreloadMeta({ ...surfaces, chartPrefetches: ["/charting_library/sameorigin.html"] });
	assert.deepEqual(meta, [
		`<meta name="${SURFACE_PRELOAD_META.desktop}" content="/assets/chart-E.js /assets/panel-F.css"/>`,
		`<meta name="${SURFACE_PRELOAD_META.mobile}" content="/assets/mobile-D.js"/>`,
		`<meta name="${SURFACE_PRELOAD_META.chart}" content="/charting_library/sameorigin.html"/>`,
	]);
});

test("links skip what the shell already references and preload stylesheets as styles", () => {
	const links = renderShellPreloadLinks({
		files: ["index-A.js", "client-root-C.js", "styles-B.css", "panel-F.css", "logo.svg"],
		existingHrefs: readShellAssetHrefs(SHELL),
	});
	assert.deepEqual(links, [
		'<link rel="modulepreload" href="/assets/client-root-C.js"/>',
		'<link rel="preload" href="/assets/panel-F.css" as="style"/>',
	]);
});

test("injection goes before </head> once and replaces its own block on a second run", () => {
	const first = injectShellPreloads(SHELL, ['<link rel="modulepreload" href="/assets/client-root-C.js"/>']);
	assert.ok(first.includes(`${SHELL_PRELOAD_START}<link rel="modulepreload" href="/assets/client-root-C.js"/>${SHELL_PRELOAD_END}</head>`));
	const second = injectShellPreloads(first, ['<link rel="modulepreload" href="/assets/client-root-D.js"/>']);
	assert.equal(second.split(SHELL_PRELOAD_START).length, 2);
	assert.ok(second.includes("client-root-D.js") && !second.includes("client-root-C.js"));
	assert.throws(() => injectShellPreloads("<html></html>", []), /<\/head>/);
});

test("the chart entry is preloaded on desktop widths and its iframe files are listed for the entry", () => {
	const bundles = { runtime: "/charting_library/bundles/runtime.4d986d07cb97d8edacba.js", library: "/charting_library/bundles/library.f5eaeb6901219f861981.js" };
	assert.equal(
		renderChartPreloadLink({ chartLibraryScript: "/charting_library/charting_library.js?v=abc" }),
		`<link rel="preload" href="/charting_library/charting_library.js?v=abc" as="script" media="${DESKTOP_MEDIA_QUERY}"/>`,
	);
	assert.deepEqual(collectChartPrefetches(bundles), [bundles.runtime, bundles.library, "/charting_library/sameorigin.html", "/tradingview-theme-dark.css"]);
	assert.throws(() => renderChartPreloadLink({ chartLibraryScript: undefined }), /chartLibraryScript/);
});

test("exactly one runtime and one library bundle must exist in the TradingView package", () => {
	const dir = mkdtempSync(join(tmpdir(), "gatu-chart-bundles-"));
	mkdirSync(join(dir, "bundles"));
	writeFileSync(join(dir, "bundles", "runtime.4d986d07cb97d8edacba.js"), "js");
	writeFileSync(join(dir, "bundles", "library.f5eaeb6901219f861981.js"), "js");
	writeFileSync(join(dir, "bundles", "en.4026.6f886b4ecb915f046a50.js"), "js");
	assert.deepEqual(findChartBundles(join(dir, "bundles")), {
		runtime: "/charting_library/bundles/runtime.4d986d07cb97d8edacba.js",
		library: "/charting_library/bundles/library.f5eaeb6901219f861981.js",
	});
	writeFileSync(join(dir, "bundles", "library.0123456789abcdef0123.js"), "js");
	assert.throws(() => findChartBundles(join(dir, "bundles")), /one TradingView library bundle, found 2/);
	assert.throws(() => findChartBundles(join(dir, "missing")), /runtime bundle, found 0/);
});
