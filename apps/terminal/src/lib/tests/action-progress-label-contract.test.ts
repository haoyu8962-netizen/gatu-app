import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SOURCE_ROOT = resolve(__dirname, "../..");
const CATALOG = resolve(SOURCE_ROOT, "locales/en/messages.po");
const OWNER = "docs/confirmation-surfaces.md";
const ELLIPSIS = /(?:\.\.\.|…)$/;
// The forms a quick source scan can read on one line. It only checks that the catalog is current; the
// catalog is the record, because Lingui extracts every form (multi-line and attributed <Trans>, template
// message descriptors, plural branches) that a pattern cannot follow.
const SIMPLE_PROGRESS_LABEL =
	/(?:\b(?:t|msg|defineMessage)`|<Trans>|message: ")([^`<"$]*?(?:\.\.\.|…))(?:`|<\/Trans>|")/g;

// Every extracted message that ends in an ellipsis, per source file and once per extracted occurrence (the
// `#:` references of src/locales/en/messages.po, which lefthook re-extracts on every commit that touches the
// terminal source). A second use of a registered label in the same file changes the list too.
const REVIEWED_PROGRESS_LABELS: Record<string, { labels: string[]; reason: string }> = {
	"components/api-wallet/api-wallet-action-modal.tsx": {
		labels: ["Checking fresh API wallet data…"],
		reason: "passive fresh-data preflight before signing",
	},
	"components/api-wallet/api-wallet-list.tsx": { labels: ["Loading…", "Refreshing…"], reason: "passive list loading" },
	"components/leaderboard/leaderboard-view.tsx": {
		labels: ["Refreshing…"],
		reason: "refresh button while refetching public data",
	},
	"components/portfolio/portfolio-performance-chart.tsx": {
		labels: ["Loading..."],
		reason: "passive desktop chart loading",
	},
	"components/referrals/referral-activity.tsx": {
		labels: ["Loading recent reward claims…"],
		reason: "screen-reader-only passive loading",
	},
	"components/trade/chart/chart-panel.tsx": { labels: ["Loading..."], reason: "passive chart loading" },
	"components/trade/chart/funding-history-load-boundary.tsx": { labels: ["Loading..."], reason: "lazy chunk fallback" },
	"components/trade/chart/funding-history-panel.tsx": {
		labels: ["Loading..."],
		reason: "passive funding history loading",
	},
	"components/trade/chart/token-selector-content.tsx": {
		labels: ["Loading markets...", "Search markets..."],
		reason: "passive loading and an input placeholder",
	},
	"components/trade/chart/tradingview-chart.tsx": { labels: ["Loading..."], reason: "passive chart loading" },
	"components/trade/components/command-menu.tsx": { labels: ["Search markets..."], reason: "an input placeholder" },
	"components/trade/components/deposit-modal-loading-fallback.tsx": {
		labels: ["Loading..."],
		reason: "lazy chunk fallback",
	},
	"components/trade/components/establish-connection-modal.tsx": {
		labels: ["Connecting...", "Verifying..."],
		reason: "wallet handshake, not a trading action",
	},
	"components/trade/components/global-modals.tsx": { labels: ["Loading..."], reason: "lazy chunk fallback" },
	"components/trade/components/market-asset-info.tsx": {
		labels: ["Loading asset information...", "Loading token metadata..."],
		reason: "passive loading",
	},
	"components/trade/components/mobile-agent-qr-scanner.tsx": {
		labels: ["Looking for the desktop wallet QR...", "Starting camera...", "Starting camera..."],
		reason: "camera status",
	},
	"components/trade/components/wallet-modal.tsx": { labels: ["Connecting..."], reason: "wallet handshake" },
	"components/trade/header/user-menu-modal-boundary.tsx": {
		labels: ["Connecting...", "Connecting..."],
		reason: "wallet handshake",
	},
	"components/trade/header/user-menu.tsx": { labels: ["Connecting..."], reason: "wallet handshake" },
	"components/trade/mobile/mobile-book-view.tsx": {
		labels: ["Waiting for order book..."],
		reason: "passive data placeholder",
	},
	"components/trade/mobile/mobile-trade-view.tsx": {
		labels: ["Signing..."],
		reason: "Enable Trading signature, prerequisite of the order button",
	},
	"components/trade/positions/position-market-filter.tsx": {
		labels: ["Search markets..."],
		reason: "an input placeholder",
	},
	"components/trade/positions/position-pnl-share-modal.tsx": { labels: ["Saving..."], reason: "image export" },
	"components/trade/tradebox/bridge/asset-selection-screen.tsx": {
		labels: ["Loading balances across all chains..."],
		reason: "passive loading",
	},
	"components/trade/tradebox/bridge/confirmation-screen.tsx": {
		labels: ["Preparing your quote..."],
		reason: "passive loading",
	},
	"components/trade/tradebox/deposit-modal.tsx": {
		labels: ["Creating your wallet. Please wait..."],
		reason: "wallet provisioning",
	},
	"components/trade/tradebox/embedded-deposit-auto-bridge.tsx": {
		labels: [
			"Checking the current Hyperliquid deposit route...",
			"Depositing USDC to Hyperliquid...",
			"Preparing automatic USDC deposit...",
		],
		reason: "status screen of the multi-step sponsored deposit",
	},
	"components/ui/lazy-dialog-boundary.tsx": { labels: ["Loading...", "Loading..."], reason: "lazy chunk fallback" },
	"config/orderbook-labels.ts": { labels: ["Waiting for order book..."], reason: "passive order book placeholder" },
	"config/ui-text.ts": {
		labels: ["Loading...", "Signing...", "Waiting for order book..."],
		reason: "deprecated module-level labels; the button getters have no reader (2026-11-13)",
	},
	"hooks/trade/use-account-ledger-csv.ts": {
		labels: ["Exporting deposits and withdrawals..."],
		reason: "CSV export notice, not a trading or funds action",
	},
	"hooks/trade/use-account-overview-labels.ts": { labels: ["Loading..."], reason: "passive account overview loading" },
	"hooks/trade/use-history-csv-export.ts": {
		labels: ["Exporting funding payments...", "Exporting order history...", "Exporting trade history..."],
		reason: "CSV export notices, not a trading or funds action",
	},
	"hooks/trade/use-twap-fill-history-csv.ts": {
		labels: ["Exporting TWAP fill history..."],
		reason: "CSV export notice, not a trading or funds action",
	},
	"lib/errors/definitions/connection.ts": { labels: ["Loading wallet..."], reason: "wallet loading validator" },
	"lib/lifi/use-bridge.ts": {
		labels: [
			"Approving {symbol}...",
			"Bridging to Hyperliquid...",
			"Checking the submitted bridge transaction...",
			"Confirming on destination...",
			"Preparing transaction...",
			"Processing...",
			"Swapping on same chain...",
			"Swapping on source chain...",
			"Verifying access...",
			"Verifying access...",
		],
		reason: "steps of the bridge executing status screen",
	},
	"lib/trade/order-notification-copy.ts": {
		labels: ["Submitting…"],
		reason: "pending order notification, where submission status belongs",
	},
	"lib/trade/use-button-content.ts": {
		labels: ["Sign in wallet...", "Verifying..."],
		reason: "Enable Trading signature and verification, prerequisite of the order button",
	},
};

describe("trading action progress label contract", () => {
	const catalog = readCatalogProgressLabels(readFileSync(CATALOG, "utf8"));

	it("keeps submission progress out of trading controls", () => {
		expect(
			catalog,
			`An extracted message ending in an ellipsis was added to or removed from a source file. A control that submits a trading or funds action keeps its name while the request is pending and reports the outcome through a notification (${OWNER}, rule 6). Register the label here only when it is passive loading, a wallet handshake, a status screen or a notification.`,
		).toEqual(
			Object.fromEntries(Object.entries(REVIEWED_PROGRESS_LABELS).map(([file, entry]) => [file, entry.labels])),
		);
	});

	it("reads a catalog that is current for the labels a source scan can see", () => {
		for (const filePath of findSourceFiles(SOURCE_ROOT)) {
			const file = relative(SOURCE_ROOT, filePath);
			const extracted = [...(catalog[file] ?? [])];
			for (const label of scanSimpleLabels(readFileSync(filePath, "utf8"))) {
				const index = extracted.indexOf(label);
				expect(index, `${file}: "${label}" is not in the catalog yet; run pnpm i18n:extract`).toBeGreaterThan(-1);
				extracted.splice(index, 1);
			}
		}
	});

	it("gives every reviewed label a reason", () => {
		for (const [file, entry] of Object.entries(REVIEWED_PROGRESS_LABELS)) {
			expect(entry.reason.length, file).toBeGreaterThan(0);
		}
	});
});

describe("catalog progress label reader", () => {
	it("reads multi-line ids, repeated references and context entries, and skips obsolete and test entries", () => {
		const catalog = [
			'msgid ""',
			'msgstr ""',
			'"Language: en\\n"',
			"",
			"#: src/components/a.tsx",
			"#: src/components/a.tsx",
			"#: src/lib/tests/a.test.tsx",
			'msgid "Closing..."',
			'msgstr "Closing..."',
			"",
			"#: src/components/b.tsx",
			'msgctxt "close-all"',
			'msgid ""',
			'"Closing every "',
			'"position…"',
			'msgstr ""',
			"",
			"#: src/components/c.tsx",
			'#~ msgid "Retired..."',
			'#~ msgstr "Retired..."',
			"",
			"#: src/components/d.tsx",
			'msgid "Close"',
			'msgstr "Close"',
		].join("\n");
		expect(readCatalogProgressLabels(catalog)).toEqual({
			"components/a.tsx": ["Closing...", "Closing..."],
			"components/b.tsx": ["Closing every position…"],
		});
	});

	it.each([
		["the t macro", "{t`Closing...`}"],
		["the msg macro", "{_(msg`Closing...`)}"],
		["a Trans element", "<Trans>Closing...</Trans>"],
		["a message descriptor", 't({ message: "Closing..." })'],
	])("scans %s in the freshness check", (_form, source) => {
		expect(scanSimpleLabels(source)).toEqual(["Closing..."]);
	});
});

function readCatalogProgressLabels(text: string): Record<string, string[]> {
	const result: Record<string, string[]> = {};
	for (const block of text.split(/\n[ \t]*\n/)) {
		const lines = block.split("\n");
		const id = readMessageId(lines);
		if (id === null || !ELLIPSIS.test(id)) continue;
		for (const line of lines) {
			if (!line.startsWith("#: ")) continue;
			for (const reference of line.slice(3).trim().split(/\s+/)) {
				const file = reference.replace(/^src\//, "").replace(/:\d+$/, "");
				if (/(?:^|\/)(?:tests|__tests__)\//.test(file) || /\.test\.tsx?$/.test(file)) continue;
				result[file] = [...(result[file] ?? []), id];
			}
		}
	}
	for (const labels of Object.values(result)) labels.sort();
	return result;
}

function readMessageId(lines: string[]): string | null {
	const start = lines.findIndex((line) => line.startsWith("msgid "));
	if (start === -1) return null;
	const parts = [JSON.parse(lines[start].slice("msgid ".length)) as string];
	for (const line of lines.slice(start + 1)) {
		if (!line.startsWith('"')) break;
		parts.push(JSON.parse(line) as string);
	}
	return parts.join("");
}

function scanSimpleLabels(source: string): string[] {
	return [...source.matchAll(SIMPLE_PROGRESS_LABEL)].flatMap((match) => (match[1] ? [match[1]] : []));
}

function findSourceFiles(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const entryPath = resolve(directory, entry.name);
		if (entry.isDirectory()) {
			return entry.name === "tests" || entry.name === "__tests__" ? [] : findSourceFiles(entryPath);
		}
		return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [entryPath] : [];
	});
}
