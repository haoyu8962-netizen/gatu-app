/** @vitest-environment jsdom */

import { createHash } from "node:crypto";
import { i18n, type Messages } from "@lingui/core";
import { act, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FundingTab } from "@/components/trade/positions/funding-tab";
import { HistoryTab } from "@/components/trade/positions/history-tab";
import { formatDateTime } from "@/lib/format";
import { createI18nRoot } from "./harness/react";

const mocks = vi.hoisted(() => ({
	downloadCsv: vi.fn(),
	fills: [
		{
			coin: "BTC",
			closedPnl: "12.5",
			dir: "Close Long",
			fee: "0.12",
			feeToken: "USDC",
			hash: "0xaaa",
			liquidation: null,
			px: "100000",
			side: "A",
			sz: "0.01",
			tid: 1,
			time: 1_754_350_400_000,
		},
	] as Array<Record<string, unknown>>,
	fundings: [
		{ coin: "BTC", fundingRate: "0.0001", nSamples: null, szi: "0.01", time: 1_754_350_400_000, usdc: "1.25" },
	] as Array<Record<string, unknown>>,
	fundingError: undefined as unknown,
	fundingOffline: false,
	fundingStale: false,
	historyStatus: "ready" as "error" | "idle" | "loading" | "offline" | "ready",
	historyStale: false,
	fundingStatus: "ready" as "error" | "idle" | "loading" | "offline" | "ready",
	fillsBuildRows: null as ((items: unknown[]) => string[][]) | null,
}));

vi.mock("@/components/trade/components/asset-badge", () => ({
	AssetBadge: ({ coin }: { coin: string }) => <span>{coin}</span>,
}));

vi.mock("@tanstack/react-router", () => ({
	Link: ({ children, params, to, ...props }: { children?: ReactNode; params?: { address?: string }; to: string }) => (
		<a href={to.replace("$address", params?.address ?? "")} {...props}>
			{children}
		</a>
	),
}));

vi.mock("@/components/ui/scroll-area", () => ({
	ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	ScrollBar: () => null,
}));

vi.mock("@/components/ui/skeleton", () => ({
	Skeleton: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@/hooks/trade/use-market-navigation", () => ({
	useMarketNavigation: () => vi.fn(),
}));

vi.mock("@/hooks/trade/use-user-fills", () => ({
	useUserFills: () => ({
		error: null,
		fills: mocks.fills,
		isConnected: true,
		isStale: mocks.historyStale,
		status: mocks.historyStatus,
	}),
}));

vi.mock("@/hooks/trade/use-user-funding", () => ({
	useUserFunding: () => ({
		error: mocks.fundingError,
		fundings: mocks.fundings,
		isConnected: true,
		isOffline: mocks.fundingOffline,
		isStale: mocks.fundingStale,
		status: mocks.fundingStatus,
	}),
}));

vi.mock("@/hooks/trade/use-history-csv-export", () => ({
	useFundingHistoryCsvExport: ({
		buildRows,
		filename,
	}: {
		buildRows: (items: unknown[]) => string[][];
		filename: string;
	}) => ({
		exportCsv: async () =>
			mocks.downloadCsv(
				filename,
				buildRows([
					{ coin: "BTC", fundingRate: "0.0001", nSamples: null, szi: "0.01", time: 1_754_350_400_000, usdc: "1.25" },
				]),
			),
		isExporting: false,
	}),
	useUserFillsCsvExport: ({
		buildRows,
		filename,
	}: {
		buildRows: (items: unknown[]) => string[][];
		filename: string;
	}) => {
		mocks.fillsBuildRows = buildRows;
		return {
			exportCsv: async () =>
				mocks.downloadCsv(
					filename,
					buildRows([
						{
							coin: "BTC",
							closedPnl: "12.5",
							dir: "Close Long",
							fee: "0.12",
							feeToken: "USDC",
							hash: "0xaaa",
							liquidation: null,
							px: "100000",
							side: "A",
							sz: "0.01",
							tid: 1,
							time: 1_754_350_400_000,
						},
					]),
				),
			isExporting: false,
		};
	},
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({
		address: "0x1111111111111111111111111111111111111111",
		isConnected: true,
	}),
}));

vi.mock("@/lib/csv", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/csv")>()),
	downloadCsv: mocks.downloadCsv,
}));

vi.mock("@/lib/hyperliquid", () => ({
	getExplorerTxUrl: (hash: string) => `https://explorer.test/${hash}`,
	useMarkets: () => ({
		getMarket: (coin: string) => ({ kind: "perp", shortName: coin, szDecimals: 4 }),
		getSzDecimals: () => 4,
	}),
	useSubscription: () => ({
		data: {
			fundings: [{ coin: "BTC", fundingRate: "0.0001", szi: "0.01", time: 1_754_350_400_000, usdc: "1.25" }],
		},
		error: null,
		status: "active",
	}),
}));

vi.mock("@/stores/use-global-settings-store", () => ({
	getResolvedFormatLocale: () => "en-US",
	useIsTestnet: () => false,
}));

const ZH_CSV_LABELS: Record<string, string> = {
	Asset: "资产",
	"Close Long": "平多",
	Direction: "方向",
	"Open Long": "开多",
	Time: "时间",
	Trade: "交易",
	Type: "类型",
};
const zhCsvMessages: Messages = Object.fromEntries(
	Object.entries(ZH_CSV_LABELS).map(([english, chinese]) => [
		createHash("sha256").update(`${english}\x1f`).digest("base64").slice(0, 6),
		chinese,
	]),
);

describe("desktop history exports", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		mocks.fills = [
			{
				coin: "BTC",
				closedPnl: "12.5",
				dir: "Close Long",
				fee: "0.12",
				feeToken: "USDC",
				hash: "0xaaa",
				liquidation: null,
				px: "100000",
				side: "A",
				sz: "0.01",
				tid: 1,
				time: 1_754_350_400_000,
			},
		];
		mocks.fundings = [
			{ coin: "BTC", fundingRate: "0.0001", nSamples: null, szi: "0.01", time: 1_754_350_400_000, usdc: "1.25" },
		];
		mocks.fundingError = undefined;
		mocks.fundingOffline = false;
		mocks.fundingStale = false;
		mocks.fundingStatus = "ready";
		mocks.historyStatus = "ready";
		mocks.historyStale = false;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		mocks.downloadCsv.mockReset();
		mocks.fillsBuildRows = null;
		act(() => i18n.loadAndActivate({ locale: "en", messages: {} }));
		vi.useRealTimers();
	});

	function clickExport() {
		const button = Array.from(container.querySelectorAll("button")).find(
			(candidate) => candidate.textContent === "Export CSV",
		);
		expect(button).toBeDefined();
		act(() => button?.click());
	}

	it("exports the currently loaded fill rows with localized headers", () => {
		act(() => root.render(<HistoryTab />));

		const footer = container.querySelector('[data-testid="trade-history-footer"]');
		expect(footer).not.toBeNull();
		expect(Array.from(container.querySelectorAll("th"), (cell) => cell.textContent)).toEqual([
			"Asset",
			"Direction",
			"Type",
			"Price",
			"Size",
			"Fee",
			"PNL",
			"Time",
		]);
		expect(container.querySelector("table")?.className).toContain("min-w-[53rem]");
		expect(Array.from(container.querySelectorAll("col"), (column) => column.className)).toEqual([
			"w-[132px]",
			"w-[116px]",
			"w-[72px]",
			"w-[100px]",
			"w-[100px]",
			"w-[100px]",
			"w-[100px]",
			"w-[128px]",
		]);
		const directionBadge = Array.from(container.querySelectorAll("span")).find(
			(node) => node.textContent === "Close Long",
		);
		expect(directionBadge?.className).toContain("rounded-[4px]");
		expect(directionBadge?.className).toContain("bg-market-close-hover");
		expect(container.querySelector("tbody td")?.className).toContain("h-[43px]");
		expect(footer?.className).toContain("h-[38px]");
		expect(footer?.querySelector('a[href="/tradeHistory/0x1111111111111111111111111111111111111111"]')).not.toBeNull();
		expect(footer?.querySelector("svg")).toBeNull();
		clickExport();
		expect(mocks.downloadCsv).toHaveBeenCalledWith(
			"trade_history.csv",
			expect.arrayContaining([expect.arrayContaining(["Time", "Asset", "Direction", "Transaction"])]),
		);
	});

	it("shows closed PNL net of the fee while the export keeps the exchange's values", () => {
		act(() => root.render(<HistoryTab />));

		const headers = Array.from(container.querySelectorAll("th"), (cell) => cell.textContent);
		const cells = Array.from(container.querySelectorAll("tbody tr:first-child td"), (cell) => cell.textContent);
		expect(cells[headers.indexOf("PNL")]).toBe("+$12.38");
		clickExport();
		const rows = mocks.downloadCsv.mock.calls.at(-1)?.[1] as string[][] | undefined;
		expect(rows?.[1]?.[(rows?.[0] ?? []).indexOf("PNL")]).toBe("12.5");
	});

	it("exports fill numbers as the exchange sent them, never compacted, rounded or localized", () => {
		act(() => root.render(<HistoryTab />));
		const rows = mocks.fillsBuildRows?.([mocks.fills[0]]) ?? [];

		expect(rows[0]?.slice(4)).toEqual(["Price", "Size", "Fee", "Fee Token", "PNL", "Transaction"]);
		expect(rows[1]?.slice(4)).toEqual(["100000", "0.01", "0.12", "USDC", "12.5", "0xaaa"]);
	});

	it("writes exported fill headers, labels and dates in the language active when the rows are built", () => {
		act(() => root.render(<HistoryTab />));
		const buildRowsFromEnglishRender = mocks.fillsBuildRows;
		expect(buildRowsFromEnglishRender).not.toBeNull();

		act(() => i18n.loadAndActivate({ locale: "zh", messages: zhCsvMessages }));
		const rows = buildRowsFromEnglishRender?.([mocks.fills[0]]) ?? [];

		expect(rows[0]?.slice(0, 4)).toEqual(["时间", "资产", "方向", "类型"]);
		expect(rows[1]?.[0]).toBe(
			formatDateTime(1_754_350_400_000, { locale: "zh", dateStyle: "short", timeStyle: "short" }),
		);
		expect(rows[1]?.slice(1, 4)).toEqual(["BTC", "平多", "交易"]);
		expect(rows[1]?.[0]).toContain("2025");
		expect(formatDateTime(1_754_350_400_000, { locale: "zh", dateStyle: "short", timeStyle: "short" })).not.toBe(
			formatDateTime(1_754_350_400_000, { locale: "en", dateStyle: "short", timeStyle: "short" }),
		);
	});

	it("defensively caps the desktop trade table at 30 recent rows", () => {
		const fill = mocks.fills[0];
		mocks.fills = Array.from({ length: 35 }, (_, index) => ({
			...fill,
			tid: index + 1,
			time: Number(fill?.time) + index,
		}));

		act(() => root.render(<HistoryTab />));

		expect(container.querySelectorAll("tbody tr")).toHaveLength(30);
	});

	it("dates each fill with its year like the order history", () => {
		act(() => root.render(<HistoryTab />));

		const filledAt = new Date(1_754_350_400_000);
		expect(container.textContent).toContain(
			formatDateTime(filledAt.getTime(), { locale: "en", dateStyle: "short", timeStyle: "short" }),
		);
		expect(container.textContent).toContain(`${filledAt.getMonth() + 1}/${filledAt.getDate()}/25`);
	});

	it("labels ordinary fills as trades", () => {
		act(() => root.render(<HistoryTab />));

		expect(container.textContent).toContain("Trade");
		expect(container.textContent).not.toContain("TWAP");
	});

	it("keeps a fill against another account's liquidation an ordinary fill and labels the owner's own", () => {
		const [fill] = mocks.fills;
		mocks.fills = [
			{
				...fill,
				liquidation: { liquidatedUser: "0x9999999999999999999999999999999999999999", markPx: "1", method: "market" },
			},
			{ ...fill, hash: "0xbbb", liquidation: { markPx: "1", method: "market" }, tid: 2 },
		];
		act(() => root.render(<HistoryTab />));

		expect(container.textContent).toContain("Close Long (Price Improved)");
		expect(container.textContent).toContain("Market Order Liquidation: Close Long");
		expect(container.textContent).not.toContain("Liquidated");
	});

	it("keeps full trade export available when the recent display window is empty", () => {
		mocks.fills = [];
		act(() => root.render(<HistoryTab />));

		const button = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
			(candidate) => candidate.textContent === "Export CSV",
		);
		expect(container.textContent).toContain("No fills found.");
		expect(button?.disabled).toBe(false);
		act(() => button?.click());
		expect(mocks.downloadCsv).toHaveBeenCalledOnce();
	});

	it("labels the visible funding range and exports the complete requested history", () => {
		act(() => root.render(<FundingTab />));

		expect(container.textContent).toContain("Funding shown");
		const toolbar = container.querySelector('[data-testid="funding-history-toolbar"]');
		expect(toolbar).not.toBeNull();
		const footer = container.querySelector('[data-testid="funding-history-footer"]');
		expect(footer).not.toBeNull();
		expect(
			footer?.querySelector('a[href="/fundingHistory/0x1111111111111111111111111111111111111111"]'),
		).not.toBeNull();
		expect(container.querySelector("tbody td")?.className).toContain("h-10");
		expect(container.querySelector("table")?.className).toContain("min-w-[52rem]");
		expect(Array.from(container.querySelectorAll("col"), (column) => column.className)).toEqual([
			"w-[136px]",
			"w-[176px]",
			"w-[144px]",
			"w-[160px]",
			"w-[216px]",
		]);
		clickExport();
		expect(mocks.downloadCsv).toHaveBeenCalledWith(
			"funding_history.csv",
			expect.arrayContaining([
				["Time", "Asset", "Side", "Size", "Rate", "Payment", "Payment Token"],
				[expect.any(String), "BTC", "Long", "0.01", "0.0001", "1.25", "USDC"],
			]),
		);
	});

	it("dates each funding payment with its year in the table and the export", () => {
		act(() => root.render(<FundingTab />));

		const paidAt = new Date(1_754_350_400_000);
		const withYear = formatDateTime(paidAt.getTime(), { locale: "en", dateStyle: "short", timeStyle: "short" });
		expect(container.querySelector("tbody")?.textContent).toContain(withYear);
		expect(container.textContent).toContain(`${paidAt.getMonth() + 1}/${paidAt.getDate()}/25`);
		clickExport();
		expect(mocks.downloadCsv).toHaveBeenCalledWith(
			"funding_history.csv",
			expect.arrayContaining([[withYear, "BTC", "Long", "0.01", "0.0001", "1.25", "USDC"]]),
		);
	});

	it.each(["idle", "loading", "error", "offline"] as const)(
		"keeps %s histories quiet until confirmed empty",
		(status) => {
			mocks.fills = [];
			mocks.fundings = [];
			mocks.historyStatus = status;
			mocks.fundingStatus = status;
			act(() =>
				root.render(
					<>
						<HistoryTab />
						<FundingTab />
					</>,
				),
			);
			expect(container.textContent).not.toMatch(
				/Loading trade history|Failed to load|No fills found|No funding payments found|You are offline/,
			);
			mocks.historyStatus = "ready";
			mocks.fundingStatus = "ready";
			mocks.historyStale = true;
			mocks.fundingStale = true;
			act(() =>
				root.render(
					<>
						<HistoryTab />
						<FundingTab />
					</>,
				),
			);
			expect(container.textContent).not.toMatch(/No fills found|No funding payments found|updates paused/);
			mocks.historyStale = false;
			mocks.fundingStale = false;
			act(() =>
				root.render(
					<>
						<HistoryTab />
						<FundingTab />
					</>,
				),
			);
			expect(container.textContent).toContain("No fills found.");
			expect(container.textContent).toContain("No funding payments found.");
		},
	);

	it("keeps full funding export available when the recent display window is empty", () => {
		mocks.fundings = [];
		act(() => root.render(<FundingTab />));

		const button = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
			(candidate) => candidate.textContent === "Export CSV",
		);
		expect(container.textContent).toContain("No funding payments found.");
		expect(button?.disabled).toBe(false);
		act(() => button?.click());
		expect(mocks.downloadCsv).toHaveBeenCalledOnce();
	});

	it("keeps funding rows visible when live updates pause", () => {
		mocks.fundingError = new Error("WebSocket unavailable");
		act(() => root.render(<FundingTab />));

		expect(container.querySelectorAll("tbody tr")).toHaveLength(1);
		expect(container.textContent).not.toContain("Funding updates paused.");
	});

	it("keeps retained funding rows quiet while waiting for a fresh reconnect snapshot", () => {
		mocks.fundingStale = true;
		act(() => root.render(<FundingTab />));

		expect(container.querySelectorAll("tbody tr")).toHaveLength(1);
		expect(container.textContent).not.toContain("Funding updates paused.");
	});

	it("keeps offline recovery quiet and preserves already loaded funding rows", () => {
		mocks.fundingOffline = true;
		act(() => root.render(<FundingTab />));

		expect(container.querySelectorAll("tbody tr")).toHaveLength(1);
		expect(container.textContent).not.toContain("You are offline.");

		mocks.fundings = [];
		mocks.fundingStatus = "offline";
		act(() => root.render(<FundingTab />));
		expect(container.querySelector('[data-slot="passive-data-placeholder"]')).not.toBeNull();
		expect(container.textContent).not.toContain("No funding payments found.");
	});

	it("announces funding loading accessibly over a blank busy placeholder", () => {
		mocks.fundings = [];
		mocks.fundingStatus = "loading";
		act(() => root.render(<FundingTab />));

		const status = container.querySelector("output");
		expect(status?.className).toContain("sr-only");
		expect(status?.textContent).toContain("Loading funding payments.");
		const placeholder = container.querySelector('[data-slot="passive-data-placeholder"]');
		expect(placeholder?.getAttribute("aria-busy")).toBe("true");
		expect(placeholder?.childElementCount).toBe(0);
	});
});
