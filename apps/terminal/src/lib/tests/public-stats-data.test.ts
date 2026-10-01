import {
	clearPublicStatsDataCacheForTests,
	fetchPublicLeaderboard,
	fetchPublicVaults,
	getExplorerAddressUrl,
	getPublicStatsDataUrl,
	normalizePublicLeaderboard,
	normalizePublicVaults,
	PUBLIC_STATS_DATA_LIMITS,
	PublicStatsDataError,
	publicStatsDataKeys,
} from "@sairn/hl-react";
import { getAddress } from "viem";
import { afterEach, describe, expect, it, vi } from "vitest";

const ADDRESS = "0x1234567890abcdef1234567890abcdef12345678";
const LEADER = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";

function leaderboardFixture() {
	return {
		leaderboardRows: [
			{
				ethAddress: getAddress(ADDRESS),
				accountValue: "123.45",
				windowPerformances: [
					["day", { pnl: "1.2", roi: "0.01", vlm: "500" }],
					["week", { pnl: "2.3", roi: "0.02", vlm: "600" }],
					["month", { pnl: "3.4", roi: "0.03", vlm: "700" }],
					["allTime", { pnl: "4.5", roi: "0.04", vlm: "800" }],
				],
				prize: 0,
				displayName: "Trader",
			},
		],
	};
}

function vaultFixture() {
	return [
		{
			apr: 0.12,
			pnls: [
				["day", ["0", "1.2"]],
				["week", ["0", "2.3"]],
				["month", ["0", "3.4"]],
				["allTime", ["0", "4.5"]],
			],
			summary: {
				name: "Vault",
				vaultAddress: ADDRESS,
				leader: LEADER,
				tvl: "1000.25",
				isClosed: false,
				relationship: { type: "parent", data: { childAddresses: [LEADER] } },
				createTimeMillis: 1_700_000_000_000,
			},
		},
	];
}

function paddedStreamingResponse(value: unknown, byteLength: number, headers?: HeadersInit): Response {
	const json = new TextEncoder().encode(JSON.stringify(value));
	if (json.byteLength > byteLength) throw new Error("Test response is smaller than its JSON fixture");

	let jsonPending = true;
	let paddingRemaining = byteLength - json.byteLength;
	const padding = new Uint8Array(Math.min(64 * 1024, paddingRemaining)).fill(0x20);
	const body = new ReadableStream<Uint8Array>(
		{
			pull(controller) {
				if (jsonPending) {
					jsonPending = false;
					controller.enqueue(json);
					return;
				}
				if (paddingRemaining > 0) {
					const chunkLength = Math.min(padding.byteLength, paddingRemaining);
					controller.enqueue(padding.subarray(0, chunkLength));
					paddingRemaining -= chunkLength;
					return;
				}
				controller.close();
			},
		},
		{ highWaterMark: 0 },
	);
	return new Response(body, { headers });
}

afterEach(() => {
	clearPublicStatsDataCacheForTests();
	vi.unstubAllGlobals();
});

describe("public Hyperliquid stats data", () => {
	it("normalizes leaderboard tuples and releases raw field names", () => {
		const rows = normalizePublicLeaderboard(leaderboardFixture(), "Mainnet");

		expect(rows).toEqual([
			{
				address: ADDRESS,
				accountValue: "123.45",
				displayName: "Trader",
				prize: 0,
				performance: {
					day: { pnl: "1.2", roi: "0.01", volume: "500" },
					week: { pnl: "2.3", roi: "0.02", volume: "600" },
					month: { pnl: "3.4", roi: "0.03", volume: "700" },
					allTime: { pnl: "4.5", roi: "0.04", volume: "800" },
				},
			},
		]);
		expect(rows[0]).not.toHaveProperty("windowPerformances");
	});

	it("normalizes parent vault relationships and PNL windows", () => {
		const rows = normalizePublicVaults(vaultFixture(), "Testnet");

		expect(rows[0]).toMatchObject({
			vaultAddress: ADDRESS,
			leader: LEADER,
			name: "Vault",
			tvl: "1000.25",
			apr: 0.12,
			isClosed: false,
			createTimeMillis: 1_700_000_000_000,
			relationship: { type: "parent", childAddresses: [LEADER] },
			pnlHistory: { day: ["0", "1.2"], week: ["0", "2.3"], month: ["0", "3.4"], allTime: ["0", "4.5"] },
		});
		expect(rows[0]).not.toHaveProperty("summary");
	});

	it("fails the whole response closed for unknown fields or duplicate windows", () => {
		const invalidLeaderboard = leaderboardFixture();
		Object.assign(invalidLeaderboard.leaderboardRows[0] as object, { undocumented: true });
		expect(() => normalizePublicLeaderboard(invalidLeaderboard, "Mainnet")).toThrow(PublicStatsDataError);

		const invalidVaults = vaultFixture();
		const firstVault = invalidVaults[0];
		const weekPnl = firstVault?.pnls[1];
		if (!weekPnl) throw new Error("Invalid test fixture");
		weekPnl[0] = "day";
		expect(() => normalizePublicVaults(invalidVaults, "Mainnet")).toThrow("Invalid public Hyperliquid vaults response");
	});

	it("scopes URLs by environment and creates address explorer links", () => {
		expect(getPublicStatsDataUrl("Mainnet", "leaderboard")).toBe(
			"https://stats-data.hyperliquid.xyz/Mainnet/leaderboard",
		);
		expect(getPublicStatsDataUrl("Testnet", "vaults")).toBe("https://stats-data.hyperliquid.xyz/Testnet/vaults");
		expect(getExplorerAddressUrl(ADDRESS)).toBe(`https://app.hyperliquid.xyz/explorer/address/${ADDRESS}`);
		expect(getExplorerAddressUrl(ADDRESS, true)).toBe(
			`https://testnet.app.hyperliquid.xyz/explorer/address/${ADDRESS}`,
		);
		expect(publicStatsDataKeys.leaderboard("Mainnet")).toEqual(["hl", "public-stats", "leaderboard", "Mainnet"]);
		expect(publicStatsDataKeys.leaderboard("Testnet")).not.toEqual(publicStatsDataKeys.leaderboard("Mainnet"));
	});

	it("forwards the query abort signal and returns only normalized data", async () => {
		const controller = new AbortController();
		const fetchMock = vi.fn(async () => ({
			ok: true,
			status: 200,
			json: async () => leaderboardFixture(),
		}));
		vi.stubGlobal("fetch", fetchMock);

		const rows = await fetchPublicLeaderboard("Testnet", controller.signal);

		expect(fetchMock).toHaveBeenCalledWith("https://stats-data.hyperliquid.xyz/Testnet/leaderboard", {
			signal: controller.signal,
		});
		expect(rows[0]).not.toHaveProperty("windowPerformances");
	});

	it("preserves the exact AbortError when streaming is cancelled mid-body", async () => {
		const controller = new AbortController();
		const abortError = new DOMException("Aborted", "AbortError");
		let firstChunkPending = true;
		const response = new Response(
			new ReadableStream<Uint8Array>(
				{
					pull(streamController) {
						if (firstChunkPending) {
							firstChunkPending = false;
							streamController.enqueue(new TextEncoder().encode('{"leaderboardRows":'));
							return;
						}
						controller.abort(abortError);
						streamController.error(abortError);
					},
				},
				{ highWaterMark: 0 },
			),
		);
		const fetchMock = vi.fn(async () => response);
		vi.stubGlobal("fetch", fetchMock);

		await expect(fetchPublicLeaderboard("Mainnet", controller.signal)).rejects.toBe(abortError);
	});

	it("accepts a streamed JSON body exactly at the byte limit", async () => {
		const limit = PUBLIC_STATS_DATA_LIMITS.vaults.maximumContentLength;
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				paddedStreamingResponse(vaultFixture(), limit, {
					"content-length": String(limit),
				}),
			),
		);

		await expect(fetchPublicVaults("Mainnet")).resolves.toHaveLength(1);
	});

	it("rejects a streamed body one byte over the limit even when Content-Length is under-reported", async () => {
		const limit = PUBLIC_STATS_DATA_LIMITS.vaults.maximumContentLength;
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				paddedStreamingResponse(vaultFixture(), limit + 1, {
					"content-length": "1",
				}),
			),
		);

		await expect(fetchPublicVaults("Mainnet")).rejects.toMatchObject({ code: "resource_limit" });
	});

	it("rejects a streamed body one byte over the limit without Content-Length", async () => {
		const limit = PUBLIC_STATS_DATA_LIMITS.vaults.maximumContentLength;
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => paddedStreamingResponse(vaultFixture(), limit + 1)),
		);

		await expect(fetchPublicVaults("Mainnet")).rejects.toMatchObject({ code: "resource_limit" });
	});

	it("maps streamed JSON parse failures to invalid_json", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response(
						new ReadableStream({
							start(streamController) {
								streamController.enqueue(new TextEncoder().encode("{"));
								streamController.close();
							},
						}),
					),
			),
		);

		await expect(fetchPublicLeaderboard("Mainnet")).rejects.toMatchObject({ code: "invalid_json" });
	});

	it("keeps refetches CORS-simple and leaves HTTP validation to the browser cache", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce({ ok: true, status: 200, headers: new Headers(), json: async () => leaderboardFixture() })
			.mockResolvedValueOnce({ ok: true, status: 200, headers: new Headers(), json: async () => leaderboardFixture() });
		vi.stubGlobal("fetch", fetchMock);

		const first = await fetchPublicLeaderboard("Mainnet");
		const second = await fetchPublicLeaderboard("Mainnet");

		expect(second).toEqual(first);
		expect(fetchMock).toHaveBeenNthCalledWith(2, "https://stats-data.hyperliquid.xyz/Mainnet/leaderboard", {
			signal: undefined,
		});
	});

	it("keeps requests isolated by environment without application-managed validators", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce({
				ok: true,
				status: 200,
				headers: new Headers({ etag: '"mainnet"' }),
				json: async () => leaderboardFixture(),
			})
			.mockResolvedValueOnce({
				ok: true,
				status: 200,
				headers: new Headers(),
				json: async () => leaderboardFixture(),
			});
		vi.stubGlobal("fetch", fetchMock);

		await fetchPublicLeaderboard("Mainnet");
		await fetchPublicLeaderboard("Testnet");

		expect(fetchMock.mock.calls[1]?.[1]).toEqual({ signal: undefined });
	});

	it("fails closed when a response exceeds row or declared content limits", async () => {
		const oversizedRows = { leaderboardRows: Array.from({ length: 100_001 }) };
		expect(() => normalizePublicLeaderboard(oversizedRows, "Mainnet")).toThrow("resource limit");

		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({
				ok: true,
				status: 200,
				headers: new Headers({ "content-length": String(65 * 1024 * 1024) }),
				json: async () => leaderboardFixture(),
			})),
		);
		await expect(fetchPublicLeaderboard("Mainnet")).rejects.toMatchObject({ code: "resource_limit" });
	});
});
