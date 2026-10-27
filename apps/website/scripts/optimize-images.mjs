// Encodes the captured JPEGs that the home page shows into AVIF and WebP next to their sources, so the build
// ships small images without an image service at build time. The hero keeps its JPEG as the <img> fallback; its
// AVIF renditions must stay within plan §8's first-screen budget (phone ≤45 KB, desktop ≤80 KB), which
// tests/built/home-layout.test.mjs checks on the build.
//
//   node apps/website/scripts/optimize-images.mjs
//
// Run it after scripts/capture-hero.mjs or scripts/capture-features.mjs. It uses the sharp that Astro installs as an optional
// dependency (found through the pnpm virtual store), so the website gains no dependency of its own.

import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WEBSITE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = resolve(WEBSITE_ROOT, "../..");
const SHARP_ENTRY = resolve(REPO_ROOT, "node_modules/.pnpm/node_modules/sharp/package.json");
if (!existsSync(SHARP_ENTRY)) throw new Error(`sharp is not in the pnpm virtual store (${SHARP_ENTRY}); run pnpm install`);
const sharp = createRequire(SHARP_ENTRY)("sharp");

/**
 * Source JPEG (relative to src/assets), the widest rendition the page needs in device pixels and, where the page
 * shows only part of a capture, the region to keep (device pixels of the source).
 */
const IMAGES = [
	{ file: "terminal-desktop.jpeg", width: 1600 },
	{ file: "terminal-mobile.jpeg", width: 780 },
	// The Arabic phone capture is cropped to its right-to-left header, market header, order form and book (the top
	// 380 CSS px), so the page can show that part large enough to read instead of shrinking the whole phone.
	{ file: "features/language.jpeg", width: 780, extract: { left: 0, top: 0, width: 780, height: 760 } },
	{ file: "features/email.jpeg", width: 660 },
	{ file: "features/tpsl.jpeg", width: 660 },
	{ file: "features/workspace.jpeg", width: 1600 },
	{ file: "features/phone.jpeg", width: 780 },
	{ file: "features/more.jpeg", width: 1600 },
	{ file: "open-book/btc-desktop.jpg", width: 1456 },
	{ file: "open-book/btc-mobile.jpg", width: 750 },
];

for (const { file, width, extract } of IMAGES) {
	const source = resolve(WEBSITE_ROOT, "src/assets", file);
	const base = source.replace(/\.jpe?g$/, "");
	const image = (extract ? sharp(source).extract(extract) : sharp(source)).resize({ width, withoutEnlargement: true });
	const avif = await image.clone().avif({ quality: 58, effort: 6 }).toFile(`${base}.avif`);
	const webp = await image.clone().webp({ quality: 78 }).toFile(`${base}.webp`);
	console.log(`${file}: avif ${avif.width}×${avif.height} ${avif.size} B, webp ${webp.size} B`);
}
