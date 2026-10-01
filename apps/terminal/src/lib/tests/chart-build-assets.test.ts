import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import * as zlib from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";

const TEST_DIR = __dirname;
const REPOSITORY_ROOT = resolve(TEST_DIR, "../../../../..");
const VERIFIER = resolve(REPOSITORY_ROOT, "deploy/verify-chart-build.mjs");
const REPOSITORY_CHART_MANIFEST = resolve(REPOSITORY_ROOT, "deploy/manifests/tradingview-charting-library.json");
const REPOSITORY_PUBLIC_ROOT = resolve(REPOSITORY_ROOT, "apps/terminal/public");
const PACKAGE_DESCRIPTION = "CL v28.3.0 (internal id test @ 2024-10-24T17:11:08.681Z)";
const ZSTD_LAZY_FIXTURE = Buffer.from("KLUv/QRYIQAAbGF6eabvl34=", "base64");
const temporaryDirectories: string[] = [];

function createPublicRoots() {
	const root = mkdtempSync(resolve(tmpdir(), "sairn-chart-build-"));
	temporaryDirectories.push(root);
	const source = resolve(root, "source");
	const output = resolve(root, "output");
	mkdirSync(resolve(source, "charting_library/bundles"), { recursive: true });
	mkdirSync(resolve(output, "charting_library/bundles"), { recursive: true });
	const manifest = resolve(root, "tradingview-manifest.json");
	return { manifest, output, source };
}

function writeAsset(root: string, relativePath: string, contents: string | Uint8Array) {
	const file = resolve(root, relativePath);
	mkdirSync(resolve(file, ".."), { recursive: true });
	writeFileSync(file, contents);
}

function writePackageMetadata(root: string) {
	writeAsset(
		root,
		"charting_library/package.json",
		`${JSON.stringify({ description: PACKAGE_DESCRIPTION, private: true }, null, 2)}\n`,
	);
}

function writePackageMetadataPair(source: string, output: string) {
	writePackageMetadata(source);
	writePackageMetadata(output);
}

function writeCompletePackagePair(source: string, output: string) {
	for (const [relativePath, contents] of [
		["charting_library/charting_library.js", "entry"],
		["charting_library/sameorigin.html", "document"],
		["tradingview-theme-dark.css", ":root{}"],
		["tradingview-theme-light.css", ":root{}"],
	] as const) {
		writeAsset(source, relativePath, contents);
		writeAsset(output, relativePath, contents);
	}
	writePackageMetadataPair(source, output);
}

function generateManifest(source: string, manifest: string) {
	execFileSync(process.execPath, [VERIFIER, "--generate-manifest", source, manifest], {
		encoding: "utf8",
		stdio: "pipe",
	});
}

function runVerifier(source: string, output: string, manifest: string, environment: NodeJS.ProcessEnv = {}) {
	return () =>
		execFileSync(process.execPath, [VERIFIER, source, output, manifest], {
			encoding: "utf8",
			env: { ...process.env, ...environment },
			stdio: "pipe",
		});
}

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("TradingView build asset verification", () => {
	it("pins the repository TradingView source tree to its reviewed digest manifest", () => {
		expect(runVerifier(REPOSITORY_PUBLIC_ROOT, REPOSITORY_PUBLIC_ROOT, REPOSITORY_CHART_MANIFEST)).not.toThrow();
	});

	it("accepts a byte-identical complete package with generated compression files", () => {
		const { manifest, output, source } = createPublicRoots();
		for (const [relativePath, contents] of [
			["charting_library/charting_library.js", "entry"],
			["charting_library/sameorigin.html", "document"],
			["charting_library/bundles/lazy.js", "lazy"],
			["tradingview-theme-dark.css", ":root{}"],
			["tradingview-theme-light.css", ":root{}"],
		] as const) {
			writeAsset(source, relativePath, contents);
			writeAsset(output, relativePath, contents);
		}
		writePackageMetadataPair(source, output);
		writeAsset(output, "charting_library/bundles/lazy.js.br", zlib.brotliCompressSync(Buffer.from("lazy")));
		writeAsset(output, "charting_library/bundles/lazy.js.gz", zlib.gzipSync(Buffer.from("lazy")));
		writeAsset(output, "charting_library/bundles/lazy.js.zst", ZSTD_LAZY_FIXTURE);
		generateManifest(source, manifest);

		expect(runVerifier(source, output, manifest)).not.toThrow();
	});

	it("accepts the content-hashed copy of the chart entry that the application build emits", () => {
		const { manifest, output, source } = createPublicRoots();
		writeCompletePackagePair(source, output);
		const hash = createHash("sha256").update("entry").digest("hex").slice(0, 16);
		writeAsset(output, `charting_library/charting_library.${hash}.js`, "entry");
		writeAsset(output, `charting_library/charting_library.${hash}.js.gz`, zlib.gzipSync(Buffer.from("entry")));
		generateManifest(source, manifest);

		expect(runVerifier(source, output, manifest)).not.toThrow();
	});

	it("rejects a hashed chart entry whose name or contents do not come from the source package", () => {
		const { manifest, output, source } = createPublicRoots();
		writeCompletePackagePair(source, output);
		generateManifest(source, manifest);
		const hash = createHash("sha256").update("entry").digest("hex").slice(0, 16);

		writeAsset(output, `charting_library/charting_library.${hash}.js`, "entry!");
		expect(runVerifier(source, output, manifest)).toThrow(/Content-hashed TradingView entry .* differs/);

		rmSync(resolve(output, `charting_library/charting_library.${hash}.js`));
		writeAsset(output, "charting_library/charting_library.0123456789abcdef.js", "entry");
		expect(runVerifier(source, output, manifest)).toThrow(/entry from another package/);
	});

	it("rejects a missing lazy-loaded chart bundle", () => {
		const { manifest, output, source } = createPublicRoots();
		writeAsset(source, "charting_library/charting_library.js", "entry");
		writeAsset(output, "charting_library/charting_library.js", "entry");
		writeAsset(source, "charting_library/sameorigin.html", "document");
		writeAsset(output, "charting_library/sameorigin.html", "document");
		writeAsset(source, "charting_library/bundles/lazy.js", "lazy");
		writeAsset(source, "tradingview-theme-dark.css", ":root{}");
		writeAsset(source, "tradingview-theme-light.css", ":root{}");
		writeAsset(output, "tradingview-theme-dark.css", ":root{}");
		writeAsset(output, "tradingview-theme-light.css", ":root{}");
		writePackageMetadataPair(source, output);
		generateManifest(source, manifest);

		expect(runVerifier(source, output, manifest)).toThrow(/missing TradingView asset: bundles\/lazy\.js/);
	});

	it("rejects a source package without a required chart entry", () => {
		const { manifest, output, source } = createPublicRoots();
		writeAsset(source, "charting_library/sameorigin.html", "document");
		writeAsset(output, "charting_library/sameorigin.html", "document");
		writeAsset(source, "tradingview-theme-dark.css", ":root{}");
		writeAsset(source, "tradingview-theme-light.css", ":root{}");
		writeAsset(output, "tradingview-theme-dark.css", ":root{}");
		writeAsset(output, "tradingview-theme-light.css", ":root{}");
		writePackageMetadataPair(source, output);

		expect(runVerifier(source, output, manifest)).toThrow(/missing required asset: charting_library\.js/);
	});

	it("rejects a changed theme stylesheet", () => {
		const { manifest, output, source } = createPublicRoots();
		writeAsset(source, "charting_library/charting_library.js", "entry");
		writeAsset(output, "charting_library/charting_library.js", "entry");
		writeAsset(source, "charting_library/sameorigin.html", "document");
		writeAsset(output, "charting_library/sameorigin.html", "document");
		writeAsset(source, "tradingview-theme-dark.css", ":root{color:white}");
		writeAsset(source, "tradingview-theme-light.css", ":root{color:white}");
		writeAsset(output, "tradingview-theme-dark.css", ":root{color:black}");
		writeAsset(output, "tradingview-theme-light.css", ":root{color:black}");
		writePackageMetadataPair(source, output);
		generateManifest(source, manifest);

		expect(runVerifier(source, output, manifest)).toThrow(/theme stylesheet differs/);
	});

	it("rejects source and output that agree with each other but not the reviewed package manifest", () => {
		const { manifest, output, source } = createPublicRoots();
		for (const root of [source, output]) {
			writeAsset(root, "charting_library/charting_library.js", "reviewed-entry");
			writeAsset(root, "charting_library/sameorigin.html", "document");
			writeAsset(root, "tradingview-theme-dark.css", ":root{}");
			writeAsset(root, "tradingview-theme-light.css", ":root{}");
		}
		writePackageMetadataPair(source, output);
		generateManifest(source, manifest);
		writeAsset(source, "charting_library/charting_library.js", "altered-entry!");
		writeAsset(output, "charting_library/charting_library.js", "altered-entry!");

		expect(runVerifier(source, output, manifest)).toThrow(/does not match its manifest SHA-256/);
	});

	it("rejects a generated compression file that expands to different bytes", () => {
		const { manifest, output, source } = createPublicRoots();
		for (const root of [source, output]) {
			writeAsset(root, "charting_library/charting_library.js", "entry");
			writeAsset(root, "charting_library/sameorigin.html", "document");
			writeAsset(root, "charting_library/bundles/lazy.js", "lazy");
			writeAsset(root, "tradingview-theme-dark.css", ":root{}");
			writeAsset(root, "tradingview-theme-light.css", ":root{}");
		}
		writePackageMetadataPair(source, output);
		writeAsset(output, "charting_library/bundles/lazy.js.br", zlib.brotliCompressSync(Buffer.from("other")));
		generateManifest(source, manifest);

		expect(runVerifier(source, output, manifest)).toThrow(
			/exceeds its base file size|does not expand to bundles\/lazy\.js/,
		);
	});

	it("rejects a corrupt generated compression file", () => {
		const { manifest, output, source } = createPublicRoots();
		for (const root of [source, output]) {
			writeAsset(root, "charting_library/charting_library.js", "entry");
			writeAsset(root, "charting_library/sameorigin.html", "document");
			writeAsset(root, "charting_library/bundles/lazy.js", "lazy");
			writeAsset(root, "tradingview-theme-dark.css", ":root{}");
			writeAsset(root, "tradingview-theme-light.css", ":root{}");
		}
		writePackageMetadataPair(source, output);
		writeAsset(output, "charting_library/bundles/lazy.js.gz", "not-gzip");
		generateManifest(source, manifest);

		expect(runVerifier(source, output, manifest)).toThrow(/Cannot decompress generated TradingView asset/);
	});

	it.each([
		["br", zlib.brotliCompressSync(Buffer.from("lazy"))],
		["zst", ZSTD_LAZY_FIXTURE],
	] as const)("rejects a valid .%s asset followed by trailing bytes", (extension, compressed) => {
		const { manifest, output, source } = createPublicRoots();
		for (const root of [source, output]) {
			writeAsset(root, "charting_library/charting_library.js", "entry");
			writeAsset(root, "charting_library/sameorigin.html", "document");
			writeAsset(root, "charting_library/bundles/lazy.js", "lazy");
			writeAsset(root, "tradingview-theme-dark.css", ":root{}");
			writeAsset(root, "tradingview-theme-light.css", ":root{}");
		}
		writePackageMetadataPair(source, output);
		writeAsset(
			output,
			`charting_library/bundles/lazy.js.${extension}`,
			Buffer.concat([compressed, Buffer.from("junk")]),
		);
		generateManifest(source, manifest);

		expect(runVerifier(source, output, manifest)).toThrow(/contains trailing or concatenated data/);
	});

	it("rejects path traversal in a package manifest", () => {
		const { manifest, output, source } = createPublicRoots();
		for (const root of [source, output]) {
			writeAsset(root, "charting_library/charting_library.js", "entry");
			writeAsset(root, "charting_library/sameorigin.html", "document");
			writeAsset(root, "tradingview-theme-dark.css", ":root{}");
			writeAsset(root, "tradingview-theme-light.css", ":root{}");
		}
		writePackageMetadataPair(source, output);
		generateManifest(source, manifest);
		const generated = JSON.parse(readFileSync(manifest, "utf8"));
		generated.files[0].path = "../outside.js";
		writeFileSync(manifest, `${JSON.stringify(generated)}\n`);

		expect(runVerifier(source, output, manifest)).toThrow(/Invalid TradingView manifest path/);
	});

	it("rejects duplicate paths in a package manifest", () => {
		const { manifest, output, source } = createPublicRoots();
		for (const root of [source, output]) {
			writeAsset(root, "charting_library/charting_library.js", "entry");
			writeAsset(root, "charting_library/sameorigin.html", "document");
			writeAsset(root, "tradingview-theme-dark.css", ":root{}");
			writeAsset(root, "tradingview-theme-light.css", ":root{}");
		}
		writePackageMetadataPair(source, output);
		generateManifest(source, manifest);
		const generated = JSON.parse(readFileSync(manifest, "utf8"));
		generated.files.push(generated.files[0]);
		writeFileSync(manifest, `${JSON.stringify(generated)}\n`);

		expect(runVerifier(source, output, manifest)).toThrow(/Duplicate TradingView manifest path/);
	});

	it("rejects payload fields outside the metadata-only manifest schema", () => {
		const { manifest, output, source } = createPublicRoots();
		for (const root of [source, output]) {
			writeAsset(root, "charting_library/charting_library.js", "entry");
			writeAsset(root, "charting_library/sameorigin.html", "document");
			writeAsset(root, "tradingview-theme-dark.css", ":root{}");
			writeAsset(root, "tradingview-theme-light.css", ":root{}");
		}
		writePackageMetadataPair(source, output);
		generateManifest(source, manifest);
		const generated = JSON.parse(readFileSync(manifest, "utf8"));
		generated.files[0].contents = "commercial-source-must-not-be-embedded";
		writeFileSync(manifest, `${JSON.stringify(generated)}\n`);

		expect(runVerifier(source, output, manifest)).toThrow(/unexpected contents/);
	});

	it("rejects source assets absent from the reviewed package manifest", () => {
		const { manifest, output, source } = createPublicRoots();
		for (const root of [source, output]) {
			writeAsset(root, "charting_library/charting_library.js", "entry");
			writeAsset(root, "charting_library/sameorigin.html", "document");
			writeAsset(root, "tradingview-theme-dark.css", ":root{}");
			writeAsset(root, "tradingview-theme-light.css", ":root{}");
		}
		writePackageMetadataPair(source, output);
		generateManifest(source, manifest);
		writeAsset(source, "charting_library/bundles/unreviewed.js", "unreviewed");
		writeAsset(output, "charting_library/bundles/unreviewed.js", "unreviewed");

		expect(runVerifier(source, output, manifest)).toThrow(/assets absent from its manifest/);
	});

	it("generates a versioned source-tree digest manifest without overwriting an existing review", () => {
		const { manifest, source } = createPublicRoots();
		writeAsset(source, "charting_library/charting_library.js", "entry");
		writeAsset(source, "charting_library/sameorigin.html", "document");
		writeAsset(source, "tradingview-theme-dark.css", ":root{}");
		writeAsset(source, "tradingview-theme-light.css", ":root{}");
		writePackageMetadata(source);

		generateManifest(source, manifest);
		const generated = JSON.parse(readFileSync(manifest, "utf8"));

		expect(generated).toMatchObject({
			packageDescription: PACKAGE_DESCRIPTION,
			packageVersion: "28.3.0",
			schemaVersion: 1,
		});
		expect(generated.files).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					path: "charting_library.js",
					sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
					size: 5,
				}),
			]),
		);
		expect(() => generateManifest(source, manifest)).toThrow();
	});
});
