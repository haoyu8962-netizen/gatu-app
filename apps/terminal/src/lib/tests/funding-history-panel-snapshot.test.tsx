// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FundingHistoryPanel } from "@/components/trade/chart/funding-history-panel";
import type { UnifiedMarketInfo } from "@/lib/hyperliquid";
import { createI18nRoot } from "./harness/react";

const HOUR_MS = 3_600_000;
const NOW = 1_790_496_000_000 + 16 * HOUR_MS;
const STALE_TIME_MS = 5 * 60_000;
const NEW_MARKET = { kind: "builderPerp", name: "xyz:NEW" } as UnifiedMarketInfo;

const mocks = vi.hoisted(() => ({
	fundingHistory: vi.fn(),
	isOnline: true,
}));

vi.mock("@/lib/hyperliquid", () => ({
	useHyperliquid: () => ({ env: "Mainnet", info: { fundingHistory: mocks.fundingHistory } }),
}));

vi.mock("@/hooks/use-mobile", () => ({
	useOnlineStatus: () => mocks.isOnline,
}));

async function flush() {
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
}

// Fake timers give a zero-delay timer created during a tick a 1 ms delay, so TanStack's notification
// timers scheduled by an interval need a few extra milliseconds to reach React.
const NOTIFY_SETTLE_MS = 5;

async function advance(ms: number) {
	await act(async () => {
		await vi.advanceTimersByTimeAsync(ms + NOTIFY_SETTLE_MS);
	});
}

function deferred<T>() {
	let resolve: (value: T) => void = () => {};
	let reject: (error: unknown) => void = () => {};
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return { promise, reject, resolve };
}

describe("FundingHistoryPanel snapshot states", () => {
	let container: HTMLDivElement;
	let root: Root;
	let client: QueryClient;

	beforeEach(() => {
		vi.spyOn(Date, "now").mockReturnValue(NOW);
		i18n.loadAndActivate({ locale: "en", messages: {} });
		mocks.isOnline = true;
		mocks.fundingHistory.mockReset();
		client = new QueryClient();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		client.clear();
		vi.useRealTimers();
		onlineManager.setOnline(true);
		vi.restoreAllMocks();
	});

	async function render(active: boolean) {
		await act(async () => {
			root.render(
				<QueryClientProvider client={client}>
					<FundingHistoryPanel active={active} market={NEW_MARKET} />
				</QueryClientProvider>,
			);
		});
	}

	function body() {
		const element = container.querySelector<HTMLElement>("[data-funding-history-body]");
		if (!element) throw new Error("Missing funding history body");
		return element;
	}

	async function showStaleEmptySnapshot() {
		mocks.fundingHistory.mockResolvedValueOnce([]);
		await render(true);
		await flush();
		expect(body().textContent).toBe("No funding history");

		await render(false);
		vi.spyOn(Date, "now").mockReturnValue(NOW + 10 * 60_000);
	}

	it("replaces a stale empty conclusion with a neutral retry when the refresh fails", async () => {
		await showStaleEmptySnapshot();
		mocks.fundingHistory.mockRejectedValueOnce(new Error("server error"));
		await render(true);
		await flush();

		expect(mocks.fundingHistory).toHaveBeenCalledTimes(2);
		expect(body().textContent).toBe("Retry");
		expect(body().getAttribute("aria-busy")).toBe("false");
		expect(body().querySelector('[role="alert"]')).toBeNull();

		mocks.fundingHistory.mockResolvedValueOnce([]);
		await act(async () => body().querySelector("button")?.click());
		await flush();
		expect(body().textContent).toBe("No funding history");
	});

	it("does not keep confirming an empty history once it goes stale in the active view", async () => {
		vi.useFakeTimers({ now: NOW, toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
		mocks.fundingHistory.mockResolvedValueOnce([]);
		await render(true);
		await advance(0);
		expect(body().textContent).toBe("No funding history");

		const refresh = deferred<unknown>();
		mocks.fundingHistory.mockReturnValueOnce(refresh.promise);
		await advance(STALE_TIME_MS);

		expect(mocks.fundingHistory).toHaveBeenCalledTimes(2);
		expect(body().textContent).toBe("Loading...");
		expect(body().getAttribute("aria-busy")).toBe("true");

		await act(async () => refresh.reject(new Error("server error")));
		await advance(0);
		expect(body().textContent).toBe("Retry");
		expect(body().getAttribute("aria-busy")).toBe("false");
		expect(body().querySelector('[role="alert"]')).toBeNull();
	});

	it("does not confirm an empty history that aged past five minutes while the system clock was set back", async () => {
		vi.useFakeTimers({
			now: NOW,
			toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date", "performance"],
		});
		mocks.fundingHistory.mockResolvedValueOnce([]);
		await render(true);
		await advance(0);
		expect(body().textContent).toBe("No funding history");

		await render(false);
		vi.setSystemTime(Date.now() - HOUR_MS);
		await advance(STALE_TIME_MS);

		const refresh = deferred<unknown>();
		mocks.fundingHistory.mockReturnValueOnce(refresh.promise);
		await render(true);

		expect(mocks.fundingHistory).toHaveBeenCalledTimes(2);
		expect(body().textContent).toBe("Loading...");
		expect(body().getAttribute("aria-busy")).toBe("true");

		await act(async () => refresh.resolve([]));
		await advance(0);
		expect(body().textContent).toBe("No funding history");
	});

	it("keeps a stale empty snapshot blank while its refresh is paused offline", async () => {
		await showStaleEmptySnapshot();
		mocks.isOnline = false;
		onlineManager.setOnline(false);
		await render(true);
		await flush();

		expect(mocks.fundingHistory).toHaveBeenCalledTimes(1);
		expect(body().textContent).toBe("");
		expect(body().getAttribute("aria-busy")).toBe("false");
	});
});
