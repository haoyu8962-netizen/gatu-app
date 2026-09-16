import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { headerInner } from "@/components/trade/mobile/mobile-chrome-classes";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const COMPONENTS_DIR = resolve(TEST_DIR, "../..", "components");

function readComponent(path: string) {
	return readFileSync(resolve(COMPONENTS_DIR, path), "utf8");
}

describe("mobile landscape safe area", () => {
	it("keeps the header background full width while insetting its controls", () => {
		const header = readComponent("trade/mobile/mobile-header.tsx");

		expect(header).toContain("mobileChrome.headerInner");
		expect(headerInner).toContain("pl-[max(0.625rem,var(--sal))]");
		expect(headerInner).toContain("pr-[max(0.625rem,var(--sar))]");
	});

	it("keeps alert backgrounds full width while insetting their content", () => {
		const geoBanner = readComponent("trade/geo/geo-restriction-banner.tsx");
		const offlineBanner = readComponent("trade/mobile/offline-banner.tsx");

		expect(geoBanner).toContain("w-full");
		expect(geoBanner).toContain("pl-[max(1rem,var(--sal))]");
		expect(geoBanner).toContain("pr-[max(1rem,var(--sar))]");
		expect(offlineBanner).toContain("pl-[max(0.75rem,var(--sal))]");
		expect(offlineBanner).toContain("pr-[max(0.75rem,var(--sar))]");
	});

	it("keeps the portaled full-screen market selector inside the horizontal safe area", () => {
		const tokenSelector = readComponent("trade/chart/token-selector-popup.tsx");

		expect(tokenSelector).toContain("inset-y-0 left-[var(--sal)] right-[var(--sar)]");
		expect(tokenSelector).not.toContain('className="inset-0');
	});
});
