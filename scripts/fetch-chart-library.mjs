#!/usr/bin/env node
// Installs the licensed chart library into apps/terminal/public/charting_library.
// The library is not part of this repository (docs/adr/0054-chart-library-outside-the-repository.md);
// every file is checked against deploy/manifests/tradingview-charting-library.json.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, lstat, mkdtemp, readdir, readFile, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const CHART_LIBRARY_TARGET = join(REPOSITORY_ROOT, "apps/terminal/public/charting_library");
export const CHART_LIBRARY_MANIFEST = join(REPOSITORY_ROOT, "deploy/manifests/tradingview-charting-library.json");
export const DEFAULT_CHART_LIBRARY_REPOSITORY = "https://github.com/haoyu8962-netizen/gatu-chart-library.git";

const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export async function readChartLibraryManifest(manifestPath) {
	const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
	if (!Array.isArray(manifest?.files) || manifest.files.length === 0) {
		throw new Error(`Chart library manifest ${manifestPath} has no files.`);
	}
	const files = new Map();
	for (const entry of manifest.files) {
		const segments = typeof entry?.path === "string" ? entry.path.split("/") : [];
		const safePath = segments.length > 0 && segments.every((segment) => segment && segment !== "." && segment !== "..");
		if (!safePath || entry.path.includes("\\") || !SHA256_PATTERN.test(entry.sha256) || !Number.isSafeInteger(entry.size)) {
			throw new Error(`Chart library manifest has an invalid entry: ${JSON.stringify(entry?.path)}`);
		}
		if (files.has(entry.path)) throw new Error(`Chart library manifest lists ${entry.path} twice.`);
		files.set(entry.path, { sha256: entry.sha256, size: entry.size });
	}
	return files;
}

async function listFiles(root, directory = "") {
	const names = [];
	for (const entry of await readdir(join(root, directory), { withFileTypes: true })) {
		const relativePath = directory ? `${directory}/${entry.name}` : entry.name;
		if (entry.isDirectory()) names.push(...(await listFiles(root, relativePath)));
		else names.push(relativePath);
	}
	return names;
}

async function readManifestFile(root, relativePath, entry) {
	const file = join(root, ...relativePath.split("/"));
	let stats;
	try {
		stats = await lstat(file);
	} catch {
		throw new Error(`Chart library file is missing: ${relativePath}`);
	}
	if (!stats.isFile()) throw new Error(`Chart library file is not a regular file: ${relativePath}`);
	const contents = await readFile(file);
	if (contents.length !== entry.size) {
		throw new Error(`Chart library file ${relativePath} has size ${contents.length}; the manifest requires ${entry.size}.`);
	}
	if (createHash("sha256").update(contents).digest("hex") !== entry.sha256) {
		throw new Error(`Chart library file ${relativePath} does not match its manifest SHA-256.`);
	}
}

// `exact` also rejects files the manifest does not list; a source checkout may carry extras (README, .git).
export async function verifyChartLibrary(root, files, { exact }) {
	for (const [relativePath, entry] of files) await readManifestFile(root, relativePath, entry);
	if (!exact) return;
	const unexpected = (await listFiles(root)).filter((relativePath) => !files.has(relativePath));
	if (unexpected.length > 0) {
		throw new Error(`Chart library directory contains files absent from the manifest: ${unexpected.slice(0, 5).join(", ")}`);
	}
}

export async function installChartLibrary({ source, target, files }) {
	await verifyChartLibrary(source, files, { exact: false });
	const staging = `${target}.incoming-${process.pid}`;
	await rm(staging, { recursive: true, force: true });
	try {
		for (const relativePath of files.keys()) {
			const parts = relativePath.split("/");
			await cp(join(source, ...parts), join(staging, ...parts), { recursive: false });
		}
		await verifyChartLibrary(staging, files, { exact: true });
		await rm(target, { recursive: true, force: true });
		await rename(staging, target);
	} finally {
		await rm(staging, { recursive: true, force: true });
	}
}

async function exists(path) {
	try {
		await lstat(path);
		return true;
	} catch {
		return false;
	}
}

async function cloneSource(repository) {
	const directory = await mkdtemp(join(tmpdir(), "chart-library-"));
	try {
		execFileSync("git", ["clone", "--quiet", "--depth", "1", repository, directory], {
			stdio: ["ignore", "ignore", "inherit"],
			env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
		});
	} catch {
		await rm(directory, { recursive: true, force: true });
		throw new Error(
			`Cannot clone the private chart library from ${repository}. Sign in with access to it (for example \`gh auth setup-git\`), or pass --from <directory> with a copy of the library.`,
		);
	}
	return directory;
}

function parseArguments(argv) {
	const options = { check: false, from: process.env.CHART_LIBRARY_DIR || undefined };
	for (let index = 0; index < argv.length; index += 1) {
		if (argv[index] === "--check") options.check = true;
		else if (argv[index] === "--from" && argv[index + 1]) options.from = argv[++index];
		else throw new Error("Usage: node scripts/fetch-chart-library.mjs [--check] [--from <directory>]");
	}
	return options;
}

async function main() {
	const options = parseArguments(process.argv.slice(2));
	const files = await readChartLibraryManifest(CHART_LIBRARY_MANIFEST);
	const label = CHART_LIBRARY_TARGET.slice(REPOSITORY_ROOT.length + sep.length);

	if (await exists(CHART_LIBRARY_TARGET)) {
		try {
			await verifyChartLibrary(CHART_LIBRARY_TARGET, files, { exact: true });
			console.log(`Chart library in ${label} matches the manifest (${files.size} files).`);
			return;
		} catch (error) {
			if (options.check) throw error;
			console.log(`Replacing ${label}: ${error.message}`);
		}
	} else if (options.check) {
		throw new Error(`Chart library is not installed in ${label}. Run \`pnpm chart:fetch\`.`);
	}

	const cloned = options.from ? undefined : await cloneSource(process.env.CHART_LIBRARY_REPOSITORY || DEFAULT_CHART_LIBRARY_REPOSITORY);
	try {
		await installChartLibrary({ source: resolve(options.from ?? cloned), target: CHART_LIBRARY_TARGET, files });
	} finally {
		if (cloned) await rm(cloned, { recursive: true, force: true });
	}
	console.log(`Installed the chart library into ${label} (${files.size} files).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	main().catch((error) => {
		console.error(error.message);
		process.exitCode = 1;
	});
}
