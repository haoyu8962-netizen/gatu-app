import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { RADIUS_SCALE as TERMINAL_RADIUS_SCALE, cn as terminalCn } from "@/lib/cn";
import { RADIUS_SCALE as SHARED_RADIUS_SCALE, cn as sharedCn } from "../../../../../packages/ui/src/utils";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const SHARED_THEME_CSS = readFileSync(resolve(TEST_DIR, "../../../../..", "packages/ui/src/globals.css"), "utf8");

const MERGE_HELPERS = [
	["terminal", terminalCn],
	["shared ui", sharedCn],
] as const;

describe("class merge radius scale", () => {
	it("keeps both merge helpers on the numeric radius scale declared by the shared theme", () => {
		const declaredScale = [...SHARED_THEME_CSS.matchAll(/^\s*--radius-(\d+):/gm)].map((match) => match[1]);

		expect(declaredScale).toEqual(["4", "8", "12", "16", "20", "24", "32"]);
		expect(TERMINAL_RADIUS_SCALE).toEqual(declaredScale);
		expect(SHARED_RADIUS_SCALE).toEqual(declaredScale);
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
});
