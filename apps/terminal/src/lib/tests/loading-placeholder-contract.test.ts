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
	"components/funding-comparison/funding-comparison-view.tsx": {
		count: 1,
		reason: "generic rows on desktop, one blank card-sized block per row on phones",
	},
	"components/funding-history/funding-history-page.tsx": { count: 1, reason: "generic list rows" },
	"components/historical-orders/historical-orders-page.tsx": { count: 1, reason: "generic list rows" },
	"components/leaderboard/leaderboard-view.tsx": {
		count: 1,
		reason: "generic rows on desktop, one blank card-sized block per row on phones",
	},
	"components/portfolio/portfolio-page.tsx": { count: 1, reason: "blank panel-sized block, no inner layout" },
	"components/staking/staking-view.tsx": { count: 5, reason: "generic bars inside the real cards" },
	"components/trade-history/trade-history-page.tsx": { count: 1, reason: "generic list rows" },
	"components/trade/mobile/mobile-account-transfers-tab.tsx": {
		count: 2,
		reason: "export button icon while the export runs, not a placeholder",
	},
	"components/trade/positions/account-transfers-tab.tsx": {
		count: 1,
		reason: "export button icon while the export runs, not a placeholder",
	},
	"components/vaults/vaults-list.tsx": { count: 1, reason: "generic list rows" },
};

// Every file that opens the deposit dialog or carries its intent warm-up: how many calls open it
// and how many controls spread `depositModalIntentProps`. A control that opens the dialog without
// warming it, or a file where the two numbers differ, needs the reason here.
const DEPOSIT_OPENERS: Record<string, { opens: number; warms: number; note?: string }> = {
	"components/portfolio/portfolio-page.tsx": { opens: 2, warms: 2 },
	"components/trade/header/top-nav.tsx": { opens: 1, warms: 1 },
	"components/trade/mobile/mobile-account-view.tsx": { opens: 4, warms: 4 },
	"components/trade/mobile/mobile-balances-tab.tsx": {
		opens: 2,
		warms: 1,
		note: "both empty states render the one MobileBalancesState button",
	},
	"components/trade/mobile/mobile-nav-drawer.tsx": { opens: 1, warms: 1 },
	"components/trade/mobile/mobile-trade-view.tsx": { opens: 1, warms: 1 },
	"components/trade/positions/balances-tab.tsx": { opens: 2, warms: 2 },
	"components/trade/positions/positions-panel.tsx": { opens: 2, warms: 2 },
	"components/trade/tradebox/account-panel.tsx": {
		opens: 4,
		warms: 3,
		note: "the email deposit action is passed to DisconnectedAccountOverview, which warms on its button",
	},
	"components/trade/tradebox/disconnected-account-overview.tsx": {
		opens: 0,
		warms: 1,
		note: "receives the deposit action from AccountPanel",
	},
	"components/trade/tradebox/trade-panel.tsx": { opens: 1, warms: 1 },
	"components/trade/components/trading-onboarding-gate.tsx": {
		opens: 2,
		warms: 0,
		note: "opens the dialog itself once the funding snapshot is classified; there is no control to reach first",
	},
};

const DEPOSIT_ACTIONS_BINDING = /const\s+(\{[^}]*\}|\w+)\s*=\s*useDepositModalActions\(\)/g;
const DEPOSIT_ACTIONS_USE = /(?<!function )useDepositModalActions\(\)/g;
const DEPOSIT_WARM_SPREAD = /\{\.\.\.[^{}]*\bdepositModalIntentProps\b/g;
const FUNDS_MODAL_CHROME_MARKER = "min-[1001px]:!max-w-[28rem]";
const FALLBACK_CLASS_NAMES = [
	"flex min-h-72 items-center justify-center",
	"sr-only",
	"size-5 animate-spin text-fg-muted motion-reduce:animate-none",
];

function countDepositOpens(text: string): number {
	const uses = text.match(DEPOSIT_ACTIONS_USE)?.length ?? 0;
	const bindings = [...text.matchAll(DEPOSIT_ACTIONS_BINDING)].map((match) => match[1]);
	if (bindings.length !== uses) return Number.NaN;

	const callees = new Set<string>();
	for (const binding of bindings) {
		if (!binding.startsWith("{")) {
			callees.add(`${binding}.open`);
			continue;
		}
		const open = /\bopen\b(?:\s*:\s*(\w+))?/.exec(binding);
		if (open) callees.add(open[1] ?? "open");
	}
	let opens = 0;
	for (const callee of callees) {
		opens += text.match(new RegExp(`(?<![\\w.])${callee.replace(".", "\\.")}\\(`, "g"))?.length ?? 0;
	}
	return opens;
}

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
		const host = read("components/trade/components/global-modals.tsx");

		expect(fallback).toContain("<FundsModalShell");
		expect(dialog).not.toContain("<PendingActionModal");
		expect(dialog).toContain(
			[
				"<FundsModalShell",
				"open={open}",
				"onOpenChange={handleModalOpenChange}",
				"isPending={isWithdrawPending || isDepositPreflighting}",
				"presentation={presentation}",
				"tab={visibleTab}",
			].join("\n\t\t\t"),
		);
		expect(host).toContain('displayedModal === "deposit" ? <DepositModalLoadingFallback />');
		expect(sources.filter(({ text }) => text.includes(FUNDS_MODAL_CHROME_MARKER)).map(({ file }) => file)).toEqual([
			"components/trade/components/funds-modal-shell.tsx",
		]);
	});

	it("keeps the deposit chunk fallback to a spinner and its label", () => {
		const fallback = read("components/trade/components/deposit-modal-loading-fallback.tsx");
		const classNames = [...fallback.matchAll(/className="([^"]*)"/g)].map((match) => match[1]);

		expect(classNames).toEqual(FALLBACK_CLASS_NAMES);
		expect(fallback.split("className=").length - 1).toBe(FALLBACK_CLASS_NAMES.length);
		expect(fallback).not.toMatch(/\bstyle=|\{\s*\.\.\./);
	});

	it("warms the deposit dialog from every control that opens it", () => {
		const found = Object.fromEntries(
			sources
				.map(({ file, text }) => {
					const opens = countDepositOpens(text);
					const warms = text.match(DEPOSIT_WARM_SPREAD)?.length ?? 0;
					return [file, { opens, warms }] as const;
				})
				.filter(([, { opens, warms }]) => opens !== 0 || warms !== 0),
		);
		const registered = Object.fromEntries(
			Object.entries(DEPOSIT_OPENERS).map(([file, { opens, warms }]) => [file, { opens, warms }]),
		);

		expect(found).toEqual(registered);
		for (const [file, { opens, warms, note }] of Object.entries(DEPOSIT_OPENERS)) {
			expect(opens === warms || Boolean(note), `${file} needs a note`).toBe(true);
		}
	});
});
