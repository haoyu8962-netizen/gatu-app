import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));

const DASHBOARD_PAGE_SOURCES = [
	"components/portfolio/portfolio-page.tsx",
	"components/portfolio/portfolio-overview.tsx",
	"components/portfolio/portfolio-performance-chart.tsx",
	"components/earn/earn-view.tsx",
	"components/staking/staking-view.tsx",
	"components/vaults/vaults-page.tsx",
	"components/vaults/vaults-list.tsx",
	"components/vaults/vault-detail-view.tsx",
	"components/referrals/referral-dashboard.tsx",
	"components/referrals/referral-code-card.tsx",
	"components/referrals/referral-rewards-card.tsx",
	"components/leaderboard/leaderboard-view.tsx",
	"components/funding-comparison/funding-comparison-view.tsx",
	"components/funding-history/funding-history-page.tsx",
	"components/historical-orders/historical-orders-page.tsx",
	"components/trade-history/trade-history-page.tsx",
	"components/api-wallet/api-wallet-view.tsx",
	"components/api-wallet/api-wallet-credential-box.tsx",
] as const;

const FLAT_SHEET_SOURCES = [
	"components/leaderboard/leaderboard-view.tsx",
	"components/funding-comparison/funding-comparison-view.tsx",
	"components/api-wallet/api-wallet-view.tsx",
] as const;

interface ClassString {
	file: string;
	value: string;
}

function readSource(file: string): string {
	return readFileSync(resolve(TEST_DIR, "../..", file), "utf8");
}

const CLASS_STRINGS: readonly ClassString[] = DASHBOARD_PAGE_SOURCES.flatMap((file) =>
	[...readSource(file).matchAll(/"([^"\n]*\brounded-\d[^"\n]*)"/g)].map((match) => ({ file, value: match[1] })),
);

function radii(value: string): number[] {
	return [...value.matchAll(/(?:^|\s)(?:\S*:)?rounded-(\d+)(?=\s|$)/g)].map((match) => Number(match[1]));
}

function describeClass({ file, value }: ClassString): string {
	return `${file}: ${value}`;
}

describe("dashboard surface radius contract", () => {
	it("rounds every page surface on the dashboard canvas to 12px and lifts it with a shadow", () => {
		const surfaces = CLASS_STRINGS.filter(({ value }) => value.includes("bg-surface") && !value.includes("border"));

		expect(surfaces.length).toBeGreaterThanOrEqual(15);
		for (const surface of surfaces) {
			expect(radii(surface.value), describeClass(surface)).toEqual([24]);
			expect(surface.value, describeClass(surface)).toMatch(/\bshadow-(?:raised|api-wallet-page)\b/);
		}
	});

	it("rounds outlined cards and card-shaped placeholders to 8px, leaving smaller controls alone", () => {
		const cards = CLASS_STRINGS.filter(
			({ value }) =>
				(value.includes("border-stroke-weak") || value.includes("animate-pulse")) && !value.includes("bg-overlay"),
		);

		expect(cards.length).toBeGreaterThanOrEqual(10);
		for (const card of cards) {
			for (const radius of radii(card.value)) {
				expect(radius === 16 || radius <= 8, describeClass(card)).toBe(true);
			}
		}
	});

	it("rounds notices inside page surfaces to 8px", () => {
		const notices = CLASS_STRINGS.filter(({ value }) => /\bbg-(?:warning|error|success|info)-soft\b/.test(value));

		expect(notices.length).toBeGreaterThanOrEqual(8);
		for (const notice of notices) {
			expect(radii(notice.value), describeClass(notice)).toEqual([16]);
		}
	});

	it("rounds a flat phone sheet to the same 12px once it becomes a desktop surface", () => {
		for (const file of FLAT_SHEET_SOURCES) {
			const desktopRadii = [...readSource(file).matchAll(/!isMobile && "([^"]*)"/g)].flatMap((match) =>
				radii(match[1]),
			);
			expect(desktopRadii, file).toEqual([24]);
		}
	});
});
