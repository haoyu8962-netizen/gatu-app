import assert from "node:assert/strict";
import test from "node:test";
import {
	collectShellPreloadFiles,
	injectShellPreloads,
	readShellAssetHrefs,
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
