import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { checkShellHeadScrub, findHeadScrubProblem, readCommittedScrubScript } from "./check-shell-head-scrub.mjs";

const SCRUB = '(()=>{window.__scrubbed=!0})();';
const page = (head, body = "") => `<!DOCTYPE html><html><head><meta charSet="utf-8"/>${head}</head><body>${body}</body></html>`;

test("the committed literal is read back with its escapes undone", () => {
	const source = "// generated\nexport const PAIRING_HEAD_SCRUB_SCRIPT =\n\t'a=/^\\\\/x\\\\/?$/i;b=\\'q\\';';\n";
	assert.equal(readCommittedScrubScript(source), "a=/^\\/x\\/?$/i;b='q';");
	assert.throws(() => readCommittedScrubScript("export const OTHER = 'x';"), /does not hold the rendered script/);
	assert.match(readCommittedScrubScript(), /__gatuPairingBootstrap/);
});

test("the scrub must be the first script element of the document, inside head", () => {
	assert.equal(findHeadScrubProblem(page(`<link rel="modulepreload" href="/a.js"/><script>${SCRUB}</script><script>theme()</script>`), SCRUB), null);
	assert.match(findHeadScrubProblem(page(`<script>theme()</script><script>${SCRUB}</script>`), SCRUB), /another inline script/);
	assert.match(findHeadScrubProblem(page(`<script type="module" src="/entry.js"></script><script>${SCRUB}</script>`), SCRUB), /external script/);
	assert.match(findHeadScrubProblem(page("", `<script>${SCRUB}</script>`), SCRUB), /outside <head>/);
	assert.equal(findHeadScrubProblem(page(""), SCRUB), null, "a document that runs no script has nothing to order");
	assert.match(findHeadScrubProblem(page(`<script>${SCRUB} </script>`), SCRUB), /another inline script/);
});

test("every prerendered page is checked and named", (context) => {
	const publicDir = mkdtempSync(join(tmpdir(), "gatu-head-scrub-"));
	context.after(() => rmSync(publicDir, { recursive: true, force: true }));
	mkdirSync(join(publicDir, "docs"));
	mkdirSync(join(publicDir, "assets"));
	writeFileSync(join(publicDir, "_shell.html"), page(`<script>${SCRUB}</script>`));
	writeFileSync(join(publicDir, "docs", "index.html"), page(`<script>${SCRUB}</script>`));
	writeFileSync(join(publicDir, "assets", "ignored.html"), page("<script>other()</script>"));
	assert.deepEqual(checkShellHeadScrub(publicDir, SCRUB), []);

	writeFileSync(join(publicDir, "docs", "index.html"), page(`<script>theme()</script><script>${SCRUB}</script>`));
	assert.deepEqual(checkShellHeadScrub(publicDir, SCRUB), ["docs/index.html runs another inline script before the pairing scrub"]);
});
