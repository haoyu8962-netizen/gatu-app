import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const SCROLL_CONTAINER_SOURCES = [
	"components/trade/layout/main-workspace.tsx",
	"components/trade/header/favorites-strip.tsx",
	"components/trade/positions/positions-panel.tsx",
].map((relativePath) => readFileSync(resolve(TEST_DIR, "../..", relativePath), "utf8"));

describe("hidden horizontal scrollbar contract", () => {
	it("keeps horizontal scrolling while hiding native scrollbar overlays", () => {
		for (const source of SCROLL_CONTAINER_SOURCES) {
			expect(source).toContain("overflow-x-auto");
			expect(source).toContain("overflow-y-hidden");
			expect(source).toContain("overscroll-x-contain");
			expect(source).toContain("[scrollbar-width:none]");
			expect(source).toContain("[&::-webkit-scrollbar]:hidden");
			expect(source).not.toContain("scrollbar-none");
		}
	});
});
