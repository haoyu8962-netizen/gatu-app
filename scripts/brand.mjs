import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BRAND_SOURCE = "brand/brand.json";
const LOADER_DIRECTORY = "brand/loader";

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== "--check")) {
	console.error("Usage: node scripts/brand.mjs [--check]");
	process.exit(2);
}

const problems = checkBrand();
if (problems.length > 0) {
	console.error(`Brand check found ${problems.length} problem(s):`);
	for (const problem of problems) console.error(`  - ${problem}`);
	process.exitCode = 1;
} else {
	console.log("Brand check passed.");
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
	const problems = [];
	const provenance = readJson(`${LOADER_DIRECTORY}/PROVENANCE.json`);
	if (sha256(readFileSync(resolve(REPOSITORY_ROOT, provenance.source))) !== provenance.sourceSha256) {
		problems.push(`${provenance.source} changed since ${LOADER_DIRECTORY} was exported; rerun scripts/brand-export-motion.mjs`);
	}
	const recorded = new Map(Object.entries(provenance.files));
	for (const file of listFiles(LOADER_DIRECTORY)) {
		const name = relative(LOADER_DIRECTORY, file).split(sep).join("/");
		if (name === "PROVENANCE.json") continue;
		const expected = recorded.get(name);
		recorded.delete(name);
		if (!expected) problems.push(`${file} is not part of the recorded motion export`);
		else if (sha256(readFileSync(resolve(REPOSITORY_ROOT, file))) !== expected) {
			problems.push(`${file} differs from the recorded motion export`);
		}
	}
	for (const missing of recorded.keys()) problems.push(`${LOADER_DIRECTORY}/${missing} is missing`);
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

function readJson(path) {
	return JSON.parse(readText(path));
}

function readText(path) {
	return readFileSync(resolve(REPOSITORY_ROOT, path), "utf8");
}

function sha256(buffer) {
	return createHash("sha256").update(buffer).digest("hex");
}
