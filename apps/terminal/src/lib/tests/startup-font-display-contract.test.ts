import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MARKET_CLOSE_FONT_SPECS, STARTUP_FONT_SPECS } from "@/lib/fonts/font-readiness";

const SOURCE_ROOT = resolve(__dirname, "../..");
const UI_SOURCE_ROOT = resolve(__dirname, "../../../../../packages/ui/src");
const stylesCss = readFileSync(resolve(SOURCE_ROOT, "styles.css"), "utf8");
const rootRoute = readFileSync(resolve(SOURCE_ROOT, "routes/__root.tsx"), "utf8");

// Stylesheets an application page loads besides those listed here come only from these imports; any
// other `@import` could bring its own font faces and is reviewed here first.
const REVIEWED_CSS_IMPORTS = new Set([
	'"tailwindcss"',
	'"tw-animate-css"',
	'"@sairn/ui/globals.css"',
	'"react-grid-layout/css/styles.css"',
	'"./lib/brand/status-motion.gen.css" layer(components)',
]);

function listStylesheets(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) return entry.name === "node_modules" ? [] : listStylesheets(path);
		return entry.name.endsWith(".css") ? [path] : [];
	});
}

const STYLESHEETS = [...listStylesheets(SOURCE_ROOT), ...listStylesheets(UI_SOURCE_ROOT)].map((path) => ({
	file: relative(resolve(SOURCE_ROOT, "../../.."), path),
	source: readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, ""),
}));

function readFontFaces(source: string): string[] {
	return source.match(/@font-face\s*\{[^}]*\}/gi) ?? [];
}

const fontFaces = STYLESHEETS.flatMap(({ source }) => readFontFaces(source));

function readDescriptor(face: string, name: string) {
	return face.match(new RegExp(`${name}\\s*:\\s*([^;}]+)[;}]`, "i"))?.[1]?.trim();
}

describe("startup font display contract", () => {
	it("scans the terminal's and the UI package's stylesheets", () => {
		const files = STYLESHEETS.map(({ file }) => file);
		expect(files).toContain("apps/terminal/src/styles.css");
		expect(files).toContain("packages/ui/src/globals.css");
	});

	it("declares every application webfont with font-display: block", () => {
		expect(fontFaces.length).toBeGreaterThan(0);
		for (const face of fontFaces) {
			expect(readDescriptor(face, "font-display"), face).toBe("block");
		}
		for (const { file, source } of STYLESHEETS) {
			expect(source, file).not.toMatch(/@import\s+(?:url\()?["']?@fontsource/);
			expect(source.match(/@font-face/gi)?.length ?? 0, `${file}: a font face the scanner cannot read`).toBe(
				readFontFaces(source).length,
			);
		}
	});

	it("imports no stylesheet that has not been reviewed for font faces", () => {
		for (const { file, source } of STYLESHEETS) {
			for (const match of source.matchAll(/@import\s+([^;]+);/g)) {
				expect(REVIEWED_CSS_IMPORTS.has(match[1].trim()), `${file}: @import ${match[1]}`).toBe(true);
			}
		}
	});

	it("keeps the Inter and IBM Plex families that the startup gate waits for", () => {
		const families = new Set(fontFaces.map((face) => readDescriptor(face, "font-family")));
		expect(families).toEqual(new Set(['"Inter Variable"', '"IBM Plex Sans Variable"']));
		for (const spec of [...STARTUP_FONT_SPECS, ...MARKET_CLOSE_FONT_SPECS]) {
			const family = spec.slice(spec.indexOf('"'));
			expect(families.has(family)).toBe(true);
		}
	});

	it("preloads the latin faces the first paint depends on", () => {
		for (const file of ["inter-latin-wght-normal.woff2", "ibm-plex-sans-latin-wght-normal.woff2"]) {
			expect(stylesCss).toContain(`/files/${file}`);
			expect(rootRoute).toContain(`/files/${file}?url`);
		}
	});

	it("reads a face however it is spaced", () => {
		const faces = readFontFaces(
			'@font-face{font-family:"X";font-display:swap}\n@FONT-FACE {\n  font-display: block;\n}',
		);
		expect(faces.map((face) => readDescriptor(face, "font-display"))).toEqual(["swap", "block"]);
	});
});
