import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	collectChartPrefetches,
	collectLocaleCatalogFiles,
	collectShellPreloadFiles,
	DESKTOP_MEDIA_QUERY,
	findChartBundles,
	injectShellPreloads,
	listSourceLocales,
	renderShellHeadLinks,
	stripShellPreloads,
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
		`<meta name="${SURFACE_PRELOAD_META.catalogs}" content=""/>`,
	]);
});

test("the lazy locale catalogs are listed with their static imports, without what startup already loads", () => {
	const chunk = (modules, imports = []) => ({ modules, imports, dynamicImports: [] });
	const graph = {
		chunks: {
			"vendor-A.js": chunk(["apps/terminal/src/lib/i18n.ts", "apps/terminal/src/locales/en/messages.po"]),
			"messages-zh.js": chunk(["apps/terminal/src/locales/zh/messages.po"]),
			"messages-ja.js": chunk(["apps/terminal/src/locales/ja/messages.po"], ["plurals-B.js", "vendor-A.js"]),
			"plurals-B.js": chunk(["node_modules/plurals/index.js"]),
			"language-menu-C.js": chunk(["apps/terminal/src/components/locales/messages.po.tsx", "apps/website/src/locales/zh/messages.po"]),
		},
	};
	const assetFiles = Object.keys(graph.chunks);
	const localeCatalogs = collectLocaleCatalogFiles({ graph, assetFiles, startupFiles: ["vendor-A.js"] });
	assert.deepEqual(localeCatalogs, ["messages-ja.js", "messages-zh.js", "plurals-B.js"]);
	assert.equal(
		renderSurfacePreloadMeta({ desktopOnly: [], mobileOnly: [], chartPrefetches: [], localeCatalogs }).at(-1),
		`<meta name="${SURFACE_PRELOAD_META.catalogs}" content="/assets/messages-ja.js /assets/messages-zh.js /assets/plurals-B.js"/>`,
	);
	assert.deepEqual(collectLocaleCatalogFiles({ graph, assetFiles, startupFiles: assetFiles }), []);
	assert.throws(
		() => collectLocaleCatalogFiles({ graph: { chunks: { "vendor-A.js": chunk(["apps/terminal/src/lib/i18n.ts"]) } }, assetFiles, startupFiles: [] }),
		/no locale catalog module/,
	);
	assert.throws(() => collectLocaleCatalogFiles({ graph, assetFiles: ["vendor-A.js"], startupFiles: [] }), /missing asset/);
});

test("a source locale whose catalog the chunk graph does not hold fails the build, bundled English or not", () => {
	const chunk = (modules) => ({ modules, imports: [], dynamicImports: [] });
	const english = chunk(["apps/terminal/src/locales/en/messages.po"]);
	const graph = { chunks: { "vendor-A.js": english, "messages-zh.js": chunk(["apps/terminal/src/locales/zh/messages.po"]) } };
	const assetFiles = Object.keys(graph.chunks);
	const input = { graph, assetFiles, startupFiles: ["vendor-A.js"] };

	assert.deepEqual(collectLocaleCatalogFiles({ ...input, locales: ["en", "zh"] }), ["messages-zh.js"]);
	assert.throws(() => collectLocaleCatalogFiles({ ...input, locales: ["en", "ja", "zh"] }), /no locale catalog module for: ja$/);
	assert.throws(
		() => collectLocaleCatalogFiles({ graph: { chunks: { "vendor-A.js": english } }, assetFiles, startupFiles: ["vendor-A.js"], locales: ["ar", "en", "zh"] }),
		/no locale catalog module for: ar, zh$/,
	);
});

test("the source locales are the directories that hold a catalog", () => {
	const directory = mkdtempSync(join(tmpdir(), "sairn-locales-"));
	for (const locale of ["zh", "en", "empty"]) mkdirSync(join(directory, locale));
	writeFileSync(join(directory, "zh", "messages.po"), "");
	writeFileSync(join(directory, "en", "messages.po"), "");
	writeFileSync(join(directory, "notes.txt"), "");
	assert.deepEqual(listSourceLocales(directory), ["en", "zh"]);
});

test("the head links the build writes end with the four lists, the locale catalogs among them", () => {
	const links = renderShellHeadLinks({
		html: SHELL,
		surfaces: { common: ["index-A.js", "vendor-C.js"], desktopOnly: ["desktop-D.js"], mobileOnly: [] },
		chartLibraryScript: "/charting_library/charting_library.0123456789abcdef.js",
		chartBundles: { runtime: "/charting_library/bundles/runtime.a.js", library: "/charting_library/bundles/library.b.js" },
		localeCatalogs: ["messages-ja.js", "messages-zh.js"],
	});
	assert.deepEqual(links.slice(0, 2), [
		'<link rel="modulepreload" href="/assets/vendor-C.js"/>',
		renderChartPreloadLink({ chartLibraryScript: "/charting_library/charting_library.0123456789abcdef.js" }),
	]);
	assert.deepEqual(links.slice(2), [
		`<meta name="${SURFACE_PRELOAD_META.desktop}" content="/assets/desktop-D.js"/>`,
		`<meta name="${SURFACE_PRELOAD_META.mobile}" content=""/>`,
		`<meta name="${SURFACE_PRELOAD_META.chart}" content="/charting_library/bundles/runtime.a.js /charting_library/bundles/library.b.js /charting_library/sameorigin.html /tradingview-theme-dark.css"/>`,
		`<meta name="${SURFACE_PRELOAD_META.catalogs}" content="/assets/messages-ja.js /assets/messages-zh.js"/>`,
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
	const dir = mkdtempSync(join(tmpdir(), "sairn-chart-bundles-"));
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

test("injecting twice yields the same shell and previously injected links never count as the shell's own", () => {
	const html = '<html><head><link rel="modulepreload" href="/assets/entry.js"/></head><body></body></html>';
	const links = renderShellPreloadLinks({ files: ["entry.js", "vendor.js", "styles.css"], existingHrefs: readShellAssetHrefs(html) });
	const once = injectShellPreloads(html, links);
	const again = injectShellPreloads(once, renderShellPreloadLinks({ files: ["entry.js", "vendor.js", "styles.css"], existingHrefs: readShellAssetHrefs(stripShellPreloads(once)) }));
	assert.equal(again, once);
	assert.ok(once.includes('<link rel="modulepreload" href="/assets/vendor.js"/>'));
	assert.equal(stripShellPreloads(once), html);
	assert.deepEqual([...readShellAssetHrefs(stripShellPreloads(once))], ["/assets/entry.js"]);
});
