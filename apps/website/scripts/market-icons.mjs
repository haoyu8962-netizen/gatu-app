#!/usr/bin/env node
// Copies the icon of every market the site renders (getRenderedMarketCoins) from the source the terminal uses into
// src/assets/coins/, sanitized, and records source and fetch time in src/data/market-icons.json. A market whose icon
// the source does not serve, or whose file fails the sanitizer, is recorded as a fallback and shows its monogram.
// Each icon is then optimized without visible change (embedded rasters downscaled to RASTER_MAX_PX, path numbers
// rounded to a two-hundredth of a pixel at that size, svgo, sanitized again) and measured on the dark window colour: a
// mostly transparent mark that shows less ink on the dark window than on white is drawn on the backplate.
// markets:snapshot runs this after writing a new snapshot; run it alone to refresh the icons of the committed one,
// or with --reprocess to optimize and measure the committed files again without fetching:
//
//   pnpm --filter @sairn/website markets:icons [--reprocess]
//
// The optimizer and the measurement use the sharp and svgo that Astro installs (found through the pnpm virtual
// store), so the website gains no dependency of its own.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { coinOfMarketIconFileName, MARKET_ICON_SOURCE_BASE_URL, marketIconFileName, marketIconSourceUrl } from "../src/lib/markets/icons.ts";
import { sanitizeSvg } from "./svg-sanitize.mjs";

const WEBSITE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const ICON_DIRECTORY = resolve(WEBSITE_ROOT, "src/assets/coins");
export const ICON_MANIFEST_PATH = resolve(WEBSITE_ROOT, "src/data/market-icons.json");
const REQUEST_SPACING_MS = 100;
const REQUEST_TIMEOUT_MS = 15_000;
const VIRTUAL_STORE = resolve(WEBSITE_ROOT, "../../node_modules/.pnpm/node_modules");

/** MarketIcon draws an icon at 20, 24 or 28 CSS pixels; rasters and rounding are judged at twice the largest. */
export const ICON_MAX_DISPLAY_PX = 28;
export const RASTER_MAX_PX = 2 * ICON_MAX_DISPLAY_PX;
/** Largest rounding error a path coordinate may take, in pixels at RASTER_MAX_PX. */
const ROUNDING_TOLERANCE_PX = 1 / 200;
/** Per-file and total byte budgets for src/assets/coins (tests/market-icons.test.mjs). */
export const ICON_BYTES_BUDGET = 8 * 1024;
export const ICON_TOTAL_BYTES_BUDGET = 64 * 1024;
/** Files allowed above ICON_BYTES_BUDGET, with the reason; empty while every icon fits. */
export const ICON_BYTES_EXCEPTIONS = {};

/** The dark product window (#0F1A1F) the backplate decision is measured against, and the white it is compared with. */
export const DARK_SURFACE = [0x0f, 0x1a, 0x1f];
const WHITE = [255, 255, 255];
/** Share of the disc that must be transparent before a backplate can make any difference. */
export const BACKPLATE_MIN_TRANSPARENT_SHARE = 0.25;
/** Coins whose measured decision is overridden, with the reason; empty while the rule decides every icon. */
export const BACKPLATE_OVERRIDES = {};

function loadFromVirtualStore(name) {
	const entry = resolve(VIRTUAL_STORE, name, "package.json");
	if (!existsSync(entry)) throw new Error(`markets:icons: ${name} is not in the pnpm virtual store (${entry}); run pnpm install`);
	return createRequire(entry)(name);
}

/** True when sharp and svgo can be loaded, so tests that render icons can say why they skip. */
export function iconToolsAvailable() {
	return ["sharp", "svgo"].every((name) => existsSync(resolve(VIRTUAL_STORE, name, "package.json")));
}

function viewBoxSize(svg) {
	const viewBox = /<svg\b[^>]*?\sviewBox="([^"]+)"/.exec(svg)?.[1];
	if (!viewBox) throw new Error("markets:icons: the icon has no viewBox");
	const [, , width, height] = viewBox.trim().split(/[\s,]+/).map(Number);
	return Math.max(width, height);
}

/** Decimal places that keep a coordinate within ROUNDING_TOLERANCE_PX of where it was at RASTER_MAX_PX. */
export function floatPrecisionFor(viewBoxExtent) {
	const tolerance = (viewBoxExtent / RASTER_MAX_PX) * ROUNDING_TOLERANCE_PX;
	return Math.min(3, Math.max(0, Math.ceil(-Math.log10(tolerance))));
}

const RASTER_HREF = /(href=")data:image\/(png|jpeg|gif|webp);base64,([A-Za-z0-9+/=\s]+)(")/g;

async function downscaleRasters(svg) {
	const sharp = loadFromVirtualStore("sharp");
	let output = svg;
	for (const match of [...svg.matchAll(RASTER_HREF)]) {
		const [whole, open, , base64, close] = match;
		const source = Buffer.from(base64.replace(/\s/g, ""), "base64");
		const { width, height } = await sharp(source).metadata();
		if (Math.max(width, height) <= RASTER_MAX_PX) continue;
		const png = await sharp(source)
			.resize({ width: RASTER_MAX_PX, height: RASTER_MAX_PX, fit: "inside", kernel: "lanczos3" })
			.png({ compressionLevel: 9, adaptiveFiltering: true })
			.toBuffer();
		output = output.replace(whole, `${open}data:image/png;base64,${png.toString("base64")}${close}`);
	}
	return output;
}

/**
 * The committed form of a sanitized icon: rasters no larger than RASTER_MAX_PX, numbers rounded within
 * ROUNDING_TOLERANCE_PX, svgo's default cleanup (viewBox and the drawing kept), then sanitized again so the
 * file stays the sanitizer's own output.
 */
export async function optimizeMarketIcon(svg) {
	const { optimize } = loadFromVirtualStore("svgo");
	const withRasters = await downscaleRasters(svg);
	const { data } = optimize(withRasters, {
		multipass: true,
		floatPrecision: floatPrecisionFor(viewBoxSize(withRasters)),
		plugins: ["preset-default"],
	});
	const optimized = data.length < withRasters.length ? data : withRasters;
	return sanitizeSvg(optimized).svg;
}

function linear(channel) {
	const value = channel / 255;
	return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function contrast(a, b) {
	const [high, low] = [a, b]
		.map(([r, g, bl]) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(bl))
		.sort((x, y) => y - x);
	return (high + 0.05) / (low + 0.05);
}

/**
 * Renders the icon at RASTER_MAX_PX and reads the disc MarketIcon shows: the share that is transparent, and the
 * share whose colour, composited over the dark window or over white, stands out from it at 3:1 or more.
 */
export async function measureMarketIcon(svg) {
	const sharp = loadFromVirtualStore("sharp");
	const size = RASTER_MAX_PX;
	const density = (72 * size * 4) / viewBoxSize(svg);
	const { data } = await sharp(Buffer.from(svg), { density })
		.resize(size, size, { fit: "cover" })
		.ensureAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });
	let disc = 0;
	let transparent = 0;
	let inkOnDark = 0;
	let inkOnWhite = 0;
	const radius = size / 2 - 1;
	for (let y = 0; y < size; y += 1) {
		for (let x = 0; x < size; x += 1) {
			if ((x + 0.5 - size / 2) ** 2 + (y + 0.5 - size / 2) ** 2 > radius ** 2) continue;
			disc += 1;
			const index = (y * size + x) * 4;
			const alpha = data[index + 3] / 255;
			if (alpha < 0.5) transparent += 1;
			const over = (surface) => surface.map((channel, offset) => alpha * data[index + offset] + (1 - alpha) * channel);
			if (contrast(over(DARK_SURFACE), DARK_SURFACE) >= 3) inkOnDark += 1;
			if (contrast(over(WHITE), WHITE) >= 3) inkOnWhite += 1;
		}
	}
	const share = (count) => Math.round((count / disc) * 100) / 100;
	return { transparentShare: share(transparent), inkOnDark: share(inkOnDark), inkOnWhite: share(inkOnWhite) };
}

/** A mostly transparent mark that shows less ink on the dark window than on white needs the backplate. */
export function needsBackplate({ transparentShare, inkOnDark, inkOnWhite }) {
	return transparentShare >= BACKPLATE_MIN_TRANSPARENT_SHARE && inkOnDark < inkOnWhite;
}

export function backplateFor(coin, surface) {
	return BACKPLATE_OVERRIDES[coin]?.backplate ?? needsBackplate(surface);
}

/** Optimizes a sanitized icon and returns its manifest fields. */
export async function finishMarketIcon(coin, svg) {
	const optimized = await optimizeMarketIcon(svg);
	const surface = await measureMarketIcon(optimized);
	return { svg: optimized, surface, backplate: backplateFor(coin, surface) };
}

function sleep(ms) {
	return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

/** Throws when two coins would share a file on a case-insensitive filesystem. */
export function assertDistinctFileNames(coins) {
	const seen = new Map();
	for (const coin of coins) {
		const key = marketIconFileName(coin).toLowerCase();
		if (seen.has(key)) throw new Error(`markets:icons: ${seen.get(key)} and ${coin} map to the same file name`);
		seen.set(key, coin);
	}
}

/**
 * The outcome for one coin: `{ svg, removed }` for a usable icon, `{ reason }` for a monogram fallback. Throws on a
 * network failure or a server error, so an unreachable source never replaces committed icons with monograms.
 */
export async function fetchMarketIcon(coin, fetchImpl = fetch) {
	const url = marketIconSourceUrl(coin);
	const response = await fetchImpl(url, { redirect: "error", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
	if (response.status === 404) return { reason: "HTTP 404" };
	if (!response.ok) throw new Error(`markets:icons: ${url} returned HTTP ${response.status}`);
	const type = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
	// The source answers a missing icon with its app page (HTTP 200, text/html) rather than a 404.
	if (type !== "image/svg+xml") return { reason: `no icon (served ${type || "no content type"})` };
	try {
		return sanitizeSvg(await response.text());
	} catch (error) {
		return { reason: `rejected: ${error instanceof Error ? error.message : error}` };
	}
}

function writeIfChanged(path, text) {
	let current;
	try {
		current = readFileSync(path, "utf8");
	} catch {}
	if (current !== text) writeFileSync(path, text);
}

const SOURCE_DESCRIPTION = `GET ${MARKET_ICON_SOURCE_BASE_URL}/<coin>.svg (the terminal's TOKEN_ICON_BASE_URL), sanitized by scripts/svg-sanitize.mjs and optimized by scripts/market-icons.mjs`;

/** Optimizes and measures the committed icons again, keeping their recorded source and fetch time. */
export async function reprocessMarketIcons({ log = console.log } = {}) {
	const current = JSON.parse(readFileSync(ICON_MANIFEST_PATH, "utf8"));
	const icons = [];
	for (const icon of current.icons) {
		const path = resolve(ICON_DIRECTORY, icon.file);
		const before = readFileSync(path, "utf8");
		const { svg, surface, backplate } = await finishMarketIcon(icon.coin, before);
		writeIfChanged(path, svg);
		const bytes = Buffer.byteLength(svg, "utf8");
		const { removed } = icon;
		icons.push({ coin: icon.coin, file: icon.file, sourceUrl: icon.sourceUrl, bytes, backplate, surface, ...(removed ? { removed } : {}) });
		log(`${icon.file}: ${Buffer.byteLength(before, "utf8")} -> ${bytes} B${backplate ? ", backplate" : ""}`);
	}
	const manifest = { ...current, schemaVersion: 2, source: SOURCE_DESCRIPTION, icons };
	writeFileSync(ICON_MANIFEST_PATH, `${JSON.stringify(manifest, null, "\t")}\n`);
	return manifest;
}

export async function vendorMarketIcons({ log = console.log } = {}) {
	// Imported here so markets:snapshot can run this after writing the snapshot that structure.ts reads.
	const { getRenderedMarketCoins } = await import("../src/lib/markets/structure.ts");
	const coins = getRenderedMarketCoins();
	assertDistinctFileNames(coins);

	const icons = [];
	const fallbacks = [];
	const files = new Map();
	for (const coin of coins) {
		const outcome = await fetchMarketIcon(coin);
		const sourceUrl = marketIconSourceUrl(coin);
		if ("reason" in outcome) fallbacks.push({ coin, sourceUrl, reason: outcome.reason });
		else {
			const file = marketIconFileName(coin);
			const { svg, surface, backplate } = await finishMarketIcon(coin, outcome.svg);
			files.set(file, svg);
			icons.push({ coin, file, sourceUrl, bytes: Buffer.byteLength(svg, "utf8"), backplate, surface, ...(outcome.removed.length > 0 ? { removed: outcome.removed } : {}) });
		}
		await sleep(REQUEST_SPACING_MS);
	}

	mkdirSync(ICON_DIRECTORY, { recursive: true });
	for (const name of readdirSync(ICON_DIRECTORY)) {
		if (coinOfMarketIconFileName(name) !== undefined && !files.has(name)) rmSync(resolve(ICON_DIRECTORY, name));
	}
	for (const [name, svg] of files) writeIfChanged(resolve(ICON_DIRECTORY, name), svg);

	const manifest = {
		schemaVersion: 2,
		fetchedAt: new Date().toISOString(),
		source: SOURCE_DESCRIPTION,
		icons,
		fallbacks,
	};
	writeFileSync(ICON_MANIFEST_PATH, `${JSON.stringify(manifest, null, "\t")}\n`);
	log(`wrote ${icons.length} icons to ${ICON_DIRECTORY} and ${ICON_MANIFEST_PATH} (fetchedAt ${manifest.fetchedAt})`);
	for (const icon of icons) if (icon.removed) log(`  ! ${icon.coin}: removed ${icon.removed.join(", ")}`);
	for (const fallback of fallbacks) log(`  monogram ${fallback.coin}: ${fallback.reason}`);
	return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	(process.argv.includes("--reprocess") ? reprocessMarketIcons() : vendorMarketIcons()).catch((error) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	});
}
