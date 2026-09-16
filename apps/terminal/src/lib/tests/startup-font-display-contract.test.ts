import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MARKET_CLOSE_FONT_SPECS, STARTUP_FONT_SPECS } from "@/lib/fonts/font-readiness";

const stylesCss = readFileSync(resolve(__dirname, "../../styles.css"), "utf8");
const rootRoute = readFileSync(resolve(__dirname, "../../routes/__root.tsx"), "utf8");
const fontFaces = stylesCss.match(/@font-face \{[^}]*\}/g) ?? [];

function readDescriptor(face: string, name: string) {
	return face.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1]?.trim();
}

describe("startup font display contract", () => {
	it("declares every application webfont with font-display: block", () => {
		expect(fontFaces.length).toBeGreaterThan(0);
		for (const face of fontFaces) {
			expect(readDescriptor(face, "font-display")).toBe("block");
		}
		expect(stylesCss).not.toMatch(/@import\s+"@fontsource/);
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
});
