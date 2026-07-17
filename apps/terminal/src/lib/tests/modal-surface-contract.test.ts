import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drawerContentVariants, modalPopupVariants, tooltipPopupVariants } from "@gatu/ui";
import { describe, expect, it } from "vitest";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const TERMINAL_THEME_CSS = readFileSync(resolve(TEST_DIR, "../..", "styles.css"), "utf8");
const SHARED_THEME_CSS = readFileSync(resolve(TEST_DIR, "../../../../..", "packages/ui/src/globals.css"), "utf8");

describe("modal surface contract", () => {
	it("uses the dedicated modal surface for blocking overlays", () => {
		expect(modalPopupVariants()).toContain("bg-modal");
		expect(drawerContentVariants({ side: "right" })).toContain("bg-modal");
	});

	it("keeps lightweight overlays on the raised overlay surface", () => {
		expect(tooltipPopupVariants()).toContain("bg-overlay");
		expect(tooltipPopupVariants()).not.toContain("bg-modal");
	});

	it("keeps the shared and terminal modal tokens wired to their intended surfaces", () => {
		expect(readCssVariable(SHARED_THEME_CSS, ":root", "--bg-modal")).toBe("#ffffff");
		expect(readCssVariable(SHARED_THEME_CSS, ".dark", "--bg-modal")).toBe("#292b33");
		expect(readCssVariable(SHARED_THEME_CSS, "@theme inline", "--color-modal")).toBe("var(--bg-modal)");

		expect(readCssVariable(TERMINAL_THEME_CSS, ":root", "--bg-modal")).toBe("#ffffff");
		expect(readCssVariable(TERMINAL_THEME_CSS, ".dark", "--bg-modal")).toBe("#0f1a1f");
		expect(readCssVariable(TERMINAL_THEME_CSS, ".dark", "--bg-overlay")).toBe("#292b33");
		expect(readCssVariable(TERMINAL_THEME_CSS, "@theme inline", "--color-modal")).toBe("var(--bg-modal)");
	});
});

function readCssVariable(source: string, selector: string, variable: string): string | undefined {
	const selectorStart = source.indexOf(`${selector} {`);
	if (selectorStart === -1) return undefined;

	const blockStart = source.indexOf("{", selectorStart);
	const blockEnd = source.indexOf("}", blockStart);
	if (blockStart === -1 || blockEnd === -1) return undefined;

	const declaration = new RegExp(`${variable}:\\s*([^;]+);`).exec(source.slice(blockStart + 1, blockEnd));
	return declaration?.[1]?.trim();
}
