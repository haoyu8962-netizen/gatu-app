import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const DESKTOP_SOURCE = readFileSync(resolve(TEST_DIR, "../..", "components/trade/positions/orders-tab.tsx"), "utf8");
const INLINE_EDIT_SOURCE = readFileSync(
	resolve(TEST_DIR, "../..", "components/trade/positions/order-inline-edit.tsx"),
	"utf8",
);
const MOBILE_SOURCE = readFileSync(resolve(TEST_DIR, "../..", "components/trade/mobile/mobile-orders-tab.tsx"), "utf8");

describe("orders toolbar visual contract", () => {
	it("uses the latest desktop filter, header, and row geometry", () => {
		expect(DESKTOP_SOURCE).toContain("flex h-12 shrink-0 items-center gap-2");
		expect(DESKTOP_SOURCE).toContain("h-[33px]");
		expect(DESKTOP_SOURCE).toContain("h-[60px]");
		for (const width of [126, 84, 70, 60, 100, 104, 66, 52, 76, 88]) {
			expect(DESKTOP_SOURCE).toContain(`w-[${width}px]`);
		}
		expect(DESKTOP_SOURCE).toContain("min-w-[1280px]");
		expect(DESKTOP_SOURCE).toContain("hover:bg-market-close-hover");
	});

	it("matches the inline editor card without changing its keyboard contract", () => {
		expect(INLINE_EDIT_SOURCE).toContain("rounded-[10px]");
		expect(INLINE_EDIT_SOURCE).toContain("border-[1.5px]");
		expect(INLINE_EDIT_SOURCE).toContain("w-[72px]");
		expect(INLINE_EDIT_SOURCE).toContain("w-[84px]");
		expect(INLINE_EDIT_SOURCE).toContain("bg-market-close-control");
		expect(INLINE_EDIT_SOURCE).toContain('event.key === "Enter"');
		expect(INLINE_EDIT_SOURCE).toContain('event.key === "Escape"');
	});

	it("keeps mobile cards on the 48px filter and 10px list rhythm with safe targets", () => {
		expect(MOBILE_SOURCE).toContain("flex h-12 shrink-0 items-center");
		expect(MOBILE_SOURCE).toContain("space-y-2.5 px-3.5");
		expect(MOBILE_SOURCE).toContain("rounded-[14px]");
		expect(MOBILE_SOURCE).toContain("py-[11px]");
		expect(MOBILE_SOURCE).toContain("min-h-11 items-center");
		expect(MOBILE_SOURCE).toContain("after:h-11");
	});
});
