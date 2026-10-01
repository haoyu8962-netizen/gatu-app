import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MARK_SOURCE = "brand/svg/mark/sairn-mark-on-dark.svg";
const LOCKUP_SOURCE = "brand/svg/lockup/sairn-lockup-on-light.svg";
const ICON_SVG_OUTPUT = "brand/web/icon.svg";
const MASKABLE_192_OUTPUT = "brand/web/icon-maskable-192.png";
// Privy's dashboard logo appears in login e-mails: PNG only, 2:1, 180×90 recommended (rendered here at 2×).
// E-mail clients may show a dark background, so the light lockup sits on an opaque white plate.
const EMAIL_LOGO_OUTPUT = "brand/web/email-logo.png";
const EMAIL_LOGO = { width: 360, height: 180, lockupWidthRatio: 0.8, background: "#FFFFFF" };

const ICON_BACKGROUND = JSON.parse(readFileSync(resolve(REPOSITORY_ROOT, "brand/brand.json"), "utf8")).logo
	.iconBackground;

// Geometry measured from the designer's brand/web/icon-512.png and icon-maskable-512.png:
// the "any" icon is a 472 px rounded square inset 20 px with the mark at 60.2 % of the visible height,
// the maskable icon is full-bleed with the mark at 60.2 % of the canvas, both centred.
const ANY_ICON = { canvas: 512, inset: 20, radius: 106, markHeightRatio: 284 / 472 };
const MASKABLE_ICON = { canvas: 512, markHeightRatio: 308 / 512 };

const mark = readMark();

writeFileSync(resolve(REPOSITORY_ROOT, ICON_SVG_OUTPUT), anyIconSvg());
await renderPng(maskableIconSvg(), 192, resolve(REPOSITORY_ROOT, MASKABLE_192_OUTPUT));
await renderEmailLogo(resolve(REPOSITORY_ROOT, EMAIL_LOGO_OUTPUT));
console.log(`Wrote ${ICON_SVG_OUTPUT}, ${MASKABLE_192_OUTPUT} and ${EMAIL_LOGO_OUTPUT}.`);

function readMark() {
	const source = readFileSync(resolve(REPOSITORY_ROOT, MARK_SOURCE), "utf8");
	const viewBox = /viewBox="([^"]+)"/.exec(source)?.[1].split(/\s+/).map(Number);
	const paths = [...source.matchAll(/<path fill="(#[0-9A-Fa-f]{6})" d="([^"]+)"\/>/g)].map((match) => ({
		fill: match[1],
		d: match[2],
	}));
	if (!viewBox || viewBox.length !== 4 || paths.length !== 2) {
		throw new Error(`${MARK_SOURCE} no longer has the expected viewBox and two filled paths.`);
	}
	const [x, y, width, height] = viewBox;
	return { x, y, width, height, paths };
}

function markGroup(canvas, markHeight) {
	const scale = markHeight / mark.height;
	const translateX = canvas / 2 - (mark.x + mark.width / 2) * scale;
	const translateY = canvas / 2 - (mark.y + mark.height / 2) * scale;
	const paths = mark.paths.map((path) => `<path fill="${path.fill}" d="${path.d}"/>`).join("");
	return `<g transform="translate(${round(translateX)} ${round(translateY)}) scale(${round(scale)})">${paths}</g>`;
}

function anyIconSvg() {
	const { canvas, inset, radius, markHeightRatio } = ANY_ICON;
	const visible = canvas - inset * 2;
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvas} ${canvas}"><rect x="${inset}" y="${inset}" width="${visible}" height="${visible}" rx="${radius}" fill="${ICON_BACKGROUND}"/>${markGroup(canvas, visible * markHeightRatio)}</svg>\n`;
}

function maskableIconSvg() {
	const { canvas, markHeightRatio } = MASKABLE_ICON;
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvas} ${canvas}"><rect width="${canvas}" height="${canvas}" fill="${ICON_BACKGROUND}"/>${markGroup(canvas, canvas * markHeightRatio)}</svg>`;
}

async function renderPng(svg, size, output) {
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
		await page.setContent(
			`<!doctype html><html><body style="margin:0;background:${ICON_BACKGROUND}"><img id="icon" width="${size}" height="${size}" style="display:block" src="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}"></body></html>`,
		);
		await page.locator("#icon").evaluate((image) => image.decode());
		await page.screenshot({ path: output, clip: { x: 0, y: 0, width: size, height: size }, omitBackground: false });
	} finally {
		await browser.close();
	}
}

async function renderEmailLogo(output) {
	const { width, height, lockupWidthRatio, background } = EMAIL_LOGO;
	const lockup = readFileSync(resolve(REPOSITORY_ROOT, LOCKUP_SOURCE), "utf8");
	const lockupWidth = Math.round(width * lockupWidthRatio);
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
		await page.setContent(
			`<!doctype html><html><body style="margin:0;width:${width}px;height:${height}px;display:flex;align-items:center;justify-content:center;background:${background}"><img id="lockup" width="${lockupWidth}" style="display:block;height:auto" src="data:image/svg+xml;base64,${Buffer.from(lockup).toString("base64")}"></body></html>`,
		);
		await page.locator("#lockup").evaluate((image) => image.decode());
		await page.screenshot({ path: output, clip: { x: 0, y: 0, width, height }, omitBackground: false });
	} finally {
		await browser.close();
	}
}

function round(value) {
	return Number(value.toFixed(4));
}
