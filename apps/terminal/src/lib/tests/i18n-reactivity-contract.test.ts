import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REACTIVE_COMPONENTS = [
	"components/trade/header/top-nav.tsx",
	"components/trade/header/language-switcher.tsx",
	"components/trade/header/user-menu.tsx",
	"components/trade/chart/token-selector-content.tsx",
	"components/trade/mobile/mobile-account-view.tsx",
	"components/trade/mobile/mobile-book-view.tsx",
	"components/trade/mobile/mobile-funding-tab.tsx",
	"components/trade/mobile/mobile-history-tab.tsx",
	"components/trade/mobile/mobile-nav-drawer.tsx",
	"components/trade/mobile/mobile-orders-history-tab.tsx",
	"components/trade/mobile/mobile-orders-tab.tsx",
	"components/trade/mobile/mobile-position-card.tsx",
	"components/trade/mobile/mobile-positions-tab.tsx",
	"components/trade/mobile/mobile-trade-view.tsx",
	"components/trade/mobile/mobile-twap-tab.tsx",
	"components/trade/positions/orders-history-tab.tsx",
	"components/trade/positions/orders-tab.tsx",
	"components/trade/positions/position-pnl-share-modal.tsx",
	"components/trade/positions/position-row.tsx",
	"components/trade/positions/twap-tab.tsx",
	"components/trade/tradebox/account-panel.tsx",
	"components/trade/tradebox/order-toast.tsx",
	"components/trade/tradebox/trade-header.tsx",
	"hooks/trade/use-account-overview-labels.ts",
	"hooks/trade/use-funds-action-availability.ts",
	"hooks/trade/use-order-entry-data.ts",
	"hooks/trade/use-order-display-labels.ts",
];

describe("live localization source contract", () => {
	it.each(REACTIVE_COMPONENTS)("translates %s during render", (relativePath) => {
		const source = readFileSync(resolve(__dirname, "../..", relativePath), "utf8");

		expect(source).not.toContain("@lingui/core/macro");
		expect(source).not.toContain("UI_TEXT");
		expect(source).toContain("@lingui/react/macro");
	});
});
