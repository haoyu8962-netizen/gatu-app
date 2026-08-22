// @vitest-environment jsdom

import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LeaderboardApiQuery, LeaderboardApiSuccessResponse } from "@/lib/leaderboard/leaderboard-api";
import { createI18nRoot } from "@/lib/tests/harness/react";
import type { LeaderboardRow } from "../leaderboard-domain";
import { useLeaderboardController } from "../use-leaderboard-controller";

interface QueryState {
	data: LeaderboardApiSuccessResponse | undefined;
	fetchStatus: "idle" | "fetching" | "paused";
	isError: boolean;
	refetch: ReturnType<typeof vi.fn>;
}

const mocks = vi.hoisted(() => ({
	query: {} as QueryState,
	request: null as LeaderboardApiQuery | null,
}));

vi.mock("@/lib/hyperliquid", () => ({
	getExplorerAddressUrl: (address: string) => `https://example.invalid/address/${address}`,
	useHyperliquid: () => ({ isTestnet: false }),
}));

vi.mock("../use-leaderboard-data", () => ({
	useLeaderboardData: (request: LeaderboardApiQuery) => {
		mocks.request = request;
		return mocks.query;
	},
}));

let controller: ReturnType<typeof useLeaderboardController> | null = null;

function Probe() {
	controller = useLeaderboardController();
	return null;
}

describe("useLeaderboardController", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		vi.useFakeTimers();
		mocks.query = query(response([row("1")]));
		mocks.request = null;
		controller = null;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.useRealTimers();
	});

	it("derives normal and no-results states and preserves server-ranked rows", () => {
		render();
		expect(current()).toMatchObject({ pageState: "normal", totalRows: 1 });
		expect(current().rows[0]).toMatchObject({ rank: 1, pnl: "30" });
		expect(mocks.request).toMatchObject({ env: "Mainnet", period: "month", page: 1, pageSize: 10 });

		mocks.query.data = response([], { query: "missing" });
		act(() => current().onQueryChange("missing"));
		act(() => vi.advanceTimersByTime(250));
		expect(current()).toMatchObject({ pageState: "noResults", totalRows: 0 });
		expect(mocks.request?.query).toBe("missing");
	});

	it("updates the search field immediately and waits 250ms before requesting its normalized value", () => {
		mocks.query.data = response(
			Array.from({ length: 10 }, (_, index) => row(String(index + 1))),
			{
				totalRows: 11,
				totalPages: 2,
				end: 10,
			},
		);
		render();
		act(() => current().onNextPage());
		expect(mocks.request?.page).toBe(2);

		act(() => current().onQueryChange("  Trader  "));
		expect(current().query).toBe("  Trader  ");
		expect(mocks.request?.query).toBe("");
		expect(mocks.request?.page).toBe(2);

		act(() => vi.advanceTimersByTime(249));
		expect(mocks.request?.query).toBe("");

		act(() => vi.advanceTimersByTime(1));
		expect(mocks.request).toMatchObject({ query: "trader", page: 1 });
	});

	it("rejects search input beyond the API contract without replacing the committed value", () => {
		render();

		act(() => current().onQueryChange("x".repeat(129)));
		expect(current().query).toBe("");
		act(() => vi.advanceTimersByTime(250));
		expect(mocks.request).toMatchObject({ query: "", page: 1 });
	});

	it("uses a skeleton only for an active first request and fails visibly for paused or idle states", () => {
		mocks.query = query(undefined, { fetchStatus: "fetching" });
		render();
		expect(current().pageState).toBe("loading");

		mocks.query = query(undefined, { fetchStatus: "paused" });
		act(() => root.render(<Probe />));
		expect(current()).toMatchObject({ pageState: "paused", canRetry: false });

		mocks.query = query(undefined);
		act(() => root.render(<Probe />));
		expect(current()).toMatchObject({ pageState: "error", canRetry: true });

		act(() => current().onRetry());
		expect(mocks.query.refetch).toHaveBeenCalledOnce();
	});

	it("keeps rows visible during refresh and reports stale, failed, or paused refreshes", () => {
		mocks.query = query(response([row("1")]), { fetchStatus: "fetching" });
		render();
		expect(current()).toMatchObject({ pageState: "normal", isRefreshing: true, dataNotice: null });
		expect(current().rows).toHaveLength(1);

		mocks.query = query(response([row("1")], { stale: true }));
		act(() => root.render(<Probe />));
		expect(current()).toMatchObject({ pageState: "normal", dataNotice: "stale" });

		mocks.query = query(response([row("1")]), { isError: true });
		act(() => root.render(<Probe />));
		expect(current()).toMatchObject({ pageState: "normal", dataNotice: "refreshError" });

		mocks.query = query(response([row("1")]), { fetchStatus: "paused" });
		act(() => root.render(<Probe />));
		expect(current()).toMatchObject({ pageState: "normal", dataNotice: "paused", canRetry: false });
	});

	function render() {
		act(() => root.render(<Probe />));
	}

	function current() {
		if (!controller) throw new Error("Controller was not captured");
		return controller;
	}
});

function query(data: LeaderboardApiSuccessResponse | undefined, overrides: Partial<QueryState> = {}): QueryState {
	return {
		data,
		fetchStatus: "idle",
		isError: false,
		refetch: vi.fn(),
		...overrides,
	};
}

function response(
	rows: readonly LeaderboardRow[],
	overrides: Partial<LeaderboardApiSuccessResponse> = {},
): LeaderboardApiSuccessResponse {
	return {
		version: 1,
		env: "Mainnet",
		generatedAt: 1,
		stale: false,
		period: "month",
		sortKey: "pnl",
		sortDirection: "descending",
		query: "",
		rowsPerPage: 10,
		rows,
		totalRows: rows.length,
		totalPages: 1,
		page: 1,
		start: rows.length === 0 ? 0 : 1,
		end: rows.length,
		...overrides,
	};
}

function row(suffix: string): LeaderboardRow {
	return {
		rank: Number(suffix),
		address: `0x${suffix.padStart(40, "0")}`,
		displayName: null,
		accountValue: "250000",
		pnl: "30",
		roi: "0.03",
		volume: "300",
		prize: 0,
	};
}
