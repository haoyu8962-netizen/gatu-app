import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const LOGICAL_NAVIGATION_SOURCES = [
	"components/funding-history/funding-history-page.tsx",
	"components/historical-orders/historical-orders-page.tsx",
	"components/leaderboard/leaderboard-view.tsx",
	"components/trade-history/trade-history-page.tsx",
	"components/trade/components/mobile-agent-qr-scanner.tsx",
	"components/trade/components/wallet-modal.tsx",
	"components/trade/tradebox/bridge/amount-entry-screen.tsx",
	"components/trade/tradebox/bridge/confirmation-screen.tsx",
	"components/vaults/vault-detail-view.tsx",
] as const;

const BIDIRECTIONAL_FINANCIAL_SOURCES = [
	"components/funding-history/funding-history-page.tsx",
	"components/leaderboard/leaderboard-view.tsx",
	"components/trade-history/trade-history-page.tsx",
	"components/vaults/vault-detail-view.tsx",
] as const;

const HISTORY_PAGE_SOURCES = [
	"components/funding-history/funding-history-page.tsx",
	"components/historical-orders/historical-orders-page.tsx",
	"components/trade-history/trade-history-page.tsx",
] as const;

describe("RTL financial UI contract", () => {
	it.each(LOGICAL_NAVIGATION_SOURCES)("mirrors logical navigation icons in %s", (relativePath) => {
		const source = readFileSync(resolve(__dirname, "../..", relativePath), "utf8");

		expect(source).toContain("rtl:rotate-180");
	});

	it.each(BIDIRECTIONAL_FINANCIAL_SOURCES)("isolates formatted financial values in %s", (relativePath) => {
		const source = readFileSync(resolve(__dirname, "../..", relativePath), "utf8");

		expect(source).toContain('<bdi dir="ltr">');
	});

	it.each(HISTORY_PAGE_SOURCES)("uses logical start spacing for back navigation in %s", (relativePath) => {
		const source = readFileSync(resolve(__dirname, "../..", relativePath), "utf8");

		expect(source).toContain("-ms-2");
		expect(source).not.toContain("-ml-2");
	});

	it("uses logical spacing between mobile header groups", () => {
		const source = readFileSync(resolve(__dirname, "../..", "components/trade/mobile/mobile-header.tsx"), "utf8");

		expect(source).toContain("ms-auto");
		expect(source).toContain("ms-2");
		expect(source).not.toContain("ml-auto");
		expect(source).not.toContain("ml-2");
	});

	it("keeps leaderboard numeric headers physically aligned with their financial values", () => {
		const source = readFileSync(resolve(__dirname, "../..", "components/leaderboard/leaderboard-view.tsx"), "utf8");

		expect(source).toContain('<TableHead size="dense" className="text-right"');
		expect(source).toContain('className="ml-auto inline-flex items-center');
		expect(source).toContain('"text-right text-2sm font-semibold tabular-nums whitespace-nowrap"');
		expect(source).not.toContain('<TableHead size="dense" className="text-end"');
	});
});
