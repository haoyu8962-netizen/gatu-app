import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SHARED_STYLES = readFileSync(resolve(REPOSITORY_ROOT, "packages/ui/src/globals.css"), "utf8");
const TERMINAL_STYLES = readFileSync(resolve(REPOSITORY_ROOT, "apps/terminal/src/styles.css"), "utf8");

test("shared UI and Terminal expose the same brand semantics", () => {
	for (const selector of [":root", ".dark"]) {
		for (const variable of ["--action", "--on-action", "--signal", "--focus"]) {
			assert.equal(
				readCssVariable(SHARED_STYLES, selector, variable),
				readCssVariable(TERMINAL_STYLES, selector, variable),
				`${selector} ${variable}`,
			);
		}
	}
});

test("Terminal and Website ship distinct large social cards", () => {
	const terminalImage = readFileSync(resolve(REPOSITORY_ROOT, "apps/terminal/public/og-terminal-1200x630.png"));
	const websiteImage = readFileSync(resolve(REPOSITORY_ROOT, "apps/website/public/og-website-1200x630.png"));

	for (const image of [terminalImage, websiteImage]) {
		assert.equal(image.toString("ascii", 12, 16), "IHDR");
		assert.equal(image.readUInt32BE(16), 1200);
		assert.equal(image.readUInt32BE(20), 630);
	}
	assert.equal(terminalImage.equals(websiteImage), false);
});

function readCssVariable(source, selector, variable) {
	const selectorStart = source.indexOf(`${selector} {`);
	assert.notEqual(selectorStart, -1, `missing selector: ${selector}`);

	const blockStart = source.indexOf("{", selectorStart);
	const blockEnd = source.indexOf("}", blockStart);
	assert.notEqual(blockStart, -1, `missing block start: ${selector}`);
	assert.notEqual(blockEnd, -1, `missing block end: ${selector}`);

	const declaration = new RegExp(`${variable}:\\s*([^;]+);`).exec(source.slice(blockStart + 1, blockEnd));
	assert.ok(declaration?.[1], `missing variable: ${selector} ${variable}`);
	return declaration[1].trim();
}
