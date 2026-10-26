// Encodes the captured JPEGs that the home page shows below the fold into AVIF and WebP next to their
// sources, so the build ships small images without an image service at build time.
//
//   node apps/website/scripts/optimize-images.mjs
//
// Run it after scripts/capture-features.mjs. It uses the sharp that Astro installs as an optional
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

/** Source JPEG (relative to src/assets) and the widest rendition the page needs, in device pixels. */
const IMAGES = [
	{ file: "features/language.jpeg", width: 780 },
	{ file: "features/email.jpeg", width: 660 },
	{ file: "features/tpsl.jpeg", width: 660 },
	{ file: "features/workspace.jpeg", width: 1600 },
	{ file: "features/phone.jpeg", width: 780 },
	{ file: "features/more.jpeg", width: 1600 },
	{ file: "open-book/btc-desktop.jpg", width: 1456 },
	{ file: "open-book/btc-mobile.jpg", width: 750 },
];

for (const { file, width } of IMAGES) {
	const source = resolve(WEBSITE_ROOT, "src/assets", file);
	const base = source.replace(/\.jpe?g$/, "");
	const image = sharp(source).resize({ width, withoutEnlargement: true });
	const avif = await image.clone().avif({ quality: 58, effort: 6 }).toFile(`${base}.avif`);
	const webp = await image.clone().webp({ quality: 78 }).toFile(`${base}.webp`);
	console.log(`${file}: avif ${avif.width}×${avif.height} ${avif.size} B, webp ${webp.size} B`);
}
