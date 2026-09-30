import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const TERMINAL_SRC = resolve(TEST_DIR, "../..");

const DASHBOARD_COMPONENT_DIRS = [
	"portfolio",
	"earn",
	"staking",
	"vaults",
	"referrals",
	"leaderboard",
	"funding-comparison",
	"funding-history",
	"historical-orders",
	"trade-history",
	"api-wallet",
] as const;

const DASHBOARD_SOURCES = [
	...DASHBOARD_COMPONENT_DIRS.flatMap((dir) =>
		readdirSync(resolve(TERMINAL_SRC, "components", dir))
			.filter((file) => file.endsWith(".tsx") && !/modal|dialog/.test(file))
			.map((file) => `components/${dir}/${file}`),
	),
	"components/trade/mobile/mobile-account-transfers-tab.tsx",
].sort();

const CONTROL_EXCEPTIONS = [
	{
		file: "components/portfolio/portfolio-page.tsx",
		contains: "h-full min-h-64 animate-pulse bg-surface",
		count: 1,
		reason: "placeholder filling a clipped surface",
	},
	{
		file: "components/portfolio/portfolio-performance-chart.tsx",
		contains: "cursor-crosshair",
		count: 1,
		reason: "chart plot hit area",
	},
	{
		file: "components/portfolio/portfolio-performance-chart.tsx",
		contains: "z-[var(--z-tooltip)]",
		count: 1,
		reason: "chart tooltip overlay",
	},
	{
		file: "components/portfolio/portfolio-performance-chart.tsx",
		contains: "h-10 rounded-none",
		count: 1,
		reason: "tab control",
	},
	{
		file: "components/staking/staking-view.tsx",
		contains: "h-8 animate-pulse rounded-8",
		count: 5,
		reason: "row placeholder",
	},
	{
		file: "components/vaults/vault-detail-view.tsx",
		contains: "rounded-8 px-2 py-1 text-xs font-semibold",
		count: 1,
		reason: "chart button",
	},
	{ file: "components/vaults/vaults-list.tsx", contains: "rounded-4 bg-fill-weak px-1.5", count: 1, reason: "badge" },
	{
		file: "components/vaults/vaults-list.tsx",
		contains: "h-12 animate-pulse rounded-8",
		count: 1,
		reason: "row placeholder",
	},
	{
		file: "components/referrals/referral-dashboard.tsx",
		contains: "w-full rounded-24 text-sm font-bold",
		count: 1,
		reason: "button",
	},
	{
		file: "components/referrals/referral-rewards-card.tsx",
		contains: "inline-flex items-center gap-1 rounded-8 text-2xs",
		count: 1,
		reason: "link",
	},
	{
		file: "components/leaderboard/leaderboard-view.tsx",
		contains: "overflow-x-auto rounded-8 border border-stroke-weak bg-sunken p-1",
		count: 1,
		reason: "segmented filter",
	},
	{
		file: "components/leaderboard/leaderboard-view.tsx",
		contains: "ml-auto inline-flex items-center gap-1 rounded-8",
		count: 1,
		reason: "sort button",
	},
	{
		file: "components/leaderboard/leaderboard-view.tsx",
		contains: "inline-flex min-w-0 items-center gap-2 rounded-8",
		count: 1,
		reason: "trader link",
	},
	{
		file: "components/leaderboard/leaderboard-view.tsx",
		contains: "mb-1 h-11 rounded-8",
		count: 1,
		reason: "row placeholder",
	},
	{
		file: "components/funding-comparison/funding-comparison-view.tsx",
		contains: "inline-flex items-center gap-1 rounded-8 px-1 py-1",
		count: 1,
		reason: "sort button",
	},
	{
		file: "components/funding-comparison/funding-comparison-view.tsx",
		contains: "mb-1 h-11 rounded-8",
		count: 1,
		reason: "row placeholder",
	},
	{
		file: "components/funding-history/funding-history-page.tsx",
		contains: "mt-4 h-4 rounded-4 bg-fill-weak",
		count: 1,
		reason: "text placeholder",
	},
	{
		file: "components/historical-orders/historical-orders-page.tsx",
		contains: "mt-4 h-4 rounded-4 bg-fill-weak",
		count: 1,
		reason: "text placeholder",
	},
	{
		file: "components/historical-orders/historical-orders-page.tsx",
		contains: "inline-flex rounded-4 px-2 py-0.5 text-2xs",
		count: 2,
		reason: "status pill",
	},
	{
		file: "components/trade-history/trade-history-page.tsx",
		contains: "mt-4 h-4 rounded-4 bg-fill-weak",
		count: 1,
		reason: "text placeholder",
	},
	{
		file: "components/api-wallet/api-wallet-credential-box.tsx",
		contains: "rounded-20 active:scale-100",
		count: 1,
		reason: "copy button",
	},
	{
		file: "components/api-wallet/api-wallet-form.tsx",
		contains: "rounded-20 border-api-wallet-stroke-input bg-surface",
		count: 3,
		reason: "input and select",
	},
	{
		file: "components/api-wallet/api-wallet-form.tsx",
		contains: "items-center justify-center rounded-20 border",
		count: 1,
		reason: "option control",
	},
	{
		file: "components/api-wallet/api-wallet-form.tsx",
		contains: "w-full rounded-20 bg-api-wallet-control",
		count: 1,
		reason: "submit button",
	},
	{
		file: "components/api-wallet/api-wallet-list.tsx",
		contains: "mt-1 rounded-20 bg-api-wallet-control",
		count: 1,
		reason: "retry button",
	},
	{
		file: "components/api-wallet/api-wallet-list.tsx",
		contains: "shrink-0 rounded-20 active:scale-100",
		count: 1,
		reason: "remove button",
	},
	{
		file: "components/api-wallet/api-wallet-view.tsx",
		contains: "gap-2 rounded-20 border border-api-wallet-stroke-input px-3 py-2",
		count: 1,
		reason: "search field",
	},
] as const;

const FLAT_SHEETS = [
	{
		file: "components/leaderboard/leaderboard-view.tsx",
		base: "mx-auto flex min-h-[var(--earn-page-min-height)] w-full max-w-[var(--earn-content-max)] flex-col bg-surface text-fg shadow-raised",
		desktop: "overflow-hidden rounded-24",
	},
	{
		file: "components/funding-comparison/funding-comparison-view.tsx",
		base: "mx-auto flex min-h-[var(--earn-page-min-height)] w-full max-w-[var(--earn-content-max)] flex-col bg-surface text-fg shadow-raised",
		desktop: "overflow-hidden rounded-24",
	},
	{
		file: "components/api-wallet/api-wallet-view.tsx",
		base: "mx-auto flex w-full max-w-[var(--api-wallet-content-max)] flex-col bg-surface text-api-wallet-fg shadow-api-wallet-page",
		desktop: "min-h-[var(--api-wallet-page-min-height)] overflow-hidden rounded-24",
	},
] as const;

const ACCOUNT_CARD_SOURCES = [
	"components/trade/mobile/mobile-funding-tab.tsx",
	"components/trade/mobile/mobile-history-tab.tsx",
	"components/trade/mobile/mobile-orders-tab.tsx",
	"components/trade/mobile/mobile-position-card.tsx",
	"components/trade/mobile/mobile-orders-history-tab.tsx",
	"components/trade/mobile/mobile-twap-tab.tsx",
	"components/trade/mobile/mobile-twap-history-list.tsx",
	"components/trade/mobile/mobile-twap-fill-history-list.tsx",
] as const;

interface ClassString {
	file: string;
	value: string;
}

function readSource(file: string): string {
	return readFileSync(resolve(TERMINAL_SRC, file), "utf8");
}

function radiusUtility(token: string): string {
	return token.slice(token.lastIndexOf(":") + 1).replace(/^!/, "");
}

function radiusClasses(value: string): string[] {
	return value.split(/\s+/).filter((token) => {
		const utility = radiusUtility(token);
		return /^rounded(?:-|$)/.test(utility) && utility !== "rounded-full";
	});
}

const CLASS_STRINGS: readonly ClassString[] = DASHBOARD_SOURCES.flatMap((file) =>
	[...readSource(file).matchAll(/"([^"\n]*)"/g)]
		.map((match) => ({ file, value: match[1] }))
		.filter(({ value }) => radiusClasses(value).length > 0 || /(?:^|\s)bg-surface(?:\s|$)/.test(value)),
);

function isControlException({ file, value }: ClassString): boolean {
	return CONTROL_EXCEPTIONS.some((exception) => exception.file === file && value.includes(exception.contains));
}

function isFlatSheetString({ file, value }: ClassString): boolean {
	return FLAT_SHEETS.some((sheet) => sheet.file === file && (value === sheet.base || value === sheet.desktop));
}

function describeClass({ file, value }: ClassString): string {
	return `${file}: ${value}`;
}

describe("dashboard surface radius contract", () => {
	it("rounds every page surface on the dashboard canvas to 12px and lifts it with a shadow", () => {
		const surfaces = CLASS_STRINGS.filter(
			(entry) =>
				!isFlatSheetString(entry) &&
				!isControlException(entry) &&
				/(?:^|\s)bg-surface(?:\s|$)/.test(entry.value) &&
				!entry.value.includes("border"),
		);

		expect(surfaces.length).toBeGreaterThan(0);
		for (const surface of surfaces) {
			expect(radiusClasses(surface.value), describeClass(surface)).toEqual(["rounded-24"]);
			expect(surface.value, describeClass(surface)).toMatch(/(?:^|\s)shadow-(?:raised|api-wallet-page)(?:\s|$)/);
		}
	});

	it("rounds every other box to 8px unless it is a listed control", () => {
		const boxes = CLASS_STRINGS.filter(
			(entry) =>
				!isFlatSheetString(entry) &&
				!isControlException(entry) &&
				radiusClasses(entry.value).length > 0 &&
				!(/(?:^|\s)bg-surface(?:\s|$)/.test(entry.value) && !entry.value.includes("border")),
		);

		expect(boxes.length).toBeGreaterThan(0);
		for (const box of boxes) {
			for (const radius of radiusClasses(box.value)) {
				expect(["rounded-16", "rounded-t-16"], describeClass(box)).toContain(radiusUtility(radius));
			}
		}
	});

	it("keeps each listed control exception in use", () => {
		for (const exception of CONTROL_EXCEPTIONS) {
			const matches = CLASS_STRINGS.filter(
				(entry) => entry.file === exception.file && entry.value.includes(exception.contains),
			);
			expect(matches.length, `${exception.file}: ${exception.contains} (${exception.reason})`).toBe(exception.count);
		}
	});

	it("builds dashboard class names only from double-quoted strings", () => {
		for (const file of DASHBOARD_SOURCES) {
			expect(readSource(file), file).not.toMatch(/[`'][^`'\n]*\brounded-[^`'\n]*[`']/);
		}
	});

	it("keeps flat phone sheets square on phones and rounds them to 12px on desktop", () => {
		for (const sheet of FLAT_SHEETS) {
			const source = readSource(sheet.file);
			expect(source, sheet.file).toContain(`"${sheet.base}"`);
			expect(radiusClasses(sheet.base), sheet.file).toEqual([]);
			expect(sheet.base, sheet.file).toMatch(/(?:^|\s)shadow-(?:raised|api-wallet-page)(?:\s|$)/);
			expect(
				[...source.matchAll(/!isMobile && "([^"]*)"/g)].map((match) => match[1]),
				sheet.file,
			).toEqual([sheet.desktop]);
			expect(radiusClasses(sheet.desktop), sheet.file).toEqual(["rounded-24"]);
		}
	});

	it("rounds the terminal account cards to 8px where Portfolio embeds them", () => {
		expect(readSource("components/portfolio/portfolio-page.tsx")).toContain(
			'className="min-h-80 py-1 [&_[data-account-card]]:rounded-16"',
		);
		for (const file of ACCOUNT_CARD_SOURCES) {
			const source = readSource(file);
			const cards = source.match(/rounded-\[14px\] border border-market-close-stroke-card/g) ?? [];
			expect(cards.length, file).toBeGreaterThan(0);
			expect(source.match(/\bdata-account-card\b/g)?.length ?? 0, file).toBe(cards.length);
		}
	});
});
