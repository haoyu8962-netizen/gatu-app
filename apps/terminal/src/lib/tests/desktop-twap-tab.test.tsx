/** @vitest-environment jsdom */

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({
	cancelTwap: vi.fn(),
	cancellingTwapId: null as number | null,
	hasActiveOrder: true,
	navigateToMarket: vi.fn(),
	setOrderType: vi.fn(),
	twap: {
		coin: "xyz:GOOGL",
		side: "B",
		sz: "15.33",
		executedSz: "6.13",
		executedNtl: "2298.0144",
		timestamp: Date.UTC(2026, 0, 1, 0, 0, 0),
		minutes: 20,
		reduceOnly: false,
	},
}));

vi.mock("@/components/ui/scroll-area", () => ({
	ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	ScrollBar: () => null,
}));

vi.mock("@/components/ui/time-ticker", () => ({
	TimeTicker: ({ format }: { format: (elapsedMs: number) => string }) => <>{format(0)}</>,
}));

vi.mock("@/hooks/trade/use-market-navigation", () => ({
	useMarketNavigation: () => testState.navigateToMarket,
}));

vi.mock("@/hooks/trade/use-twap-cancel", () => ({
	useTwapCancel: () => ({
		cancelTwap: testState.cancelTwap,
		cancellingTwapId: testState.cancellingTwapId,
		feedback: null,
	}),
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({ address: "0x1234", isConnected: true }),
}));

vi.mock("@/lib/hyperliquid", () => ({
	useMarkets: () => ({
		getMarket: () => ({ shortName: "GOOGL", kind: "builderPerp" }),
		getSzDecimals: () => 2,
	}),
	useSubscription: () => ({
		data: { states: testState.hasActiveOrder ? [[45, testState.twap]] : [] },
		status: "active",
		error: null,
		isStale: false,
	}),
}));

vi.mock("@/stores/use-order-entry-store", () => ({
	useOrderEntryActions: () => ({ setOrderType: testState.setOrderType }),
}));

import { TwapTab } from "@/components/trade/positions/twap-tab";

describe("desktop TWAP toolbar", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(testState.twap.timestamp + 5 * 60_000);
		testState.twap.side = "B";
		testState.cancellingTwapId = null;
		testState.hasActiveOrder = true;
		testState.cancelTwap.mockReset();
		testState.navigateToMarket.mockReset();
		testState.setOrderType.mockReset();
		i18n.load("en", {});
		i18n.activate("en");
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.useRealTimers();
	});

	function render() {
		act(() => {
			root.render(
				<I18nProvider i18n={i18n}>
					<TwapTab />
				</I18nProvider>,
			);
		});
	}

	it("renders the seven design columns from SDK state and Big.js-derived metrics", () => {
		render();

		expect(Array.from(container.querySelectorAll("th"), (cell) => cell.textContent)).toEqual([
			"Asset",
			"Direction",
			"Execution Progress",
			"Average Fill Price",
			"Suborder Frequency",
			"Remaining Time",
			"Actions",
		]);
		expect(container.textContent).toContain("GOOGL");
		expect(container.textContent).toContain("Buy / Long");
		expect(container.textContent).toContain("6.13 / 15.33 GOOGL");
		expect(container.textContent).toContain("40.0%");
		expect(container.textContent).toContain("$374.88");
		expect(container.textContent).toContain("Every 30 seconds");
		expect(container.textContent).toContain("00:15:00");

		const progress = container.querySelector<HTMLElement>('[role="progressbar"]');
		expect(progress?.getAttribute("aria-valuenow")).toBe("0.3998695368558382");
		expect(progress?.getAttribute("aria-valuetext")).toBe("40.0%");
		expect(progress?.firstElementChild?.getAttribute("style")).toContain("scaleX(0.3998695368558382");
	});

	it("explains the unsupported pause action and submits terminate with the exact SDK identity", () => {
		render();

		const pause = container.querySelector<HTMLButtonElement>(
			'button[aria-label="Pause unavailable: Hyperliquid does not support pausing active TWAP orders."]',
		);
		expect(pause?.textContent).toBe("Pause");
		expect(pause?.disabled).toBe(true);
		const terminate = container.querySelector<HTMLButtonElement>('button[aria-label="Terminate TWAP order"]');
		expect(terminate?.textContent).toBe("Terminate");

		act(() => terminate?.click());
		expect(testState.cancelTwap).toHaveBeenCalledWith("xyz:GOOGL", 45);

		testState.twap.side = "A";
		testState.cancellingTwapId = 45;
		render();

		expect(container.textContent).toContain("Sell / Short");
		const sellDirection = Array.from(container.querySelectorAll("td")).find(
			(cell) => cell.textContent === "Sell / Short",
		);
		expect(sellDirection?.className).toContain("text-market-close-danger");
		const busyTerminate = container.querySelector<HTMLButtonElement>('button[aria-label="Terminate TWAP order"]');
		expect(busyTerminate?.disabled).toBe(true);
		expect(busyTerminate?.getAttribute("aria-busy")).toBe("true");
		expect(busyTerminate?.textContent).toBe("Terminating...");
	});

	it("reuses the existing order-entry action for the empty-state CTA", () => {
		testState.hasActiveOrder = false;
		render();

		const createButton = Array.from(container.querySelectorAll("button")).find(
			(button) => button.textContent === "Create TWAP",
		);
		expect(createButton).toBeDefined();
		act(() => createButton?.click());
		expect(testState.setOrderType).toHaveBeenCalledWith("twap");
	});
});
