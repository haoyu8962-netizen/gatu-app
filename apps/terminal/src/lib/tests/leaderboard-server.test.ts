import Big from "big.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLeaderboardApiHandler, LEADERBOARD_API_CACHE_POLICY } from "../leaderboard/leaderboard-server";

const TRADER_A = "0x1111111111111111111111111111111111111111";
const TRADER_B = "0x2222222222222222222222222222222222222222";
const VAULT = "0x3333333333333333333333333333333333333333";
const GENERATED_AT = 1_700_000_000_000;
const LAST_MODIFIED = "Tue, 14 Nov 2023 22:13:20 GMT";

function rawLeaderboardRow(address: string, displayName: string, pnl: string) {
	return {
		ethAddress: address,
		accountValue: "200000",
		windowPerformances: [
			["day", { pnl, roi: "0.01", vlm: "100" }],
			["week", { pnl, roi: "0.02", vlm: "200" }],
			["month", { pnl, roi: "0.03", vlm: "300" }],
			["allTime", { pnl, roi: "0.04", vlm: "20000000" }],
		],
		prize: 0,
		displayName,
	};
}

function leaderboardFixture() {
	return {
		leaderboardRows: [
			rawLeaderboardRow(TRADER_A, "Atlas", "20"),
			rawLeaderboardRow(TRADER_B, "Beta", "10"),
			rawLeaderboardRow(VAULT, "Vault", "100"),
		],
	};
}

function vaultFixture() {
	return [{ summary: { vaultAddress: VAULT } }];
}

function jsonResponse(value: unknown, etag: string): Response {
	return new Response(JSON.stringify(value), {
		headers: {
			"content-type": "application/json",
			etag,
			"last-modified": LAST_MODIFIED,
		},
	});
}

function request(headers: HeadersInit = {}, parameters: Readonly<Record<string, string>> = {}): Request {
	const url = new URL(
		"https://gatu.test/api/leaderboard?env=Mainnet&period=month&sortKey=pnl&sortDirection=descending&query=&page=1&pageSize=5",
	);
	for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
	return new Request(url, { headers });
}

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe("leaderboard API server", () => {
	it("single-flights upstream data and returns only a filtered page", async () => {
		const fetchImplementation = vi.fn(async (url: string) =>
			url.endsWith("/leaderboard")
				? jsonResponse(leaderboardFixture(), '"leaderboard-v1"')
				: jsonResponse(vaultFixture(), '"vaults-v1"'),
		);
		const handler = createLeaderboardApiHandler({ fetch: fetchImplementation, now: () => GENERATED_AT });

		const [firstResponse, concurrentResponse] = await Promise.all([handler(request()), handler(request())]);
		const body = await firstResponse.json();

		expect(fetchImplementation).toHaveBeenCalledTimes(2);
		expect(firstResponse.status).toBe(200);
		expect(firstResponse.headers.get("cache-control")).toContain("s-maxage=300");
		expect(body).toMatchObject({
			version: 1,
			env: "Mainnet",
			generatedAt: GENERATED_AT,
			stale: false,
			rowsPerPage: 5,
			totalRows: 2,
			totalPages: 1,
			page: 1,
			start: 1,
			end: 2,
		});
		expect(body.rows.map((row: { address: string }) => row.address)).toEqual([TRADER_A, TRADER_B]);
		expect(JSON.stringify(body).length).toBeLessThan(2_000);
		expect(concurrentResponse.status).toBe(200);
	});

	it("reuses one global sort index across pages and searches", async () => {
		const rows = Array.from({ length: 12 }, (_, index) =>
			rawLeaderboardRow(`0x${(index + 16).toString(16).padStart(40, "0")}`, `Trader ${index + 1}`, String(12 - index)),
		);
		const fetchImplementation = vi.fn(async (url: string) =>
			url.endsWith("/leaderboard")
				? jsonResponse({ leaderboardRows: rows }, '"leaderboard-v1"')
				: jsonResponse([], '"vaults-v1"'),
		);
		const comparisons = vi.spyOn(Big.prototype, "cmp");
		const handler = createLeaderboardApiHandler({ fetch: fetchImplementation, now: () => GENERATED_AT });

		const firstPage = await handler(request());
		expect((await firstPage.json()).rows.map((row: { rank: number }) => row.rank)).toEqual([1, 2, 3, 4, 5]);
		const comparisonsAfterInitialSort = comparisons.mock.calls.length;
		expect(comparisonsAfterInitialSort).toBeGreaterThan(0);

		const secondPage = await handler(request({}, { page: "2" }));
		expect((await secondPage.json()).rows.map((row: { rank: number }) => row.rank)).toEqual([6, 7, 8, 9, 10]);
		const searched = await handler(request({}, { query: "trader 11" }));
		expect(await searched.json()).toMatchObject({ totalRows: 1, rows: [{ rank: 11, displayName: "Trader 11" }] });
		expect(comparisons).toHaveBeenCalledTimes(comparisonsAfterInitialSort);

		const periods = ["day", "week", "month", "allTime"];
		const directions = ["ascending", "descending"];
		const otherSortCombinations = directions
			.flatMap((sortDirection) => [
				{ period: "day", sortKey: "accountValue", sortDirection },
				...periods.flatMap((period) => ["pnl", "roi", "volume"].map((sortKey) => ({ period, sortKey, sortDirection }))),
			])
			.filter(
				(parameters) =>
					!(parameters.period === "month" && parameters.sortKey === "pnl" && parameters.sortDirection === "descending"),
			);
		expect(otherSortCombinations).toHaveLength(25);
		for (const parameters of otherSortCombinations) {
			expect((await handler(request({}, parameters))).status).toBe(200);
		}
		const comparisonsAfterEveryCombination = comparisons.mock.calls.length;
		expect((await handler(request())).status).toBe(200);
		expect(comparisons).toHaveBeenCalledTimes(comparisonsAfterEveryCombination);
	});

	it("supports downstream and upstream conditional revalidation", async () => {
		let now = GENERATED_AT;
		let returnNotModified = false;
		let releaseRefresh: (() => void) | undefined;
		const refreshGate = new Promise<void>((resolve) => {
			releaseRefresh = resolve;
		});
		const fetchImplementation = vi.fn(async (url: string, init: RequestInit) => {
			if (returnNotModified) {
				expect(new Headers(init.headers).get("if-none-match")).toMatch(/-v1"$/);
				expect(new Headers(init.headers).get("if-modified-since")).toBe(LAST_MODIFIED);
				await refreshGate;
				return new Response(null, { status: 304 });
			}
			return url.endsWith("/leaderboard")
				? jsonResponse(leaderboardFixture(), '"leaderboard-v1"')
				: jsonResponse(vaultFixture(), '"vaults-v1"');
		});
		const handler = createLeaderboardApiHandler({ fetch: fetchImplementation, now: () => now });

		const initialResponse = await handler(request());
		const etag = initialResponse.headers.get("etag");
		const lastModified = initialResponse.headers.get("last-modified");
		if (!etag) throw new Error("Missing response ETag");
		if (!lastModified) throw new Error("Missing response Last-Modified");
		const downstreamNotModified = await handler(request({ "if-none-match": `W/${etag}` }));
		expect(downstreamNotModified.status).toBe(304);
		const timeNotModified = await handler(request({ "if-modified-since": lastModified }));
		expect(timeNotModified.status).toBe(304);

		now += LEADERBOARD_API_CACHE_POLICY.freshForMs + 1;
		returnNotModified = true;
		const staleWhileRevalidatingResponse = await handler(request());
		expect(staleWhileRevalidatingResponse.status).toBe(200);
		expect((await staleWhileRevalidatingResponse.json()).stale).toBe(true);
		expect(fetchImplementation).toHaveBeenCalledTimes(4);

		releaseRefresh?.();
		await vi.waitFor(async () => {
			const freshResponse = await handler(request());
			expect((await freshResponse.json()).stale).toBe(false);
			expect(freshResponse.headers.get("last-modified")).not.toBe(lastModified);
			const staleTimestampValidator = await handler(request({ "if-modified-since": lastModified }));
			expect(staleTimestampValidator.status).toBe(200);
		});
	});

	it("serves a bounded stale snapshot on refresh errors, then fails closed", async () => {
		let now = GENERATED_AT;
		let fail = false;
		const fetchImplementation = vi.fn(async (url: string) => {
			if (fail) throw new Error("offline");
			return url.endsWith("/leaderboard")
				? jsonResponse(leaderboardFixture(), '"leaderboard-v1"')
				: jsonResponse(vaultFixture(), '"vaults-v1"');
		});
		const handler = createLeaderboardApiHandler({ fetch: fetchImplementation, now: () => now });
		await handler(request());

		fail = true;
		now += LEADERBOARD_API_CACHE_POLICY.freshForMs + 1;
		const staleResponse = await handler(request());
		expect(staleResponse.status).toBe(200);
		expect(staleResponse.headers.get("warning")).toContain("Response is stale");
		expect((await staleResponse.json()).stale).toBe(true);
		await vi.waitFor(() => expect(fetchImplementation).toHaveBeenCalledTimes(4));
		await new Promise((resolve) => setTimeout(resolve, 0));

		await Promise.all([handler(request()), handler(request()), handler(request())]);
		expect(fetchImplementation).toHaveBeenCalledTimes(4);

		now += LEADERBOARD_API_CACHE_POLICY.staleIfErrorForMs + 1;
		const unavailableResponse = await handler(request());
		expect(unavailableResponse.status).toBe(503);
		expect(await unavailableResponse.json()).toEqual({ error: "temporarily_unavailable" });
	});

	it("aborts an upstream refresh after the production timeout", async () => {
		vi.useFakeTimers();
		const fetchImplementation = vi.fn(async () => new Promise<Response>(() => undefined));
		const handler = createLeaderboardApiHandler({ fetch: fetchImplementation, now: () => GENERATED_AT });

		const pendingResponse = handler(request());
		await vi.advanceTimersByTimeAsync(LEADERBOARD_API_CACHE_POLICY.upstreamTimeoutMs);
		const response = await pendingResponse;

		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({ error: "temporarily_unavailable" });
	});

	it("applies failure cooldown to cold serial and concurrent requests", async () => {
		let now = GENERATED_AT;
		const fetchImplementation = vi.fn(async () => {
			throw new Error("offline");
		});
		const handler = createLeaderboardApiHandler({ fetch: fetchImplementation, now: () => now });

		expect((await handler(request())).status).toBe(503);
		expect(fetchImplementation).toHaveBeenCalledTimes(2);
		expect((await handler(request())).status).toBe(503);
		const concurrent = await Promise.all([handler(request()), handler(request()), handler(request())]);
		expect(concurrent.map((response) => response.status)).toEqual([503, 503, 503]);
		expect(fetchImplementation).toHaveBeenCalledTimes(2);

		now += LEADERBOARD_API_CACHE_POLICY.retryAfterFailureMs;
		expect((await handler(request())).status).toBe(503);
		expect(fetchImplementation).toHaveBeenCalledTimes(4);
	});

	it("fails closed instead of emitting an oversized downstream representation", async () => {
		const oversizedLeaderboard = leaderboardFixture();
		oversizedLeaderboard.leaderboardRows[0].displayName = "a".repeat(LEADERBOARD_API_CACHE_POLICY.maximumResponseBytes);
		const fetchImplementation = vi.fn(async (url: string) =>
			url.endsWith("/leaderboard")
				? jsonResponse(oversizedLeaderboard, '"leaderboard-v1"')
				: jsonResponse(vaultFixture(), '"vaults-v1"'),
		);
		const handler = createLeaderboardApiHandler({ fetch: fetchImplementation, now: () => GENERATED_AT });

		const response = await handler(request());

		expect(response.status).toBe(503);
		expect(response.headers.get("cache-control")).toBe("no-store");
		expect(await response.json()).toEqual({ error: "temporarily_unavailable" });
	});

	it("rejects invalid requests before contacting upstream", async () => {
		const fetchImplementation = vi.fn();
		const handler = createLeaderboardApiHandler({ fetch: fetchImplementation });
		const response = await handler(new Request("https://gatu.test/api/leaderboard?env=Mainnet&pageSize=500"));

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: "invalid_request" });
		expect(fetchImplementation).not.toHaveBeenCalled();
	});
});
