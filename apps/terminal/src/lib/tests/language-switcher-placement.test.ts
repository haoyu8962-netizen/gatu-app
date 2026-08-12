import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const MOBILE_HEADER_SOURCE = readFileSync(resolve(TEST_DIR, "../../components/trade/mobile/mobile-header.tsx"), "utf8");
const MOBILE_NAV_DRAWER_SOURCE = readFileSync(
	resolve(TEST_DIR, "../../components/trade/mobile/mobile-nav-drawer.tsx"),
	"utf8",
);

describe("language switcher placement", () => {
	it("keeps the only mobile language entry in the top bar", () => {
		expect(MOBILE_HEADER_SOURCE).toContain("<LanguageSwitcher");
		expect(MOBILE_HEADER_SOURCE).toContain('className="flex h-14 items-center justify-between px-2.5"');
		expect(MOBILE_HEADER_SOURCE).toContain("sideOffset={14}");
		expect(MOBILE_HEADER_SOURCE).toContain("alignOffset={-36}");
		expect(MOBILE_HEADER_SOURCE).toContain("size-11 min-h-11");
		expect(MOBILE_NAV_DRAWER_SOURCE).not.toContain("LanguageSwitcher");
	});
});
