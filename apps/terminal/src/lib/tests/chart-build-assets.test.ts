import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const TEST_DIR = __dirname;
const REPOSITORY_ROOT = resolve(TEST_DIR, "../../../../..");
const VERIFIER = resolve(REPOSITORY_ROOT, "deploy/verify-chart-build.mjs");
const temporaryDirectories: string[] = [];

function createPublicRoots() {
	const root = mkdtempSync(resolve(tmpdir(), "gatu-chart-build-"));
	temporaryDirectories.push(root);
	const source = resolve(root, "source");
	const output = resolve(root, "output");
	mkdirSync(resolve(source, "charting_library/bundles"), { recursive: true });
	mkdirSync(resolve(output, "charting_library/bundles"), { recursive: true });
	return { source, output };
}

function writeAsset(root: string, relativePath: string, contents: string) {
	const file = resolve(root, relativePath);
	mkdirSync(resolve(file, ".."), { recursive: true });
	writeFileSync(file, contents);
}

function runVerifier(source: string, output: string) {
	return () => execFileSync(process.execPath, [VERIFIER, source, output], { encoding: "utf8", stdio: "pipe" });
}

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("TradingView build asset verification", () => {
	it("accepts a byte-identical complete package with generated compression files", () => {
		const { source, output } = createPublicRoots();
		for (const [relativePath, contents] of [
			["charting_library/charting_library.js", "entry"],
			["charting_library/sameorigin.html", "document"],
			["charting_library/bundles/lazy.js", "lazy"],
			["tradingview-theme.css", ":root{}"],
		] as const) {
			writeAsset(source, relativePath, contents);
			writeAsset(output, relativePath, contents);
		}
		writeAsset(output, "charting_library/bundles/lazy.js.br", "compressed");

		expect(runVerifier(source, output)).not.toThrow();
	});

	it("rejects a missing lazy-loaded chart bundle", () => {
		const { source, output } = createPublicRoots();
		writeAsset(source, "charting_library/charting_library.js", "entry");
		writeAsset(output, "charting_library/charting_library.js", "entry");
		writeAsset(source, "charting_library/sameorigin.html", "document");
		writeAsset(output, "charting_library/sameorigin.html", "document");
		writeAsset(source, "charting_library/bundles/lazy.js", "lazy");
		writeAsset(source, "tradingview-theme.css", ":root{}");
		writeAsset(output, "tradingview-theme.css", ":root{}");

		expect(runVerifier(source, output)).toThrow(/missing TradingView asset: bundles\/lazy\.js/);
	});

	it("rejects a source package without a required chart entry", () => {
		const { source, output } = createPublicRoots();
		writeAsset(source, "charting_library/sameorigin.html", "document");
		writeAsset(output, "charting_library/sameorigin.html", "document");
		writeAsset(source, "tradingview-theme.css", ":root{}");
		writeAsset(output, "tradingview-theme.css", ":root{}");

		expect(runVerifier(source, output)).toThrow(/missing required asset: charting_library\.js/);
	});

	it("rejects a changed theme stylesheet", () => {
		const { source, output } = createPublicRoots();
		writeAsset(source, "charting_library/charting_library.js", "entry");
		writeAsset(output, "charting_library/charting_library.js", "entry");
		writeAsset(source, "charting_library/sameorigin.html", "document");
		writeAsset(output, "charting_library/sameorigin.html", "document");
		writeAsset(source, "tradingview-theme.css", ":root{color:white}");
		writeAsset(output, "tradingview-theme.css", ":root{color:black}");

		expect(runVerifier(source, output)).toThrow(/theme stylesheet differs/);
	});
});
