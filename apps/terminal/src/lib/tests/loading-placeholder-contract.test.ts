import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SOURCE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// A loading placeholder that draws the layout of the content it stands in for is a second copy of
// that layout, and nothing fails when the content is redesigned (.claude/rules/style-ui-guide.md,
// Loading placeholders). Pulsing blocks that stay are listed here with the number of `animate-pulse`
// uses in the file and what keeps them honest: generic bars that claim no layout, or geometry shared
// with the real rows. A new one needs a reason here.
const PULSING_PLACEHOLDERS: Record<string, { count: number; reason: string }> = {
	"components/ui/skeleton.tsx": { count: 2, reason: "inline value bar for the account panel and its generic fallback" },
	"components/api-wallet/api-wallet-list.tsx": {
		count: 1,
		reason: "rows share --api-wallet-row-min-height with the loaded rows",
	},
	"components/funding-comparison/funding-comparison-view.tsx": { count: 1, reason: "generic list rows" },
	"components/funding-history/funding-history-page.tsx": { count: 1, reason: "generic list rows" },
	"components/historical-orders/historical-orders-page.tsx": { count: 1, reason: "generic list rows" },
	"components/leaderboard/leaderboard-view.tsx": { count: 1, reason: "generic list rows" },
	"components/portfolio/portfolio-page.tsx": { count: 1, reason: "blank panel-sized block, no inner layout" },
	"components/staking/staking-view.tsx": { count: 5, reason: "generic bars inside the real cards" },
	"components/trade-history/trade-history-page.tsx": { count: 1, reason: "generic list rows" },
	"components/trade/mobile/mobile-account-transfers-tab.tsx": { count: 2, reason: "generic list rows" },
	"components/trade/positions/account-transfers-tab.tsx": { count: 1, reason: "generic list rows" },
	"components/vaults/vaults-list.tsx": { count: 1, reason: "generic list rows" },
};

// Files that open the deposit dialog without warming its chunk on intent, with the reason.
const DEPOSIT_OPENERS_WITHOUT_INTENT: Record<string, string> = {
	"components/trade/components/trading-onboarding-gate.tsx":
		"opens the dialog itself once the funding snapshot is classified; there is no control to reach first",
};

const DEPOSIT_OPENER_PATTERN = /open: openDepositModal\b|\bdeposit\.open\(/;
const DEPOSIT_INTENT_PATTERN = /\bdepositModalIntentProps\b|\bwarmDepositModal\b|\bpreloadGlobalModal\b/;
const FUNDS_MODAL_CHROME_MARKER = "min-[1001px]:!max-w-[28rem]";

function listSources(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) return entry.name === "tests" || entry.name === "__tests__" ? [] : listSources(path);
		return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
	});
}

const sources = listSources(SOURCE_ROOT).map((path) => ({
	file: relative(SOURCE_ROOT, path),
	text: readFileSync(path, "utf8"),
}));

function read(file: string): string {
	const source = sources.find((entry) => entry.file === file);
	if (!source) throw new Error(`Missing source file: ${file}`);
	return source.text;
}

describe("loading placeholder contract", () => {
	it("registers every pulsing placeholder with its count and reason", () => {
		const found = Object.fromEntries(
			sources
				.map(({ file, text }) => [file, text.split("animate-pulse").length - 1] as const)
				.filter(([, count]) => count > 0),
		);
		const registered = Object.fromEntries(
			Object.entries(PULSING_PLACEHOLDERS).map(([file, { count }]) => [file, count]),
		);

		expect(found).toEqual(registered);
	});

	it("keeps the deposit dialog and its chunk fallback on one shell", () => {
		const fallback = read("components/trade/components/deposit-modal-loading-fallback.tsx");
		const dialog = read("components/trade/tradebox/deposit-modal.tsx");

		expect(fallback).toContain("<FundsModalShell");
		expect(dialog).toContain("<FundsModalShell");
		expect(dialog).not.toContain("<PendingActionModal");
		expect(sources.filter(({ text }) => text.includes(FUNDS_MODAL_CHROME_MARKER)).map(({ file }) => file)).toEqual([
			"components/trade/components/funds-modal-shell.tsx",
		]);
	});

	it("keeps the deposit chunk fallback free of a drawn form", () => {
		const fallback = read("components/trade/components/deposit-modal-loading-fallback.tsx");

		expect(fallback).not.toMatch(/data-skeleton-slot|animate-pulse|market-close-card|rounded-\[|\bh-\[/);
	});

	it("warms the deposit dialog from every control that opens it", () => {
		const openers = sources.filter(({ text }) => DEPOSIT_OPENER_PATTERN.test(text));
		const withoutIntent = openers.filter(({ text }) => !DEPOSIT_INTENT_PATTERN.test(text)).map(({ file }) => file);

		expect(openers.length).toBeGreaterThan(0);
		expect(withoutIntent.sort()).toEqual(Object.keys(DEPOSIT_OPENERS_WITHOUT_INTENT).sort());
	});
});
