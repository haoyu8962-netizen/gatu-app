// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { act, useSyncExternalStore } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FundingHistoryPanel } from "@/components/trade/chart/funding-history-panel";
import type { FundingHistoryRange, FundingRateBucket } from "@/domain/market/funding-rate-history";
import type { MarketFundingHistoryStatus } from "@/hooks/trade/use-market-funding-history";
import { formatDateTime, formatPercent } from "@/lib/format";
import type { UnifiedMarketInfo } from "@/lib/hyperliquid";
import { notifyNumberFormatChange } from "@/lib/number-format-reactivity";
import { createI18nRoot } from "./harness/react";

const HOUR_MS = 3_600_000;
const START = 1_790_496_000_000;

interface HistoryState {
	buckets: FundingRateBucket[];
	status: MarketFundingHistoryStatus;
}

const mocks = vi.hoisted(() => ({
	calls: [] as Array<{ coin: string; enabled: boolean; range: string }>,
	formatLocale: "en-US",
	listeners: new Set<() => void>(),
	refresh: vi.fn(),
	state: { buckets: [], status: "loading" } as { buckets: unknown[]; status: string },
}));

vi.mock("@/stores/use-global-settings-store", () => ({
	getResolvedFormatLocale: () => mocks.formatLocale,
}));

vi.mock("@/hooks/trade/use-market-funding-history", () => ({
	useMarketFundingHistory: (options: { coin: string; enabled: boolean; range: string }) => {
		mocks.calls.push(options);
		const state = useSyncExternalStore(
			(listener) => {
				mocks.listeners.add(listener);
				return () => mocks.listeners.delete(listener);
			},
			() => mocks.state,
		);
		return { ...state, isRefreshing: false, refresh: mocks.refresh };
	},
}));

function setHistory(next: HistoryState) {
	mocks.state = next;
	for (const listener of mocks.listeners) listener();
}

function market(name: string, kind: UnifiedMarketInfo["kind"]): UnifiedMarketInfo {
	return { kind, name } as UnifiedMarketInfo;
}

const READY_BUCKETS: FundingRateBucket[] = [
	{ cumulativeRate: "0.0001", rate: "0.0001", samples: 8, time: START },
	{ cumulativeRate: "0.00005", rate: "-0.00005", samples: 8, time: START + 8 * HOUR_MS },
	{ cumulativeRate: "0.00013", rate: "0.00008", samples: 8, time: START + 16 * HOUR_MS },
];

describe("FundingHistoryPanel", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		mocks.calls.length = 0;
		mocks.formatLocale = "en-US";
		mocks.refresh.mockReset();
		mocks.state = { buckets: [], status: "loading" };
		vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
			bottom: 240,
			height: 240,
			left: 0,
			right: 640,
			top: 0,
			width: 640,
			x: 0,
			y: 0,
			toJSON: () => ({}),
		});
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.restoreAllMocks();
		i18n.loadAndActivate({ locale: "en", messages: {} });
	});

	function render(props: { active?: boolean; market?: UnifiedMarketInfo | undefined } = {}) {
		act(() =>
			root.render(
				<FundingHistoryPanel
					active={props.active ?? true}
					market={"market" in props ? props.market : market("BTC", "perp")}
				/>,
			),
		);
	}

	function body() {
		const element = container.querySelector<HTMLElement>("[data-funding-history-body]");
		if (!element) throw new Error("Missing funding history body");
		return element;
	}

	function plot() {
		return container.querySelector<HTMLElement>("[data-funding-history-plot]");
	}

	function hover(clientX: number) {
		const target = plot();
		if (!target) throw new Error("Missing plot");
		act(() => {
			target.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX, clientY: 100 }));
		});
	}

	function tooltip() {
		return container.querySelector<HTMLElement>("[data-funding-history-tooltip]");
	}

	it("requests the selected perpetual market only while active", () => {
		render();
		expect(mocks.calls.at(-1)).toEqual({ coin: "BTC", enabled: true, range: "8h" });

		render({ active: false });
		expect(mocks.calls.at(-1)).toEqual({ coin: "BTC", enabled: false, range: "8h" });

		render({ market: market("xyz:AAPL", "builderPerp") });
		expect(mocks.calls.at(-1)).toEqual({ coin: "xyz:AAPL", enabled: true, range: "8h" });

		render({ market: market("@107", "spot") });
		expect(mocks.calls.at(-1)).toEqual({ coin: "", enabled: false, range: "8h" });

		render({ market: undefined });
		expect(mocks.calls.at(-1)).toEqual({ coin: "", enabled: false, range: "8h" });
	});

	it("keeps the first load blank and busy with only a screen-reader announcement", () => {
		render();

		expect(body().getAttribute("aria-busy")).toBe("true");
		expect(body().textContent).toBe("Loading...");
		expect(body().querySelector(".sr-only")?.textContent).toBe("Loading...");
		expect(plot()).toBeNull();
		expect(container.querySelector("button[data-funding-history-range]")).not.toBeNull();
	});

	it("gives each range button a phone-sized hit area without changing its look", () => {
		render();

		const buttons = [...container.querySelectorAll<HTMLButtonElement>("button[data-funding-history-range]")];
		expect(buttons).toHaveLength(3);
		for (const button of buttons) {
			expect(button.className).toContain("relative");
			expect(button.className).toContain("max-[1000px]:after:h-11");
			expect(button.className).toContain("max-[1000px]:after:absolute");
		}
	});

	it("shows only a neutral retry when the first load fails", () => {
		render();
		act(() => setHistory({ buckets: [], status: "error" }));

		const buttons = body().querySelectorAll("button");
		expect(body().getAttribute("aria-busy")).toBe("false");
		expect(buttons).toHaveLength(1);
		expect(body().textContent).toBe("Retry");
		expect(body().querySelector('[role="alert"]')).toBeNull();

		act(() => buttons[0]?.click());
		expect(mocks.refresh).toHaveBeenCalledTimes(1);
	});

	it.each(["offline", "disabled"] as const)("stays blank while %s", (status) => {
		render();
		act(() => setHistory({ buckets: [], status }));

		expect(body().textContent).toBe("");
		expect(body().getAttribute("aria-busy")).toBe("false");
	});

	it("states an empty history only for a confirmed empty snapshot", () => {
		render();
		act(() => setHistory({ buckets: [], status: "ready" }));

		expect(body().textContent).toBe("No funding history");
		expect(plot()).toBeNull();
	});

	it("draws the funding rate with market tones and the cumulative rate in the muted token", () => {
		render();
		act(() => setHistory({ buckets: READY_BUCKETS, status: "ready" }));

		const ratePath = container.querySelector("[data-funding-rate-path]");
		const gradientId = ratePath?.getAttribute("stroke")?.match(/^url\(#(.+)\)$/)?.[1];
		const stops = Array.from(container.ownerDocument.getElementById(gradientId ?? "")?.querySelectorAll("stop") ?? []);
		expect(stops.map((stop) => stop.getAttribute("class"))).toEqual([
			"text-market-up",
			"text-market-up",
			"text-market-down",
			"text-market-down",
		]);
		expect(stops.every((stop) => stop.getAttribute("stop-color") === "currentColor")).toBe(true);
		expect(container.querySelector("[data-funding-cumulative-path]")?.getAttribute("class")).toBe("text-fg-muted");
		expect(plot()?.getAttribute("dir")).toBe("ltr");
		expect(plot()?.getAttribute("aria-label")).toBe("Funding rate history");
		const summary = container.querySelector("[data-funding-history-summary]");
		expect(plot()?.getAttribute("aria-describedby")).toBe(summary?.id);
		expect(summary?.hasAttribute("hidden")).toBe(true);
		expect(summary?.textContent).toContain(`Latest funding rate ${formatPercent("0.00008", 4)}`);
		expect(summary?.textContent).toContain(`cumulative funding rate ${formatPercent("0.00013", 4)}`);
		expect(summary?.textContent).toContain(`lowest ${formatPercent("-0.00005", 4)}`);
		expect(container.querySelectorAll("[data-funding-rate-tick]")).toHaveLength(5);
		expect(container.querySelectorAll("[data-funding-cumulative-tick]")).toHaveLength(5);
		expect(container.querySelectorAll('[data-zero-line="true"]')).toHaveLength(1);
	});

	it("switches the range without persisting it", () => {
		render();
		const rangeButton = (range: FundingHistoryRange) =>
			container.querySelector<HTMLButtonElement>(`button[data-funding-history-range="${range}"]`);
		expect(rangeButton("8h")?.getAttribute("aria-pressed")).toBe("true");
		expect([rangeButton("1h"), rangeButton("8h"), rangeButton("1d")].map((button) => button?.textContent)).toEqual([
			"1h",
			"8h",
			"D",
		]);

		act(() => rangeButton("1h")?.click());

		expect(mocks.calls.at(-1)).toEqual({ coin: "BTC", enabled: true, range: "1h" });
		expect(rangeButton("1h")?.getAttribute("aria-pressed")).toBe("true");
		expect(rangeButton("8h")?.getAttribute("aria-pressed")).toBe("false");

		act(() => root.render(null));
		render();
		expect(mocks.calls.at(-1)?.range).toBe("8h");
	});

	it("shows the bucket time and four-decimal rates in the pointer tooltip", () => {
		render();
		act(() => setHistory({ buckets: READY_BUCKETS, status: "ready" }));

		hover(60);
		const first = tooltip();
		expect(first?.textContent).toContain(
			formatDateTime(START, { day: "numeric", hour: "2-digit", hourCycle: "h23", minute: "2-digit", month: "short" }),
		);
		expect(first?.textContent).toContain(`Funding Rate${formatPercent("0.0001", 4)}`);
		expect(first?.textContent).toContain(`Cumulative Funding Rate${formatPercent("0.0001", 4)}`);
		expect(formatPercent("0.0001", 4)).toBe("+0.0100%");
		expect(container.querySelector("[data-funding-crosshair]")).not.toBeNull();

		hover(320);
		expect(tooltip()?.textContent).toContain("-0.0050%");
		expect(tooltip()?.querySelector(".text-market-down")?.textContent).toBe("-0.0050%");

		act(() => {
			plot()?.dispatchEvent(new MouseEvent("pointerout", { bubbles: true, relatedTarget: document.body }));
		});
		expect(tooltip()).toBeNull();
	});

	it("labels daily buckets with their UTC date only", () => {
		render();
		act(() => container.querySelector<HTMLButtonElement>('button[data-funding-history-range="1d"]')?.click());
		const dayStart = Date.UTC(2026, 8, 20);
		act(() =>
			setHistory({
				buckets: [
					{ cumulativeRate: "0.0003", rate: "0.0003", samples: 24, time: dayStart },
					{ cumulativeRate: "0.0005", rate: "0.0002", samples: 24, time: dayStart + 24 * HOUR_MS },
				],
				status: "ready",
			}),
		);

		hover(60);
		expect(tooltip()?.firstElementChild?.textContent).toBe(
			formatDateTime(dayStart, { day: "numeric", month: "short", timeZone: "UTC", year: "numeric" }),
		);
	});

	it("follows language and number-format changes without remounting the chart", () => {
		render();
		act(() => setHistory({ buckets: READY_BUCKETS, status: "ready" }));
		hover(60);
		const plotNode = plot();
		const englishTime = tooltip()?.firstElementChild?.textContent;
		const firstTick = () => container.querySelectorAll("[data-funding-rate-tick]")[1]?.textContent;
		expect(firstTick()).toMatch(/^0\.\d+%$/);

		act(() => i18n.loadAndActivate({ locale: "zh", messages: {} }));
		expect(plot()).toBe(plotNode);
		const chineseTime = tooltip()?.firstElementChild?.textContent;
		expect(chineseTime).not.toBe(englishTime);
		expect(chineseTime).toBe(
			formatDateTime(START, { day: "numeric", hour: "2-digit", hourCycle: "h23", minute: "2-digit", month: "short" }),
		);

		mocks.formatLocale = "de-DE";
		act(() => notifyNumberFormatChange());
		expect(plot()).toBe(plotNode);
		expect(firstTick()).toMatch(/^0,\d+%$/);
		expect(tooltip()?.textContent).toContain("+0,0100%");
	});
});
