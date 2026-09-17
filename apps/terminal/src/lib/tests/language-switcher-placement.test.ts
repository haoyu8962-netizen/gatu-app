import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { headerInner, headerLanguage } from "@/components/trade/mobile/mobile-header-view";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const MOBILE_HEADER_SOURCE = readFileSync(resolve(TEST_DIR, "../../components/trade/mobile/mobile-header.tsx"), "utf8");
const MOBILE_NAV_DRAWER_SOURCE = readFileSync(
	resolve(TEST_DIR, "../../components/trade/mobile/mobile-nav-drawer.tsx"),
	"utf8",
);

describe("language switcher placement", () => {
	it("keeps the only mobile language entry in the top bar", () => {
		expect(MOBILE_HEADER_SOURCE).toContain("<LanguageSwitcher");
		expect(MOBILE_HEADER_SOURCE).toContain("<MobileHeaderView");
		expect(readFileSync(resolve(TEST_DIR, "../../components/trade/mobile/mobile-header-view.tsx"), "utf8")).toContain(
			"headerInner",
		);
		expect(headerInner).toBe(
			"flex h-14 items-center gap-2 pl-[max(0.625rem,var(--sal))] pr-[max(0.625rem,var(--sar))]",
		);
		expect(MOBILE_HEADER_SOURCE).toContain("sideOffset={14}");
		expect(MOBILE_HEADER_SOURCE).toContain("alignOffset={-36}");
		expect(MOBILE_HEADER_SOURCE).toContain("headerLanguage");
		expect(headerLanguage).toContain("size-11 min-h-11");
		expect(MOBILE_NAV_DRAWER_SOURCE).not.toContain("LanguageSwitcher");
	});
});
