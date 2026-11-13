import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { installChartLibrary, readChartLibraryManifest, verifyChartLibrary } from "./fetch-chart-library.mjs";

const CONTENTS = { "charting_library.js": "loader", "bundles/a.js": "bundle" };

function sha256(text) {
	return createHash("sha256").update(text).digest("hex");
}

function fixture() {
	const root = mkdtempSync(join(tmpdir(), "chart-library-test-"));
	const source = join(root, "source");
	mkdirSync(join(source, "bundles"), { recursive: true });
	for (const [path, text] of Object.entries(CONTENTS)) writeFileSync(join(source, path), text);
	const manifestPath = join(root, "manifest.json");
	const files = Object.entries(CONTENTS).map(([path, text]) => ({ path, sha256: sha256(text), size: text.length }));
	writeFileSync(manifestPath, JSON.stringify({ schemaVersion: 1, files }));
	return { root, source, target: join(root, "public", "charting_library"), manifestPath };
}

test("installs exactly the manifest files and leaves source extras behind", async () => {
	const { root, source, target, manifestPath } = fixture();
	try {
		writeFileSync(join(source, "README.md"), "not part of the package");
		mkdirSync(join(root, "public"));
		const files = await readChartLibraryManifest(manifestPath);
		await installChartLibrary({ source, target, files });
		assert.deepEqual(readdirSync(target).sort(), ["bundles", "charting_library.js"]);
		assert.equal(readFileSync(join(target, "bundles", "a.js"), "utf8"), "bundle");
		await verifyChartLibrary(target, files, { exact: true });
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("refuses a source whose file differs from the manifest and keeps the installed copy", async () => {
	const { root, source, target, manifestPath } = fixture();
	try {
		mkdirSync(target, { recursive: true });
		writeFileSync(join(target, "keep.txt"), "previous install");
		writeFileSync(join(source, "bundles", "a.js"), "bundlf");
		const files = await readChartLibraryManifest(manifestPath);
		await assert.rejects(installChartLibrary({ source, target, files }), /does not match its manifest SHA-256/);
		assert.equal(readFileSync(join(target, "keep.txt"), "utf8"), "previous install");
		assert.equal(readdirSync(join(root, "public")).length, 1);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("refuses a source that is missing a manifest file", async () => {
	const { root, source, target, manifestPath } = fixture();
	try {
		rmSync(join(source, "charting_library.js"));
		const files = await readChartLibraryManifest(manifestPath);
		await assert.rejects(installChartLibrary({ source, target, files }), /file is missing: charting_library\.js/);
		assert.equal(existsSync(target), false);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("an installed directory with a file the manifest does not list fails the exact check", async () => {
	const { root, source, manifestPath } = fixture();
	try {
		const files = await readChartLibraryManifest(manifestPath);
		await verifyChartLibrary(source, files, { exact: true });
		writeFileSync(join(source, "bundles", "extra.js"), "x");
		await assert.rejects(verifyChartLibrary(source, files, { exact: true }), /absent from the manifest: bundles\/extra\.js/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("rejects manifest paths that leave the library directory", async () => {
	const { root, manifestPath } = fixture();
	try {
		writeFileSync(manifestPath, JSON.stringify({ files: [{ path: "../evil.js", sha256: sha256("x"), size: 1 }] }));
		await assert.rejects(readChartLibraryManifest(manifestPath), /invalid entry/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
