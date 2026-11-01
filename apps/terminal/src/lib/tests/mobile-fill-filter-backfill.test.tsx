// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import type { UserFillsResponse } from "@nktkas/hyperliquid";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, type ReactNode, useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type UserFill = UserFillsResponse[number];

const OWNER = "0x1111111111111111111111111111111111111111" as const;
const BASE_TIME = 1_800_000_000_000;

const live = vi.hoisted(() => {
	const listeners = new Set<() => void>();
	let snapshot = {
		data: undefined as { fills: unknown[]; user: string } | undefined,
		error: null as unknown,
		isStale: false,
		status: "active" as "active" | "error" | "subscribing",
	};
	return {
		get: () => snapshot,
		set(next: Partial<typeof snapshot>) {
			snapshot = { ...snapshot, ...next };
			for (const listener of listeners) listener();
		},
		subscribe(listener: () => void) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	};
});

const mocks = vi.hoisted(() => ({
	userFills: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
	Link: ({ children }: { children?: ReactNode }) => <a href="/tradeHistory">{children}</a>,
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({ address: OWNER, isConnected: true }),
}));

vi.mock("@/hooks/trade/use-history-csv-export", () => ({
	useUserFillsCsvExport: () => ({ exportCsv: async () => undefined, isExporting: false }),
}));

vi.mock("@/hooks/trade/use-market-navigation", () => ({ useMarketNavigation: () => vi.fn() }));

vi.mock("@/components/trade/mobile/use-mobile-terminal-tab", () => ({
	useMobileTerminalTab: () => ({ setActiveTab: vi.fn() }),
}));

vi.mock("@/stores/use-global-settings-store", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/stores/use-global-settings-store")>()),
	useIsTestnet: () => false,
}));

vi.mock("@/lib/hyperliquid", () => ({
	getExplorerTxUrl: (hash: string) => `https://explorer.test/${hash}`,
	useHyperliquid: () => ({ env: "Mainnet", info: { userFills: mocks.userFills } }),
	useMarkets: () => ({
		getMarket: (coin: string) => ({ kind: "perp", shortName: coin, szDecimals: 3 }),
		getSzDecimals: () => 3,
		getTokenDisplayName: (name: string) => name,
	}),
	useSubscription: (_method: string, _params: unknown, options: { enabled?: boolean }) => {
		const snapshot = useSyncExternalStore(live.subscribe, live.get, live.get);
		return options.enabled === false ? { data: undefined, error: null, isStale: false, status: "idle" } : snapshot;
	},
}));

import { MobileHistoryTab } from "@/components/trade/mobile/mobile-history-tab";
import { TRADE_HISTORY_SNAPSHOT_LIMIT } from "@/lib/trade/trade-history";

function fill(index: number, overrides: Partial<UserFill> = {}): UserFill {
	return {
		closedPnl: "0",
		coin: "BTC",
		crossed: false,
		dir: "Open Long",
		fee: "0.01",
		feeToken: "USDC",
		hash: `0x${index.toString(16).padStart(64, "0")}`,
		oid: index,
		px: "100",
		side: "B",
		startPosition: "0",
		sz: "1",
		tid: index,
		time: BASE_TIME + index,
		twapId: null,
		...overrides,
	};
}

function recentBuys(): UserFill[] {
	return Array.from({ length: 30 }, (_, index) => fill(1_000 + index));
}

function setLiveFills(fills: UserFill[]) {
	live.set({ data: { fills, user: OWNER }, error: null, isStale: false, status: "active" });
}

interface Deferred {
	resolve: (fills: UserFill[]) => void;
	reject: (error: Error) => void;
}

function deferUserFills(): Deferred[] {
	const pending: Deferred[] = [];
	mocks.userFills.mockImplementation(
		() =>
			new Promise<UserFill[]>((resolve, reject) => {
				pending.push({ resolve, reject });
			}),
	);
	return pending;
}

describe("phone fills filter backfill", () => {
	let client: QueryClient;
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
		client = new QueryClient({ defaultOptions: { queries: { gcTime: Number.POSITIVE_INFINITY, retry: false } } });
		mocks.userFills.mockReset();
		setLiveFills(recentBuys());
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		client.clear();
	});

	async function flush() {
		for (let step = 0; step < 4; step += 1) {
			await act(async () => {
				await new Promise((resolve) => setTimeout(resolve, 0));
			});
		}
	}

	async function render() {
		await act(async () =>
			root.render(
				<QueryClientProvider client={client}>
					<I18nProvider i18n={i18n}>
						<MobileHistoryTab scrollMode="page" />
					</I18nProvider>
				</QueryClientProvider>,
			),
		);
		await flush();
	}

	async function selectOption(fieldLabel: string, optionLabel: string) {
		const label = Array.from(container.querySelectorAll("label")).find(
			(candidate) => candidate.textContent === fieldLabel,
		);
		const trigger = label?.parentElement?.querySelector<HTMLButtonElement>('[role="combobox"]');
		expect(trigger).toBeDefined();
		await act(async () => {
			trigger?.click();
			await Promise.resolve();
		});
		const option = Array.from(document.body.querySelectorAll<HTMLElement>('[role="option"]')).find((candidate) =>
			candidate.textContent?.includes(optionLabel),
		);
		expect(option).toBeDefined();
		await act(async () => {
			option?.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
			await Promise.resolve();
			option?.click();
			await Promise.resolve();
		});
		await flush();
	}

	function listRegion(): HTMLElement {
		const list = container.querySelector<HTMLElement>('[data-testid="mobile-trade-history-list"]');
		if (!list) throw new Error("Missing the fills list");
		return list;
	}

	function retryButton(): HTMLButtonElement | undefined {
		return Array.from(listRegion().querySelectorAll<HTMLButtonElement>("button")).find(
			(button) => button.textContent?.trim() === "Retry",
		);
	}

	it("searches the userFills snapshot only while a filter is on and merges it with the live fills", async () => {
		const olderSell = fill(1, { coin: "SOL", crossed: true, side: "A", dir: "Close Long" });
		mocks.userFills.mockResolvedValue([...recentBuys(), olderSell]);
		await render();
		expect(mocks.userFills).not.toHaveBeenCalled();
		expect(container.querySelectorAll("article")).toHaveLength(30);

		await selectOption("Direction", "Sell");

		expect(mocks.userFills).toHaveBeenCalledOnce();
		expect(mocks.userFills).toHaveBeenCalledWith({ aggregateByTime: true, user: OWNER }, expect.any(AbortSignal));
		expect(container.querySelectorAll("article")).toHaveLength(1);
		expect(container.querySelector('[aria-label="Switch to SOL market"]')).not.toBeNull();
		expect(container.textContent).not.toContain("No fills match these filters");
	});

	it("keeps one card per time, coin and trade id, with the live copy of a fill", async () => {
		const liveSell = fill(1_040, { coin: "ETH", crossed: true, side: "A", hash: `0x${"e".repeat(64)}` });
		setLiveFills([liveSell, ...recentBuys().slice(0, 29)]);
		mocks.userFills.mockResolvedValue([{ ...liveSell, hash: `0x${"f".repeat(64)}` }, fill(2, { side: "A" })]);
		await render();

		await selectOption("Direction", "Sell");
		const cards = Array.from(container.querySelectorAll("article"));
		expect(cards).toHaveLength(2);
		act(() => cards[0]?.querySelector<HTMLButtonElement>("button[aria-expanded]")?.click());
		expect(container.querySelector(`a[href="https://explorer.test/0x${"e".repeat(64)}"]`)).not.toBeNull();
		expect(container.querySelector(`a[href="https://explorer.test/0x${"f".repeat(64)}"]`)).toBeNull();
	});

	it("stays quiet while the snapshot loads and offers only a neutral Retry when it fails", async () => {
		const pending = deferUserFills();
		await render();
		await selectOption("Direction", "Sell");

		expect(container.textContent).not.toContain("No fills match these filters");
		expect(listRegion().querySelector('[aria-busy="true"]')).not.toBeNull();
		expect(retryButton()).toBeUndefined();

		await act(async () => pending.shift()?.reject(new Error("upstream unavailable")));
		await flush();
		expect(container.textContent).not.toContain("No fills match these filters");
		expect(container.textContent).not.toContain("upstream unavailable");
		expect(listRegion().querySelector('[role="alert"]')).toBeNull();
		const retry = retryButton();
		expect(retry).toBeDefined();

		await act(async () => retry?.click());
		await flush();
		expect(mocks.userFills).toHaveBeenCalledTimes(2);
		expect(retryButton()).toBeUndefined();
		expect(listRegion().querySelector('[aria-busy="true"]')).not.toBeNull();

		await act(async () => pending.shift()?.resolve(recentBuys()));
		await flush();
		expect(container.textContent).toContain("No fills match these filters.");
		expect(retryButton()).toBeUndefined();
	});

	it("names the 2,000-fill boundary when a capped snapshot has no match", async () => {
		mocks.userFills.mockResolvedValue(
			Array.from({ length: TRADE_HISTORY_SNAPSHOT_LIMIT }, (_, index) => fill(index + 1)),
		);
		await render();
		await selectOption("Direction", "Sell");

		expect(container.textContent).toContain("No fills match these filters among the latest 2,000.");
	});

	it("withdraws the no-match conclusion while a later snapshot request fails", async () => {
		const pending = deferUserFills();
		await render();
		await selectOption("Role", "Taker");
		await act(async () => pending.shift()?.resolve(recentBuys()));
		await flush();
		expect(container.textContent).toContain("No fills match these filters.");

		await act(async () => {
			void client.refetchQueries({ queryKey: ["hl", "trade-history", "userFills"] });
		});
		await flush();
		expect(container.textContent).not.toContain("No fills match these filters");
		expect(listRegion().querySelector('[aria-busy="true"]')).not.toBeNull();

		await act(async () => pending.shift()?.reject(new Error("refresh failed")));
		await flush();
		expect(container.textContent).not.toContain("No fills match these filters");
		expect(retryButton()).toBeDefined();
	});

	it("does not conclude no match while the live fills are not current", async () => {
		mocks.userFills.mockResolvedValue(recentBuys());
		await render();
		await selectOption("Direction", "Sell");
		expect(container.textContent).toContain("No fills match these filters.");

		act(() => live.set({ isStale: true }));
		await flush();
		expect(container.textContent).not.toContain("No fills match these filters");
		expect(listRegion().querySelector('[aria-busy="true"]')).not.toBeNull();
	});

	it("drops the snapshot from the list again once every filter is cleared", async () => {
		const liveFills = recentBuys().slice(0, 5);
		const olderSell = fill(1, { coin: "SOL", crossed: true, side: "A" });
		setLiveFills(liveFills);
		mocks.userFills.mockResolvedValue([...liveFills, olderSell]);
		await render();
		await selectOption("Direction", "Sell");
		expect(container.querySelector('[aria-label="Switch to SOL market"]')).not.toBeNull();

		await selectOption("Direction", "Direction");
		expect(container.querySelector('[aria-label="Switch to SOL market"]')).toBeNull();
		expect(container.querySelectorAll("article")).toHaveLength(5);
		expect(container.textContent).toContain("5 trades");
	});
});
