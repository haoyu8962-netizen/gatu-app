import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const TRADE_COMPONENTS_DIR = resolve(__dirname, "../../components/trade");
const OWNER = "docs/confirmation-surfaces.md";
const PROGRESS_LABEL = /(?:t`|<Trans>|message: ")([^`<"]*?(?:\.\.\.|…))(?:`|<\/Trans>|")/g;

const REVIEWED_PROGRESS_LABELS: Record<string, { labels: string[]; reason: string }> = {
	"chart/chart-panel.tsx": { labels: ["Loading..."], reason: "passive chart loading" },
	"chart/funding-history-load-boundary.tsx": { labels: ["Loading..."], reason: "lazy chunk fallback" },
	"chart/funding-history-panel.tsx": { labels: ["Loading..."], reason: "passive funding history loading" },
	"chart/token-selector-content.tsx": {
		labels: ["Loading markets...", "Search markets..."],
		reason: "passive loading and an input placeholder",
	},
	"chart/tradingview-chart.tsx": { labels: ["Loading..."], reason: "passive chart loading" },
	"components/deposit-modal-loading-fallback.tsx": { labels: ["Loading..."], reason: "lazy chunk fallback" },
	"components/establish-connection-modal.tsx": {
		labels: ["Connecting...", "Verifying..."],
		reason: "wallet handshake, not a trading action",
	},
	"components/global-modals.tsx": { labels: ["Loading..."], reason: "lazy chunk fallback" },
	"components/market-asset-info.tsx": {
		labels: ["Loading asset information...", "Loading token metadata..."],
		reason: "passive loading",
	},
	"components/mobile-agent-qr-scanner.tsx": {
		labels: ["Looking for the desktop wallet QR...", "Starting camera..."],
		reason: "camera status",
	},
	"components/wallet-modal.tsx": { labels: ["Connecting..."], reason: "wallet handshake" },
	"header/user-menu-modal-boundary.tsx": { labels: ["Connecting..."], reason: "wallet handshake" },
	"header/user-menu.tsx": { labels: ["Connecting..."], reason: "wallet handshake" },
	"mobile/mobile-book-view.tsx": { labels: ["Waiting for order book..."], reason: "passive data placeholder" },
	"mobile/mobile-trade-view.tsx": {
		labels: ["Signing..."],
		reason: "Enable Trading signature, prerequisite of the order button",
	},
	"positions/position-pnl-share-modal.tsx": { labels: ["Saving..."], reason: "image export" },
	"positions/position-tpsl-modal.tsx": { labels: ["Loading..."], reason: "passive mark price loading" },
	"tradebox/bridge/asset-selection-screen.tsx": {
		labels: ["Loading balances across all chains..."],
		reason: "passive loading",
	},
	"tradebox/bridge/confirmation-screen.tsx": { labels: ["Preparing your quote..."], reason: "passive loading" },
	"tradebox/deposit-modal.tsx": { labels: ["Creating your wallet. Please wait..."], reason: "wallet provisioning" },
	"tradebox/embedded-deposit-auto-bridge.tsx": {
		labels: [
			"Checking the current Hyperliquid deposit route...",
			"Depositing USDC to Hyperliquid...",
			"Preparing automatic USDC deposit...",
		],
		reason: "status screen of the multi-step sponsored deposit",
	},
};

describe("trading action progress label contract", () => {
	const found = collectProgressLabels();

	it("keeps submission progress out of trading controls", () => {
		expect(
			found,
			`A trading component gained or lost a label ending in an ellipsis. A control that submits a trading or funds action keeps its name while the request is pending and reports the outcome through a notification (${OWNER}, rule 6). Register the label here only when it is passive loading, a wallet handshake or a status screen.`,
		).toEqual(
			Object.fromEntries(Object.entries(REVIEWED_PROGRESS_LABELS).map(([file, entry]) => [file, entry.labels])),
		);
	});

	it("gives every reviewed label a reason", () => {
		for (const [file, entry] of Object.entries(REVIEWED_PROGRESS_LABELS)) {
			expect(entry.reason.length, file).toBeGreaterThan(0);
		}
	});
});

function collectProgressLabels(): Record<string, string[]> {
	const result: Record<string, string[]> = {};
	for (const filePath of findTsxFiles(TRADE_COMPONENTS_DIR)) {
		const labels = new Set<string>();
		for (const match of readFileSync(filePath, "utf8").matchAll(PROGRESS_LABEL)) {
			if (match[1]) labels.add(match[1]);
		}
		if (labels.size > 0) result[relative(TRADE_COMPONENTS_DIR, filePath)] = [...labels].sort();
	}
	return result;
}

function findTsxFiles(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const entryPath = resolve(directory, entry.name);
		if (entry.isDirectory()) return findTsxFiles(entryPath);
		return entry.name.endsWith(".tsx") ? [entryPath] : [];
	});
}
