import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	assertFunctionCodeSize,
	fillScriptHashes,
	FUNCTION_CODE_LIMIT_BYTES,
	hasScriptHashLines,
	missingScriptHashes,
	parseScriptHashes,
	readEdgeConfig,
	rotateScriptHashes,
	SCRIPT_HASHES_MODES,
	serializeScriptHashes,
} from "./function-code.mjs";

const A = "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
const B = "sha256-BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=";
const C = "sha256-CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC=";
const CODE = 'var X = 1;\nvar SCRIPT_HASHES_CURRENT = "";\nvar SCRIPT_HASHES_PREVIOUS = "";\nfunction handler(event) { return event.response; }\n';

test("hash sets round-trip through the function code", () => {
	const filled = fillScriptHashes(CODE, { current: [A, B], previous: [C] });
	assert.ok(filled.includes(`var SCRIPT_HASHES_CURRENT = "'${A}' '${B}'";`));
	assert.ok(filled.includes(`var SCRIPT_HASHES_PREVIOUS = "'${C}'";`));
	assert.deepEqual(parseScriptHashes(filled), { current: [A, B], previous: [C] });
	assert.deepEqual(parseScriptHashes(CODE), { current: [], previous: [] });
	assert.equal(hasScriptHashLines(CODE), true);
	assert.equal(hasScriptHashLines("var handler = 1;"), false);
	assert.deepEqual(fillScriptHashes(filled, { current: [C], previous: [] }), fillScriptHashes(CODE, { current: [C], previous: [] }));
	assert.throws(() => fillScriptHashes("var handler = 1;", { current: [A], previous: [] }), /no SCRIPT_HASHES_CURRENT line/);
	assert.throws(() => serializeScriptHashes(["sha256-short"]), /Not a CSP sha256 hash/);
	assert.throws(() => fillScriptHashes(CODE, { current: ["'; alert(1); //"], previous: [] }), /Not a CSP sha256 hash/);
});

test("a release keeps the previous release's hashes and drops the one before", () => {
	assert.deepEqual(rotateScriptHashes({ build: [B, A], live: { current: [], previous: [] } }), { current: [A, B], previous: [] });
	assert.deepEqual(rotateScriptHashes({ build: [C], live: { current: [A, B], previous: [] } }), { current: [C], previous: [A, B] });
	assert.deepEqual(rotateScriptHashes({ build: [C, A], live: { current: [A, B], previous: [] } }), { current: [A, C], previous: [B] });
	assert.deepEqual(rotateScriptHashes({ build: [C], live: { current: [C], previous: [A] } }), { current: [C], previous: [A] });
});

test("pages the origin still serves stay allowed even when the live function names a build that never shipped", () => {
	const D = "sha256-dddd";
	assert.deepEqual(rotateScriptHashes({ build: [C], live: { current: [B], previous: [A] }, served: [A] }), { current: [C], previous: [A, B] });
	assert.deepEqual(rotateScriptHashes({ build: [C], live: { current: [C], previous: [B] }, served: [B] }), { current: [C], previous: [B] });
	assert.deepEqual(rotateScriptHashes({ build: [C], live: { current: [B], previous: [] }, served: [C, D] }), { current: [C], previous: [B, D] });
	const live = fillScriptHashes(CODE, { current: [A], previous: [B] });
	assert.deepEqual(missingScriptHashes(live, [A, B]), []);
	assert.deepEqual(missingScriptHashes(live, [A, C]), [C]);
});

test("the size limit and the edge config are validated", () => {
	assert.equal(assertFunctionCodeSize("x".repeat(FUNCTION_CODE_LIMIT_BYTES)), FUNCTION_CODE_LIMIT_BYTES);
	assert.throws(() => assertFunctionCodeSize("x".repeat(FUNCTION_CODE_LIMIT_BYTES + 1)), /CloudFront Functions allow/);
	const dir = mkdtempSync(join(tmpdir(), "sairn-edge-config-"));
	const path = join(dir, "edge-config.json");
	writeFileSync(path, JSON.stringify({ cspReportUri: "https://reports.example/", cspScriptHashes: "enforce", cspImageSources: "report-only" }));
	assert.deepEqual(readEdgeConfig(path), { cspReportUri: "https://reports.example/", cspScriptHashes: "enforce", cspImageSources: "report-only" });
	writeFileSync(path, JSON.stringify({ cspReportUri: "", cspScriptHashes: "off", cspImageSources: "enforce" }));
	assert.throws(() => readEdgeConfig(path), /cspScriptHashes/);
	writeFileSync(path, JSON.stringify({ cspReportUri: "", cspScriptHashes: "enforce" }));
	assert.throws(() => readEdgeConfig(path), /cspImageSources/);
	writeFileSync(path, JSON.stringify({ cspReportUri: "http://reports.example/", cspScriptHashes: "report-only", cspImageSources: "report-only" }));
	assert.throws(() => readEdgeConfig(path), /https origin/);
	assert.deepEqual(SCRIPT_HASHES_MODES, ["report-only", "enforce"]);
});
