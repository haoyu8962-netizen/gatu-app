import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	collectInlineScriptHashes,
	collectInlineScripts,
	cspHash,
	findUnhashableMarkup,
	INLINE_SCRIPT_HASHES_FILE,
	listPrerenderedPages,
	writeInlineScriptHashes,
} from "./collect-inline-script-hashes.mjs";

const THEME = '(()=>{document.documentElement.classList.add("dark")})();';
const BARRIER = '(self.$R=self.$R||{})["tsr"]=[];document.currentScript.remove()';
const SHELL = `<html><head><script>${THEME}</script><script type="module" async="" src="/assets/index-A.js"></script></head><body><div id="root"></div><script class="$tsr" id="$tsr-stream-barrier">${BARRIER}</script><script type="application/json" id="data">{"a":"<b>"}</script></body></html>`;

function expectedHash(text) {
	return `sha256-${createHash("sha256").update(text, "utf8").digest("base64")}`;
}

function createPublicDir() {
	const dir = mkdtempSync(join(tmpdir(), "gatu-inline-hashes-"));
	writeFileSync(join(dir, "_shell.html"), SHELL);
	writeFileSync(join(dir, "404.html"), "<html><body>missing</body></html>");
	for (const route of ["docs", "terms"]) {
		mkdirSync(join(dir, route));
		writeFileSync(join(dir, route, "index.html"), `<html><head><script>${THEME}</script></head><body><script>${BARRIER}${route}</script></body></html>`);
	}
	mkdirSync(join(dir, "charting_library"));
	writeFileSync(join(dir, "charting_library", "sameorigin.html"), "<html><script>chart()</script></html>");
	mkdirSync(join(dir, "assets"));
	writeFileSync(join(dir, "assets", "index.html"), "<html><script>never()</script></html>");
	return dir;
}

test("inline executable scripts are hashed over their exact text; external scripts and data blocks are skipped", () => {
	const scripts = collectInlineScripts(SHELL);
	assert.deepEqual(
		scripts.map((script) => script.id),
		["", "$tsr-stream-barrier"],
	);
	assert.equal(scripts[0].hash, expectedHash(THEME));
	assert.equal(scripts[1].hash, expectedHash(BARRIER));
	assert.equal(scripts[1].bytes, Buffer.byteLength(BARRIER));
	assert.equal(cspHash("a\nb"), expectedHash("a\nb"));
	assert.equal(cspHash("a\r\nb\rc"), expectedHash("a\nb\nc"), "CR and CRLF become LF in the parser's input stream");
	assert.equal(cspHash('i:"\u0000docs\u0000docs"'), expectedHash('i:"\uFFFDdocs\uFFFDdocs"'), "NUL becomes U+FFFD in script data");
	assert.notEqual(cspHash("\u0000"), expectedHash("\u0000"));
	assert.equal(collectInlineScripts('<script type="text/javascript">x()</script><script type="importmap">{}</script><script type="text/template">no</script>').length, 2);
});

test("event handlers and javascript urls are reported instead of hashed", () => {
	assert.deepEqual(findUnhashableMarkup(SHELL), []);
	assert.deepEqual(findUnhashableMarkup('<body onload="init()"><a href=" javascript:void(0)">x</a><script>x.onclick="y"</script><meta content="online=1"/></body>'), [
		"inline event handler onload on <body>",
		"javascript: URL in href on <a>",
	]);
});

test("the public directory yields the shell, the route documents and the root documents but not chart or asset files", () => {
	const dir = createPublicDir();
	assert.deepEqual(listPrerenderedPages(dir), ["404.html", "_shell.html", "docs/index.html", "terms/index.html"]);
	const result = collectInlineScriptHashes(dir);
	assert.deepEqual(result.pages["404.html"], []);
	assert.deepEqual(result.pages["_shell.html"], [expectedHash(THEME), expectedHash(BARRIER)].sort());
	assert.equal(result.hashes.length, 4);
	assert.deepEqual(result.hashes, [...result.hashes].sort());
	const written = writeInlineScriptHashes(dir);
	assert.ok(written.outFile.endsWith(join("edge", INLINE_SCRIPT_HASHES_FILE)));
	assert.deepEqual(JSON.parse(readFileSync(written.outFile, "utf8")), { pages: result.pages, hashes: result.hashes });
});

test("a page with an inline handler fails the collection", () => {
	const dir = createPublicDir();
	writeFileSync(join(dir, "docs", "index.html"), '<html><body onload="x()"></body></html>');
	assert.throws(() => collectInlineScriptHashes(dir), /docs\/index\.html: inline event handler onload on <body>/);
});
