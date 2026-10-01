import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MOTION_SOURCE = "brand/tools/Sairn-Motion-Library-v1.3.html";
const STUDIO_SOURCE = "brand/tools/Sairn-Share-Studio-v1.3.html";
const LOADER_DIRECTORY = "brand/loader";
const TOKENS_OUTPUT = "brand/tokens/sairn.tokens.json";
const PROVENANCE_FILE = "PROVENANCE.json";
const ZIP_ROOT = "sairn-motion";

const args = new Set(process.argv.slice(2));
const unknownArgs = [...args].filter((arg) => arg !== "--check" && arg !== "--write");
if (unknownArgs.length > 0 || (args.has("--check") && args.has("--write"))) {
	console.error("Usage: node scripts/brand-export-motion.mjs [--write | --check]");
	process.exit(2);
}
const checkOnly = args.has("--check");

const workDirectory = await mkdtemp(join(tmpdir(), "sairn-motion-export-"));
try {
	const exported = await exportMotionLibrary(workDirectory);
	const tokens = await extractDesignTokens();
	const provenance = await buildProvenance(exported);

	if (checkOnly) {
		const drift = await compareWithRepository(exported, tokens, provenance);
		if (drift.length > 0) {
			console.error(`Brand motion export drifted from ${LOADER_DIRECTORY}:`);
			for (const line of drift) console.error(`  ${line}`);
			console.error("Run `node scripts/brand-export-motion.mjs --write` and review the diff.");
			process.exitCode = 1;
		} else {
			console.log(`Brand motion export matches ${LOADER_DIRECTORY} (${exported.files.length} files).`);
		}
	} else {
		await writeRepository(exported, tokens, provenance);
		console.log(`Wrote ${exported.files.length} motion files to ${LOADER_DIRECTORY} and design tokens to ${TOKENS_OUTPUT}.`);
	}
} finally {
	await rm(workDirectory, { recursive: true, force: true });
}

async function exportMotionLibrary(directory) {
	const browser = await chromium.launch();
	try {
		const context = await browser.newContext({ acceptDownloads: true });
		const page = await context.newPage();
		const externalRequests = [];
		page.on("request", (request) => {
			if (!request.url().startsWith("file:") && !request.url().startsWith("data:") && !request.url().startsWith("blob:")) {
				externalRequests.push(request.url());
			}
		});
		await page.goto(pathToFileURL(resolve(REPOSITORY_ROOT, MOTION_SOURCE)).href);
		await page.waitForFunction(() => Boolean(window.SairnMotion));
		const [download] = await Promise.all([page.waitForEvent("download"), page.locator("#download-all").click()]);
		const zipPath = join(directory, "motion.zip");
		await download.saveAs(zipPath);
		if (externalRequests.length > 0) {
			throw new Error(`The motion library made network requests: ${externalRequests.join(", ")}`);
		}

		const unzipDirectory = join(directory, "unzipped");
		await mkdir(unzipDirectory, { recursive: true });
		execFileSync("unzip", ["-q", zipPath, "-d", unzipDirectory]);
		const root = join(unzipDirectory, ZIP_ROOT);
		const files = (await listFiles(root)).sort();
		return { root, files };
	} finally {
		await browser.close();
	}
}

async function extractDesignTokens() {
	const motionTokens = extractTokenLiteral(await readFile(resolve(REPOSITORY_ROOT, MOTION_SOURCE), "utf8"), MOTION_SOURCE);
	const studioTokens = extractTokenLiteral(await readFile(resolve(REPOSITORY_ROOT, STUDIO_SOURCE), "utf8"), STUDIO_SOURCE);
	if (JSON.stringify(motionTokens) !== JSON.stringify(studioTokens)) {
		throw new Error(`${MOTION_SOURCE} and ${STUDIO_SOURCE} embed different design tokens.`);
	}
	return `${JSON.stringify(motionTokens, null, 2)}\n`;
}

function extractTokenLiteral(source, label) {
	const marker = "const T = ";
	const start = source.indexOf(marker);
	if (start === -1) throw new Error(`${label} does not embed design tokens (missing \`${marker}\`).`);
	const objectStart = source.indexOf("{", start);
	let depth = 0;
	let inString = false;
	for (let index = objectStart; index < source.length; index += 1) {
		const character = source[index];
		if (inString) {
			if (character === "\\") index += 1;
			else if (character === '"') inString = false;
			continue;
		}
		if (character === '"') inString = true;
		else if (character === "{") depth += 1;
		else if (character === "}") {
			depth -= 1;
			if (depth === 0) return JSON.parse(source.slice(objectStart, index + 1));
		}
	}
	throw new Error(`${label} embeds an unterminated design token object.`);
}

async function buildProvenance(exported) {
	const files = {};
	for (const file of exported.files) {
		files[toPosix(file)] = sha256(await readFile(join(exported.root, file)));
	}
	return `${JSON.stringify(
		{
			source: MOTION_SOURCE,
			sourceSha256: sha256(await readFile(resolve(REPOSITORY_ROOT, MOTION_SOURCE))),
			exporter: "scripts/brand-export-motion.mjs",
			method: "Chromium (@playwright/test) opens the source page and clicks #download-all; the downloaded ZIP is unpacked here.",
			files,
		},
		null,
		2,
	)}\n`;
}

async function writeRepository(exported, tokens, provenance) {
	const loader = resolve(REPOSITORY_ROOT, LOADER_DIRECTORY);
	await rm(loader, { recursive: true, force: true });
	await mkdir(loader, { recursive: true });
	await cp(exported.root, loader, { recursive: true });
	await writeFile(join(loader, PROVENANCE_FILE), provenance);
	await mkdir(dirname(resolve(REPOSITORY_ROOT, TOKENS_OUTPUT)), { recursive: true });
	await writeFile(resolve(REPOSITORY_ROOT, TOKENS_OUTPUT), tokens);
}

async function compareWithRepository(exported, tokens, provenance) {
	const drift = [];
	const loader = resolve(REPOSITORY_ROOT, LOADER_DIRECTORY);
	const committed = new Set((await listFiles(loader).catch(() => [])).map(toPosix));
	for (const file of exported.files) {
		const name = toPosix(file);
		committed.delete(name);
		const expected = await readFile(join(exported.root, file));
		const actual = await readFile(join(loader, file)).catch(() => null);
		if (!actual) drift.push(`missing ${name}`);
		else if (!expected.equals(actual)) drift.push(`changed ${name}`);
	}
	const committedProvenance = await readFile(join(loader, PROVENANCE_FILE), "utf8").catch(() => null);
	committed.delete(PROVENANCE_FILE);
	if (committedProvenance !== provenance) drift.push(`changed ${PROVENANCE_FILE}`);
	for (const extra of committed) drift.push(`unexpected ${extra}`);
	const committedTokens = await readFile(resolve(REPOSITORY_ROOT, TOKENS_OUTPUT), "utf8").catch(() => null);
	if (committedTokens !== tokens) drift.push(`changed ${TOKENS_OUTPUT}`);
	return drift;
}

async function listFiles(directory) {
	const entries = await readdir(directory, { recursive: true, withFileTypes: true });
	return entries
		.filter((entry) => entry.isFile() && entry.name !== ".DS_Store")
		.map((entry) => relative(directory, join(entry.parentPath ?? entry.path, entry.name)));
}

function sha256(buffer) {
	return createHash("sha256").update(buffer).digest("hex");
}

function toPosix(path) {
	return path.split(sep).join("/");
}
