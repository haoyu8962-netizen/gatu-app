// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LeaderboardApiQuery, LeaderboardApiSuccessResponse } from "@/lib/leaderboard/leaderboard-api";
import {
	fetchLeaderboardPage,
	LEADERBOARD_GC_TIME_MS,
	LEADERBOARD_REQUEST_TIMEOUT_MS,
	LEADERBOARD_STALE_REVALIDATION_DELAY_MS,
	LEADERBOARD_STALE_TIME_MS,
	LeaderboardApiError,
	LeaderboardRequestTimeoutError,
	LeaderboardResponseError,
	parseLeaderboardResponse,
	useLeaderboardData,
} from "../use-leaderboard-data";

const mocks = vi.hoisted(() => {
	const state = {
		options: null as unknown,
		result: {
			data: undefined as LeaderboardApiSuccessResponse | undefined,
			fetchStatus: "idle" as "fetching" | "idle" | "paused",
			refetch: vi.fn(),
		},
	};
	return {
		state,
		useQuery: vi.fn((options: unknown) => {
			state.options = options;
			return state.result;
		}),
	};
});

vi.mock("@tanstack/react-query", () => ({ useQuery: mocks.useQuery }));

const mountedRoots = new Set<Root>();

describe("leaderboard data client", () => {
	afterEach(() => {
		for (const root of mountedRoots) act(() => root.unmount());
		mountedRoots.clear();
		vi.useRealTimers();
		mocks.useQuery.mockClear();
		mocks.state.options = null;
		mocks.state.result.data = undefined;
		mocks.state.result.fetchStatus = "idle";
		mocks.state.result.refetch.mockReset();
	});

	it("strictly parses a searched page without rewriting global ranks", () => {
		const value = response({
			rows: [row(123), row(400, "2")],
			totalRows: 2,
			start: 1,
			end: 2,
		});

		expect(parseLeaderboardResponse(value, request())).toEqual(value);
	});

	it("rejects unknown fields, mismatched identities, invalid decimals, and non-increasing ranks", () => {
		expect(() => parseLeaderboardResponse({ ...response(), unexpected: true }, request())).toThrow(
			LeaderboardResponseError,
		);
		expect(() => parseLeaderboardResponse(response({ env: "Testnet" }), request())).toThrow(LeaderboardResponseError);
		expect(() => parseLeaderboardResponse(response({ rows: [{ ...row(1), pnl: "NaN" }] }), request())).toThrow(
			LeaderboardResponseError,
		);
		expect(() =>
			parseLeaderboardResponse(response({ rows: [row(20), row(20, "2")], totalRows: 2, start: 1, end: 2 }), request()),
		).toThrow(LeaderboardResponseError);
	});

	it("requests only the compact page and accepts a verified success response", async () => {
		const fetcher = vi.fn(async () => jsonResponse(response())) as unknown as typeof fetch;

		await expect(fetchLeaderboardPage(request(), { fetcher })).resolves.toEqual(response());
		expect(fetcher).toHaveBeenCalledWith(
			"/api/leaderboard?env=Mainnet&period=month&sortKey=pnl&sortDirection=descending&query=trader&page=1&pageSize=10",
			expect.objectContaining({
				cache: "no-cache",
				headers: { accept: "application/json" },
				signal: expect.any(AbortSignal),
			}),
		);
	});

	it("surfaces the exact documented error envelope", async () => {
		const fetcher = vi.fn(async () =>
			jsonResponse({ error: "temporarily_unavailable" }, 503),
		) as unknown as typeof fetch;

		const error = await fetchLeaderboardPage(request(), { fetcher }).catch((reason: unknown) => reason);
		expect(error).toBeInstanceOf(LeaderboardApiError);
		expect(error).toMatchObject({ code: "temporarily_unavailable", status: 503 });

		const malformedFetcher = vi.fn(async () =>
			jsonResponse({ error: "temporarily_unavailable", extra: true }, 503),
		) as unknown as typeof fetch;
		await expect(fetchLeaderboardPage(request(), { fetcher: malformedFetcher })).rejects.toBeInstanceOf(
			LeaderboardResponseError,
		);
	});

	it("aborts and fails visibly after the 20 second request budget", async () => {
		vi.useFakeTimers();
		const fetcher = vi.fn(
			(_input: RequestInfo | URL, init?: RequestInit) =>
				new Promise<Response>((_resolve, reject) => {
					init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), {
						once: true,
					});
				}),
		);
		const pending = fetchLeaderboardPage(request(), { fetcher: fetcher as unknown as typeof fetch });
		const assertion = expect(pending).rejects.toBeInstanceOf(LeaderboardRequestTimeoutError);

		await vi.advanceTimersByTimeAsync(LEADERBOARD_REQUEST_TIMEOUT_MS - 1);
		expect(fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(false);
		await vi.advanceTimersByTimeAsync(1);
		await assertion;
	});

	it("configures bounded caching and no retries without relabeling a previous query", () => {
		renderDataHook();
		const queryOptions = mocks.state.options as {
			retry: boolean;
			staleTime: number;
			gcTime: number;
			placeholderData?: unknown;
		};

		expect(queryOptions).toMatchObject({
			retry: false,
			staleTime: LEADERBOARD_STALE_TIME_MS,
			gcTime: LEADERBOARD_GC_TIME_MS,
		});
		expect(queryOptions.placeholderData).toBeUndefined();
	});

	it("revalidates each stale generation once after the server refresh budget", () => {
		vi.useFakeTimers();
		mocks.state.result.data = response({ stale: true });
		const root = renderDataHook();

		act(() => vi.advanceTimersByTime(LEADERBOARD_STALE_REVALIDATION_DELAY_MS - 1));
		expect(mocks.state.result.refetch).not.toHaveBeenCalled();
		act(() => vi.advanceTimersByTime(1));
		expect(mocks.state.result.refetch).toHaveBeenCalledOnce();
		act(() => vi.advanceTimersByTime(LEADERBOARD_STALE_REVALIDATION_DELAY_MS));
		expect(mocks.state.result.refetch).toHaveBeenCalledOnce();

		mocks.state.result.data = response({ stale: true, generatedAt: 1_786_640_000_001 });
		act(() => root.render(createElement(DataHookProbe)));
		act(() => vi.advanceTimersByTime(LEADERBOARD_STALE_REVALIDATION_DELAY_MS));
		expect(mocks.state.result.refetch).toHaveBeenCalledTimes(2);

		mocks.state.result.data = response({ stale: true });
		act(() => root.render(createElement(DataHookProbe)));
		act(() => vi.advanceTimersByTime(LEADERBOARD_STALE_REVALIDATION_DELAY_MS));
		expect(mocks.state.result.refetch).toHaveBeenCalledTimes(2);

		mocks.state.result.data = response({ stale: true, generatedAt: 1_786_640_000_002 });
		act(() => root.render(createElement(DataHookProbe)));
		act(() => root.unmount());
		mountedRoots.delete(root);
		act(() => vi.advanceTimersByTime(LEADERBOARD_STALE_REVALIDATION_DELAY_MS));
		expect(mocks.state.result.refetch).toHaveBeenCalledTimes(2);
	});

	it("does not schedule a competing stale revalidation while another fetch is active", () => {
		vi.useFakeTimers();
		mocks.state.result.data = response({ stale: true });
		mocks.state.result.fetchStatus = "fetching";
		const root = renderDataHook();

		act(() => vi.advanceTimersByTime(LEADERBOARD_STALE_REVALIDATION_DELAY_MS));
		expect(mocks.state.result.refetch).not.toHaveBeenCalled();

		mocks.state.result.fetchStatus = "idle";
		act(() => root.render(createElement(DataHookProbe)));
		act(() => vi.advanceTimersByTime(LEADERBOARD_STALE_REVALIDATION_DELAY_MS));
		expect(mocks.state.result.refetch).toHaveBeenCalledOnce();
	});
});

function DataHookProbe() {
	useLeaderboardData(request());
	return null;
}

function renderDataHook(): Root {
	const container = document.createElement("div");
	document.body.appendChild(container);
	const root = createRoot(container);
	mountedRoots.add(root);
	act(() => root.render(createElement(DataHookProbe)));
	return root;
}

function request(): LeaderboardApiQuery {
	return {
		env: "Mainnet",
		period: "month",
		sortKey: "pnl",
		sortDirection: "descending",
		query: "trader",
		page: 1,
		pageSize: 10,
	};
}

function response(overrides: Partial<LeaderboardApiSuccessResponse> = {}): LeaderboardApiSuccessResponse {
	return {
		version: 1,
		env: "Mainnet",
		generatedAt: 1_786_640_000_000,
		stale: false,
		period: "month",
		sortKey: "pnl",
		sortDirection: "descending",
		query: "trader",
		rowsPerPage: 10,
		rows: [row(123)],
		totalRows: 1,
		totalPages: 1,
		page: 1,
		start: 1,
		end: 1,
		...overrides,
	};
}

function row(rank: number, suffix = "1"): LeaderboardApiSuccessResponse["rows"][number] {
	return {
		rank,
		address: `0x${suffix.padStart(40, "0")}`,
		displayName: null,
		accountValue: "250000",
		pnl: "30",
		roi: "0.03",
		volume: "300",
		prize: 0,
	};
}

function jsonResponse(value: unknown, status = 200): Response {
	return new Response(JSON.stringify(value), {
		status,
		headers: { "content-type": "application/json" },
	});
}
