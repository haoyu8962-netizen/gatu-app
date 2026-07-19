import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REACTIVE_COMPONENTS = [
	"components/trade/header/top-nav.tsx",
	"components/trade/header/language-switcher.tsx",
	"components/trade/header/user-menu.tsx",
	"components/trade/mobile/mobile-account-view.tsx",
	"components/trade/mobile/mobile-book-view.tsx",
	"components/trade/mobile/mobile-nav-drawer.tsx",
	"components/trade/mobile/mobile-trade-view.tsx",
	"hooks/trade/use-order-entry-data.ts",
];

describe("live localization source contract", () => {
	it.each(REACTIVE_COMPONENTS)("translates %s during render", (relativePath) => {
		const source = readFileSync(resolve(__dirname, "../..", relativePath), "utf8");

		expect(source).not.toContain("@lingui/core/macro");
		expect(source).not.toContain("UI_TEXT");
		expect(source).toContain("@lingui/react/macro");
	});
});
