import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SOURCE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// Spinning indicators that stay, with the reason and the number of `animate-spin` uses in the file.
// The status of a requested action uses the Sairn motion components instead (docs/brand-assets.md,
// status motion); a new spinner needs a reason here.
const ALLOWED_SPINNERS: Record<string, { count: number; reason: string }> = {
	"components/api-wallet/api-wallet-action-modal.tsx": {
		count: 1,
		reason: "passive fresh-data preflight before signing",
	},
	"components/api-wallet/api-wallet-list.tsx": { count: 1, reason: "passive list refresh" },
	"components/funding-history/funding-history-page.tsx": { count: 1, reason: "refresh button while refetching" },
	"components/historical-orders/historical-orders-page.tsx": { count: 1, reason: "refresh button while refetching" },
	"components/leaderboard/leaderboard-view.tsx": { count: 1, reason: "refresh button while refetching" },
	"components/referrals/referral-dashboard.tsx": { count: 1, reason: "passive referral data refresh" },
	"components/staking/staking-view.tsx": { count: 1, reason: "passive staking data refresh" },
	"components/trade-history/trade-history-page.tsx": { count: 1, reason: "refresh button while refetching" },
	"components/trade/chart/tradingview-chart.tsx": {
		count: 2,
		reason: "chart rebuild and rate-limit recovery (first load uses BrandPageLoader)",
	},
	"components/trade/components/deposit-modal-loading-fallback.tsx": { count: 1, reason: "lazy dialog chunk fallback" },
	"components/trade/components/global-modals.tsx": { count: 1, reason: "lazy dialog chunk fallback" },
	"components/trade/footer/footer-bar.tsx": { count: 1, reason: "passive connection status" },
	"components/trade/header/user-menu-modal-boundary.tsx": { count: 1, reason: "lazy dialog chunk fallback" },
	"components/trade/header/user-menu.tsx": {
		count: 1,
		reason: "authentication initialising; a 16px indicator would widen the measured header (runtime guardrails §11)",
	},
	"components/trade/mobile/mobile-book-view.tsx": { count: 1, reason: "passive order book reconnect" },
	"components/trade/mobile/mobile-nav-drawer.tsx": { count: 2, reason: "lazy route chunk fallbacks" },
	"components/trade/mobile/mobile-trade-view.tsx": {
		count: 1,
		reason: "mobile order submit, pending the decision to match the desktop button that shows no submission status",
	},
	"components/trade/positions/position-limit-close-modal.tsx": {
		count: 1,
		reason: "passive position snapshot loading",
	},
	"components/trade/positions/position-market-close-modal.tsx": {
		count: 1,
		reason: "passive position snapshot loading",
	},
	"components/trade/tradebox/bridge/asset-selection-screen.tsx": { count: 1, reason: "passive route list loading" },
	"components/trade/tradebox/bridge/confirmation-screen.tsx": { count: 1, reason: "passive quote refresh" },
	"components/trade/tradebox/trade-header.tsx": {
		count: 1,
		reason: "account mode control while its value loads or updates",
	},
	"components/ui/lazy-dialog-boundary.tsx": { count: 1, reason: "lazy dialog chunk fallback" },
	"components/ui/spinner.tsx": { count: 1, reason: "shared passive positions loading" },
	"components/vaults/vaults-list.tsx": { count: 1, reason: "refresh button while refetching" },
};

// Surfaces that report a requested action's status and must keep using the motion components.
const MOTION_SURFACES: Record<string, string> = {
	"components/trade/tradebox/order-toast.tsx": "<StatusGlyph",
	"components/ui/sonner.tsx": "<StatusGlyph",
	"components/funds-action/funds-action-recovery-host.tsx": "<StatusGlyph",
	"components/trade/tradebox/deposit/shared-ui.tsx": "<BrandMotion",
	"components/vaults/vault-action-modal.tsx": "<BrandMotion",
	"components/api-wallet/api-wallet-action-modal.tsx": "<BrandMotion",
	"components/trade/tradebox/bridge/executing-screen.tsx": "<BrandMotion",
	"components/trade/components/trading-action-button.tsx": "<ButtonLoading",
	"components/trade/tradebox/trade-panel.tsx": "<ButtonLoading",
	"components/trade/components/establish-connection-modal.tsx": "<ButtonLoading",
	"components/trade/components/wallet-modal.tsx": "<ButtonLoading",
	"components/trade/tradebox/deposit/wrong-network-screen.tsx": "<ButtonLoading",
	"components/trade/components/mobile-agent-sync-modal.tsx": "<ButtonLoading",
	"components/trade/components/mobile-agent-qr-scanner.tsx": "<ButtonLoading",
	"routes/mobile-agent-sync.tsx": "<ButtonLoading",
	"components/referrals/referral-code-card.tsx": "BRAND_MOTION_COPY_FEEDBACK",
	"components/trade/tradebox/deposit/funding-address-card.tsx": "BRAND_MOTION_COPY_FEEDBACK",
};

function listSources(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) return entry.name === "tests" || entry.name === "__tests__" ? [] : listSources(path);
		return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
	});
}

describe("status motion surfaces", () => {
	it("keeps every remaining spinner on the reviewed list with its count", () => {
		const actual: Record<string, number> = {};
		for (const file of listSources(SOURCE_ROOT)) {
			const count = readFileSync(file, "utf8").match(/animate-spin/g)?.length ?? 0;
			if (count > 0) actual[relative(SOURCE_ROOT, file)] = count;
		}
		const expected = Object.fromEntries(Object.entries(ALLOWED_SPINNERS).map(([file, entry]) => [file, entry.count]));
		expect(actual).toEqual(expected);
	});

	it("reports requested actions with the Sairn motion components", () => {
		for (const [file, marker] of Object.entries(MOTION_SURFACES)) {
			const source = readFileSync(resolve(SOURCE_ROOT, file), "utf8");
			expect(source, file).toContain(marker);
			expect(source, file).not.toContain("animate-ping");
		}
	});
});
