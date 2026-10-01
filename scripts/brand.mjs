import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { renderStatusMotion, STATUS_MOTION_CSS_OUTPUT, STATUS_MOTION_OUTPUT } from "./brand-status-motion.mjs";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BRAND_SOURCE = "brand/brand.json";
const LOADER_DIRECTORY = "brand/loader";
const LOADER_SUPPLEMENT_DIRECTORY = "brand/loader-supplement";
const LOGO_GEOMETRY_OUTPUT = "apps/terminal/src/lib/brand/logo-geometry.gen.ts";
// Only the variants the terminal renders go into its runtime bundle; the wordmark and the 16-grid mark stay in brand/.
const LOGO_VARIANTS = {
	lockup: "brand/svg/lockup/sairn-lockup",
	mark: "brand/svg/mark/sairn-mark",
};
const LOGO_COLORWAYS = ["on-light", "on-dark", "black", "white", "mono"];
const LOADER_SOURCE = "brand/loader/svg/on-light/page-loading.svg";

// Public files copied verbatim from brand/. Hashed website assets are imported by Astro instead.
const SYNCED_FILES = [
	["brand/web/favicon.ico", "apps/terminal/public/favicon.ico"],
	["brand/web/favicon.svg", "apps/terminal/public/favicon.svg"],
	["brand/web/apple-touch-icon.png", "apps/terminal/public/apple-touch-icon.png"],
	["brand/web/icon-192.png", "apps/terminal/public/icon-192.png"],
	["brand/web/icon-512.png", "apps/terminal/public/icon-512.png"],
	["brand/web/icon-maskable-192.png", "apps/terminal/public/icon-maskable-192.png"],
	["brand/web/icon-maskable-512.png", "apps/terminal/public/icon-maskable-512.png"],
	["brand/web/icon.svg", "apps/terminal/public/icon.svg"],
	["brand/svg/lockup/sairn-lockup-on-dark.svg", "apps/terminal/public/brand/lockup-on-dark.svg"],
	["brand/svg/lockup/sairn-lockup-on-light.svg", "apps/terminal/public/brand/lockup-on-light.svg"],
	["brand/web/email-logo.png", "apps/terminal/public/brand/email-logo.png"],
	["brand/web/favicon.ico", "apps/website/public/favicon.ico"],
	["brand/web/apple-touch-icon.png", "apps/website/public/apple-touch-icon.png"],
];
const OPAQUE_PNGS = [
	"brand/web/apple-touch-icon.png",
	"brand/web/icon-maskable-192.png",
	"brand/web/icon-maskable-512.png",
	"brand/web/email-logo.png",
];
const PNG_SIZES = {
	"brand/web/apple-touch-icon.png": [180, 180],
	"brand/web/icon-192.png": [192, 192],
	"brand/web/icon-512.png": [512, 512],
	"brand/web/icon-maskable-192.png": [192, 192],
	"brand/web/icon-maskable-512.png": [512, 512],
	"brand/web/email-logo.png": [360, 180],
};

const args = process.argv.slice(2);
const mode = args[0] ?? "--check";
if (args.length > 1 || (mode !== "--check" && mode !== "--sync")) {
	console.error("Usage: node scripts/brand.mjs [--check | --sync]");
	process.exit(2);
}

if (mode === "--sync") {
	syncBrand();
	console.log(`Synced ${SYNCED_FILES.length} public files, ${LOGO_GEOMETRY_OUTPUT} and the status motion module.`);
}

const problems = checkBrand();
if (problems.length > 0) {
	console.error(`Brand check found ${problems.length} problem(s):`);
	for (const problem of problems) console.error(`  - ${problem}`);
	process.exitCode = 1;
} else {
	console.log("Brand check passed.");
}

function syncBrand() {
	writeFileSync(resolve(REPOSITORY_ROOT, LOGO_GEOMETRY_OUTPUT), renderLogoGeometry(readJson(BRAND_SOURCE)));
	const statusMotion = renderStatusMotion(markGeometry());
	writeFileSync(resolve(REPOSITORY_ROOT, STATUS_MOTION_OUTPUT), statusMotion.ts);
	writeFileSync(resolve(REPOSITORY_ROOT, STATUS_MOTION_CSS_OUTPUT), statusMotion.css);
	for (const [source, target] of SYNCED_FILES) {
		mkdirSync(dirname(resolve(REPOSITORY_ROOT, target)), { recursive: true });
		copyFileSync(resolve(REPOSITORY_ROOT, source), resolve(REPOSITORY_ROOT, target));
	}
}

function renderLogoGeometry(brand) {
	const partByFill = new Map([
		[brand.logo.light.signal.toLowerCase(), "signal"],
		[brand.logo.light.choice.toLowerCase(), "choice"],
		[brand.logo.light.wordmark.toLowerCase(), "wordmark"],
	]);
	const variants = {};
	for (const [variant, prefix] of Object.entries(LOGO_VARIANTS)) {
		const reference = parseSvg(`${prefix}-on-light.svg`);
		const paths = reference.paths.map(({ fill, d }) => {
			const part = partByFill.get(fill.toLowerCase());
			if (!part) throw new Error(`${prefix}-on-light.svg uses ${fill}, which is not a light logo color in ${BRAND_SOURCE}`);
			return { part, d };
		});
		for (const colorway of LOGO_COLORWAYS) {
			const other = parseSvg(`${prefix}-${colorway}.svg`);
			if (other.viewBox !== reference.viewBox || other.paths.map((path) => path.d).join("|") !== paths.map((path) => path.d).join("|")) {
				throw new Error(`${prefix}-${colorway}.svg does not share the on-light geometry and path order`);
			}
		}
		variants[variant] = { viewBox: reference.viewBox, paths };
	}

	const loader = parseSvg(LOADER_SOURCE);
	if (loader.paths.map((path) => path.d).join("|") !== variants.mark.paths.map((path) => path.d).join("|")) {
		throw new Error(`${LOADER_SOURCE} no longer animates the mark geometry`);
	}

	const lines = [
		"// Generated by `pnpm brand:sync` from brand/svg and brand/loader. Do not edit by hand.",
		"",
		'export type BrandLogoPart = "signal" | "choice" | "wordmark";',
		"",
		"export interface BrandLogoGeometry {",
		"\tviewBox: string;",
		"\tpaths: readonly { part: BrandLogoPart; d: string }[];",
		"}",
		"",
		"export const BRAND_LOGO_GEOMETRY = {",
	];
	for (const [variant, geometry] of Object.entries(variants)) {
		lines.push(`\t${JSON.stringify(variant)}: {`, `\t\tviewBox: ${JSON.stringify(geometry.viewBox)},`, "\t\tpaths: [");
		for (const path of geometry.paths) {
			lines.push(`\t\t\t{ part: ${JSON.stringify(path.part)}, d: ${JSON.stringify(path.d)} },`);
		}
		lines.push("\t\t],", "\t},");
	}
	lines.push(
		"} as const satisfies Record<string, BrandLogoGeometry>;",
		"",
		`export const BRAND_LOADER_VIEW_BOX = ${JSON.stringify(loader.viewBox)};`,
		"",
	);
	return lines.join("\n");
}

function markGeometry() {
	return { paths: parseSvg(`${LOGO_VARIANTS.mark}-on-light.svg`).paths };
}

function parseSvg(path) {
	const source = readText(path);
	const viewBox = /<svg\b[^>]*\bviewBox="([^"]+)"/.exec(source)?.[1];
	const paths = [...source.matchAll(/<path\b[^>]*\bfill="([^"]+)"[^>]*\bd="([^"]+)"/g)].map((match) => ({
		fill: match[1],
		d: match[2],
	}));
	if (!viewBox || paths.length === 0) throw new Error(`${path} has no viewBox or no filled paths`);
	return { viewBox, paths };
}

export function checkBrand() {
	const brand = readJson(BRAND_SOURCE);
	const problems = [...checkSource(brand)];
	if (problems.length > 0) return problems;

	const primary = brand.domains.primary;
	const primaryHosts = new Set(Object.values(primary));
	const brandApexes = [primary.apex, ...brand.domains.legacy.map((group) => group.apex)];
	const primaryEmails = new Set(Object.values(brand.emails));

	const manifest = readJson("apps/terminal/public/manifest.json");
	for (const field of ["name", "short_name"]) {
		if (manifest[field] !== brand.name.display) {
			problems.push(`apps/terminal/public/manifest.json ${field} is ${JSON.stringify(manifest[field])}, expected ${JSON.stringify(brand.name.display)}`);
		}
	}
	for (const [field, expected] of [
		["theme_color", brand.pwa.themeColor],
		["background_color", brand.pwa.backgroundColor],
	]) {
		if (manifest[field]?.toLowerCase() !== expected.toLowerCase()) {
			problems.push(`apps/terminal/public/manifest.json ${field} is ${manifest[field]}, expected ${expected}`);
		}
	}

	const sitemapHosts = [...readText("apps/terminal/public/sitemap.xml").matchAll(/<loc>([^<]+)<\/loc>/g)].flatMap((match) =>
		urlHosts(match[1]),
	);
	if (sitemapHosts.length === 0) problems.push("apps/terminal/public/sitemap.xml lists no URLs");
	for (const host of sitemapHosts) {
		if (host !== primary.app) problems.push(`apps/terminal/public/sitemap.xml lists ${host}, expected only ${primary.app}`);
	}
	expectSitemapLine(problems, "apps/terminal/public/robots.txt", `https://${primary.app}/sitemap.xml`);
	expectSitemapLine(problems, "apps/website/public/robots.txt", `https://${primary.apex}/sitemap-index.xml`);

	for (const file of listFiles("legal").filter((path) => path.endsWith(".md"))) {
		const text = readText(file);
		for (const host of urlHosts(text)) {
			if (isBrandHost(host, brandApexes) && !primaryHosts.has(host)) {
				problems.push(`${file} links ${host}, which is not a primary brand host`);
			}
		}
		for (const email of emails(text)) {
			if (isBrandHost(email.split("@")[1], brandApexes) && !primaryEmails.has(email)) {
				problems.push(`${file} names ${email}, which is not a primary brand mailbox`);
			}
		}
	}
	if (!readText("legal/terms.md").includes(brand.name.legalEntity)) {
		problems.push(`legal/terms.md does not name the legal entity ${brand.name.legalEntity}`);
	}

	problems.push(...checkLoaderProvenance());
	problems.push(...checkSyncedAssets(brand));
	return problems;
}

function checkSyncedAssets(brand) {
	const problems = [];
	let expectedGeometry;
	try {
		expectedGeometry = renderLogoGeometry(brand);
	} catch (error) {
		return [error.message];
	}
	const actualGeometry = readTextIfPresent(LOGO_GEOMETRY_OUTPUT);
	if (actualGeometry !== expectedGeometry) problems.push(`${LOGO_GEOMETRY_OUTPUT} is out of date; run pnpm brand:sync`);
	let statusMotion;
	try {
		statusMotion = renderStatusMotion(markGeometry());
	} catch (error) {
		return [...problems, error.message];
	}
	for (const [output, expected] of [
		[STATUS_MOTION_OUTPUT, statusMotion.ts],
		[STATUS_MOTION_CSS_OUTPUT, statusMotion.css],
	]) {
		if (readTextIfPresent(output) !== expected) problems.push(`${output} is out of date; run pnpm brand:sync`);
	}
	for (const [source, target] of SYNCED_FILES) {
		const expected = readFileSync(resolve(REPOSITORY_ROOT, source));
		const actual = readBufferIfPresent(target);
		if (!actual) problems.push(`${target} is missing; run pnpm brand:sync`);
		else if (!expected.equals(actual)) problems.push(`${target} differs from ${source}; run pnpm brand:sync`);
	}
	for (const [path, [width, height]] of Object.entries(PNG_SIZES)) {
		const png = readFileSync(resolve(REPOSITORY_ROOT, path));
		if (png.toString("ascii", 12, 16) !== "IHDR" || png.readUInt32BE(16) !== width || png.readUInt32BE(20) !== height) {
			problems.push(`${path} must be a ${width}×${height} PNG`);
		}
		if (OPAQUE_PNGS.includes(path) && png[25] !== 2) problems.push(`${path} must be an opaque RGB PNG`);
	}
	return problems;
}

function checkSource(brand) {
	const problems = [];
	const requireString = (path, value) => {
		if (typeof value !== "string" || value.trim() === "" || value !== value.trim()) {
			problems.push(`${BRAND_SOURCE} ${path} must be a non-empty trimmed string`);
		}
	};
	requireString("name.display", brand?.name?.display);
	requireString("name.lowercase", brand?.name?.lowercase);
	requireString("name.legalEntity", brand?.name?.legalEntity);
	if (brand?.name?.lowercase !== brand?.name?.lowercase?.toLowerCase()) {
		problems.push(`${BRAND_SOURCE} name.lowercase must be lowercase`);
	}

	const groups = [
		["domains.primary", brand?.domains?.primary],
		...(Array.isArray(brand?.domains?.legacy) ? brand.domains.legacy : [null]).map((group, index) => [
			`domains.legacy[${index}]`,
			group,
		]),
	];
	const seenHosts = new Map();
	for (const [path, group] of groups) {
		if (!group) {
			problems.push(`${BRAND_SOURCE} ${path} is missing`);
			continue;
		}
		for (const key of ["apex", "www", "app", "testnet"]) {
			const host = group[key];
			requireString(`${path}.${key}`, host);
			if (typeof host !== "string") continue;
			if (host !== host.toLowerCase()) problems.push(`${BRAND_SOURCE} ${path}.${key} must be lowercase`);
			if (key !== "apex" && host !== `${key === "www" ? "www" : key}.${group.apex}`) {
				problems.push(`${BRAND_SOURCE} ${path}.${key} must be ${key}.${group.apex}`);
			}
			if (seenHosts.has(host)) problems.push(`${BRAND_SOURCE} ${host} appears in ${seenHosts.get(host)} and ${path}`);
			seenHosts.set(host, path);
		}
	}

	for (const [key, email] of Object.entries(brand?.emails ?? {})) {
		requireString(`emails.${key}`, email);
		if (typeof email === "string" && !email.endsWith(`@${brand?.domains?.primary?.apex}`)) {
			problems.push(`${BRAND_SOURCE} emails.${key} must use the primary apex domain`);
		}
	}
	if (!brand?.emails?.support) problems.push(`${BRAND_SOURCE} emails.support is missing`);
	return problems;
}

function checkLoaderProvenance() {
	return [
		...checkExportProvenance(LOADER_DIRECTORY, []),
		...checkExportProvenance(LOADER_SUPPLEMENT_DIRECTORY, ["README.md", "definitions.js"]),
	];
}

function checkExportProvenance(directory, sourceFiles) {
	const problems = [];
	const provenance = readJson(`${directory}/PROVENANCE.json`);
	if (sha256(readFileSync(resolve(REPOSITORY_ROOT, provenance.source))) !== provenance.sourceSha256) {
		problems.push(`${provenance.source} changed since ${directory} was exported; rerun scripts/brand-export-motion.mjs`);
	}
	if (provenance.definitions && sha256(readFileSync(resolve(REPOSITORY_ROOT, provenance.definitions))) !== provenance.definitionsSha256) {
		problems.push(`${provenance.definitions} changed since ${directory} was exported; rerun scripts/brand-export-motion.mjs`);
	}
	const recorded = new Map(Object.entries(provenance.files));
	for (const file of listFiles(directory)) {
		const name = relative(directory, file).split(sep).join("/");
		if (name === "PROVENANCE.json" || sourceFiles.includes(name)) continue;
		const expected = recorded.get(name);
		recorded.delete(name);
		if (!expected) problems.push(`${file} is not part of the recorded motion export`);
		else if (sha256(readFileSync(resolve(REPOSITORY_ROOT, file))) !== expected) {
			problems.push(`${file} differs from the recorded motion export`);
		}
	}
	for (const missing of recorded.keys()) problems.push(`${directory}/${missing} is missing`);
	return problems;
}

function expectSitemapLine(problems, file, expected) {
	const lines = readText(file)
		.split("\n")
		.filter((line) => line.toLowerCase().startsWith("sitemap:"));
	if (lines.length !== 1 || lines[0].slice("sitemap:".length).trim() !== expected) {
		problems.push(`${file} must declare exactly one sitemap at ${expected}`);
	}
}

function isBrandHost(host, apexes) {
	return apexes.some((apex) => host === apex || host.endsWith(`.${apex}`));
}

function urlHosts(text) {
	return [...text.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map((match) => match[1].toLowerCase().replace(/\.$/, ""));
}

function emails(text) {
	return [...text.matchAll(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)].map((match) => match[0].toLowerCase());
}

function listFiles(directory) {
	return readdirSync(resolve(REPOSITORY_ROOT, directory), { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile() && entry.name !== ".DS_Store")
		.map((entry) => relative(REPOSITORY_ROOT, join(entry.parentPath ?? entry.path, entry.name)).split(sep).join("/"));
}

function readTextIfPresent(path) {
	try {
		return readText(path);
	} catch {
		return null;
	}
}

function readBufferIfPresent(path) {
	try {
		return readFileSync(resolve(REPOSITORY_ROOT, path));
	} catch {
		return null;
	}
}

function readJson(path) {
	return JSON.parse(readText(path));
}

function readText(path) {
	return readFileSync(resolve(REPOSITORY_ROOT, path), "utf8");
}

function sha256(buffer) {
	return createHash("sha256").update(buffer).digest("hex");
}
