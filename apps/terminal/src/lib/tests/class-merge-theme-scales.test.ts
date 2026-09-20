import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
	FONT_FAMILY_SCALE,
	RADIUS_SCALE as TERMINAL_RADIUS_SCALE,
	SHADOW_SCALE as TERMINAL_SHADOW_SCALE,
	cn as terminalCn,
} from "@/lib/cn";
import {
	RADIUS_SCALE as SHARED_RADIUS_SCALE,
	SHADOW_SCALE as SHARED_SHADOW_SCALE,
	cn as sharedCn,
} from "../../../../../packages/ui/src/utils";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const SHARED_THEME_CSS = readFileSync(resolve(TEST_DIR, "../../../../..", "packages/ui/src/globals.css"), "utf8");
const TERMINAL_THEME_CSS = readFileSync(resolve(TEST_DIR, "../..", "styles.css"), "utf8");

const MERGE_HELPERS = [
	["terminal", terminalCn],
	["shared ui", sharedCn],
] as const;

function readThemeKeys(source: string, namespace: string): string[] {
	const keys = [...source.matchAll(new RegExp(`^\\s*--${namespace}-([a-z0-9-]+):`, "gm"))].map((match) => match[1]);
	return [...new Set(keys)];
}

describe("class merge theme scales", () => {
	it("keeps both merge helpers on the numeric radius scale declared by the shared theme", () => {
		const declaredScale = readThemeKeys(SHARED_THEME_CSS, "radius").filter((key) => /^\d+$/.test(key));

		expect(declaredScale).toEqual(["4", "8", "12", "16", "20", "24", "32"]);
		expect(TERMINAL_RADIUS_SCALE).toEqual(declaredScale);
		expect(SHARED_RADIUS_SCALE).toEqual(declaredScale);
	});

	it("knows every named shadow and font family the themes declare", () => {
		expect(SHARED_SHADOW_SCALE).toEqual(readThemeKeys(SHARED_THEME_CSS, "shadow"));
		expect([...TERMINAL_SHADOW_SCALE].sort()).toEqual(readThemeKeys(TERMINAL_THEME_CSS, "shadow").sort());
		expect(FONT_FAMILY_SCALE).toEqual(
			readThemeKeys(TERMINAL_THEME_CSS, "font").filter((key) => key !== "sans" && key !== "mono"),
		);
	});

	it.each(MERGE_HELPERS)("lets a later named radius replace the primitive radius in the %s helper", (_name, cn) => {
		expect(cn("rounded-12 border", "rounded-24")).toBe("border rounded-24");
		expect(cn("rounded-12", "rounded-8")).toBe("rounded-8");
		expect(cn("rounded-12", "rounded-full")).toBe("rounded-full");
		expect(cn("rounded-full", "rounded-20")).toBe("rounded-20");
		expect(cn("rounded-12", "rounded-[7px]")).toBe("rounded-[7px]");
	});

	it.each(MERGE_HELPERS)("keeps side radii and unrelated utilities independent in the %s helper", (_name, cn) => {
		expect(cn("rounded-12", "rounded-t-16")).toBe("rounded-12 rounded-t-16");
		expect(cn("rounded-t-8", "rounded-t-16")).toBe("rounded-t-16");
		expect(cn("rounded-12 text-2sm", "p-2")).toBe("rounded-12 text-2sm p-2");
	});

	it.each(MERGE_HELPERS)("lets a later shadow replace the primitive shadow in the %s helper", (_name, cn) => {
		expect(cn("shadow-raised", "shadow-none")).toBe("shadow-none");
		expect(cn("shadow-overlay", "shadow-raised")).toBe("shadow-raised");
	});

	it("resolves terminal shadows, font families and text utilities by their own groups", () => {
		expect(terminalCn("shadow-overlay", "shadow-legal-acceptance")).toBe("shadow-legal-acceptance");
		expect(terminalCn("font-sans", "font-market-close")).toBe("font-market-close");
		expect(terminalCn("font-market-close font-bold")).toBe("font-market-close font-bold");
		expect(terminalCn("text-xs text-fg", "text-2sm")).toBe("text-fg text-2sm");
		expect(terminalCn("text-2sm", "text-trading-panel-muted")).toBe("text-2sm text-trading-panel-muted");
	});
});
