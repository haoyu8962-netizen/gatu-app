import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	collectShellPreloadFiles,
	DESKTOP_MEDIA_QUERY,
	findChartBundles,
	injectShellPreloads,
	readShellAssetHrefs,
	renderChartPreloadLinks,
	renderShellPreloadLinks,
	SHELL_PRELOAD_END,
	SHELL_PRELOAD_START,
} from "./inject-shell-preloads.mjs";

const SHELL =
	'<html><head><link rel="modulepreload" href="/assets/index-A.js"/><link rel="stylesheet" href="/assets/styles-B.css" data-precedence="default"/></head><body></body></html>';

test("startup files come from the static closure plus every runtime profile, without duplicates", () => {
	const files = collectShellPreloadFiles({
		tradeStartupFiles: new Set(["index-A.js", "client-root-C.js", "styles-B.css"]),
		runtimeProfileSizes: [
			{ name: "mobile", files: new Set(["mobile-D.js", "client-root-C.js"]) },
			{ name: "desktop", files: new Set(["chart-E.js", "panel-F.css"]) },
		],
	});
	assert.deepEqual(files, ["index-A.js", "client-root-C.js", "styles-B.css", "mobile-D.js", "chart-E.js", "panel-F.css"]);
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

test("the chart entry is preloaded and its iframe bundles prefetched, desktop only", () => {
	const bundles = { runtime: "/charting_library/bundles/runtime.4d986d07cb97d8edacba.js", library: "/charting_library/bundles/library.f5eaeb6901219f861981.js" };
	const links = renderChartPreloadLinks({ chartLibraryScript: "/charting_library/charting_library.js?v=abc", bundles });
	assert.equal(links[0], `<link rel="preload" href="/charting_library/charting_library.js?v=abc" as="script" media="${DESKTOP_MEDIA_QUERY}"/>`);
	assert.deepEqual(
		links.slice(1).map((link) => /href="([^"]+)"/.exec(link)[1]),
		[bundles.runtime, bundles.library, "/charting_library/sameorigin.html", "/tradingview-theme-dark.css"],
	);
	assert.ok(links.slice(1).every((link) => link.startsWith('<link rel="prefetch"') && link.includes(`media="${DESKTOP_MEDIA_QUERY}"`)));
	assert.throws(() => renderChartPreloadLinks({ chartLibraryScript: undefined, bundles }), /chartLibraryScript/);
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
