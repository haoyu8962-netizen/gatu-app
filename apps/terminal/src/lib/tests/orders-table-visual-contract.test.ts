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
		expect(DESKTOP_SOURCE).toContain("<DesktopTabToolbarPortal target={toolbarTarget}>");
		expect(DESKTOP_SOURCE).toContain('data-testid="orders-toolbar-actions"');
		expect(DESKTOP_SOURCE).not.toContain("flex h-12 shrink-0 items-center gap-2");
		expect(DESKTOP_SOURCE).toContain("h-[33px]");
		expect(DESKTOP_SOURCE).toContain("h-[60px]");
		expect(DESKTOP_SOURCE).toContain(
			"grid-cols-[126px_84px_70px_60px_100px_84px_104px_66px_52px_minmax(0,1fr)_76px_88px]",
		);
		expect(DESKTOP_SOURCE).toContain("gap-x-3 px-5");
		expect(DESKTOP_SOURCE).toContain("min-w-[1280px]");
		expect(DESKTOP_SOURCE).toContain("block bg-surface [&_tr]:border-stroke-weak [&_tr]:border-t-0");
		expect(DESKTOP_SOURCE).not.toContain("<AssetBadge");
		expect(DESKTOP_SOURCE).toContain("group-hover/order-row:opacity-100");
		expect(DESKTOP_SOURCE).toContain("border-market-close-stroke-input bg-surface");
		expect(DESKTOP_SOURCE).toContain("text-market-close-warning");
		expect(DESKTOP_SOURCE).toContain('to="/portfolio"');
		expect(DESKTOP_SOURCE).toContain("h-[38px] min-w-[1280px]");
		expect(DESKTOP_SOURCE).toContain("hover:bg-market-close-hover");
	});

	it("matches the inline editor card without changing its keyboard contract", () => {
		expect(INLINE_EDIT_SOURCE).toContain("rounded-[10px]");
		expect(INLINE_EDIT_SOURCE).toContain("border-[1.5px]");
		expect(INLINE_EDIT_SOURCE).toContain("h-[29px]");
		expect(INLINE_EDIT_SOURCE).toContain("w-[90px]");
		expect(INLINE_EDIT_SOURCE).toContain("w-[102px]");
		expect(INLINE_EDIT_SOURCE).toContain("absolute top-1/2 z-10");
		expect(INLINE_EDIT_SOURCE).toContain("shadow-market-close-inline-edit");
		expect(INLINE_EDIT_SOURCE).toContain('align === "right" ? "-right-1" : "-left-1"');
		expect(INLINE_EDIT_SOURCE).toContain("bg-market-close-control");
		expect(INLINE_EDIT_SOURCE).toContain('event.key === "Enter"');
		expect(INLINE_EDIT_SOURCE).toContain('event.key === "Escape"');
	});

	it("keeps mobile cards on the 48px filter and 10px list rhythm with safe targets", () => {
		expect(MOBILE_SOURCE).toContain("flex h-9 shrink-0 items-center");
		expect(MOBILE_SOURCE).toContain('data-testid="mobile-orders-filter-toolbar"');
		expect(MOBILE_SOURCE).not.toContain('className="flex h-10 shrink-0 items-center');
		expect(MOBILE_SOURCE).toContain("space-y-2.5 px-3.5");
		expect(MOBILE_SOURCE).toContain("rounded-[14px]");
		expect(MOBILE_SOURCE).toContain("py-[11px]");
		expect(MOBILE_SOURCE).toContain("h-[18px] items-center");
		expect(MOBILE_SOURCE).toContain("after:h-11");
		expect(MOBILE_SOURCE).toContain("after:top-[calc(50%_-_1px)]");
		expect(MOBILE_SOURCE).toContain("after:min-w-11");
		expect(MOBILE_SOURCE).toContain("after:w-full");
		expect(MOBILE_SOURCE).toContain("text-market-close-warning");
		expect(MOBILE_SOURCE).toContain("Submitted limit and trigger orders will appear here.");
		expect(MOBILE_SOURCE).not.toContain("MobileOrderBulkDetailsActions");
	});
});
