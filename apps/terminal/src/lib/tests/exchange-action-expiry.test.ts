// @vitest-environment jsdom
import { privateKeyToAccount } from "viem/accounts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	createServerClock,
	EXCHANGE_ACTION_EXPIRY_MS,
} from "../../../../../packages/hl-react/src/internal/exchange/server-clock";

const http = {
	serverOffset: 0,
	testnetServerOffset: 0,
	requests: [] as Array<{ endpoint: string; testnet: boolean; sentAt: number; payload: Record<string, unknown> }>,
};

async function fakeFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
	const endpoint = String(input).endsWith("/info") ? "info" : "exchange";
	const testnet = String(input).includes("testnet");
	const sentAt = Date.now();
	http.requests.push({ endpoint, testnet, sentAt, payload: JSON.parse(String(init?.body)) });
	const body =
		endpoint === "info"
			? { time: sentAt + (testnet ? http.testnetServerOffset : http.serverOffset), specialStatuses: null }
			: { status: "ok", response: { type: "order", data: { statuses: [{ resting: { oid: 1 } }] } } };
	return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

/** How far a signed expiry is from the exchange's clock plus 15 seconds; the client tests freeze both clocks, so it is exact. */
function expiryDrift(request: (typeof http.requests)[number] | undefined): number {
	if (!request) return Number.POSITIVE_INFINITY;
	const offset = request.testnet ? http.testnetServerOffset : http.serverOffset;
	return Math.abs(Number(request.payload.expiresAfter) - (request.sentAt + offset + 15_000));
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((onResolve, onReject) => {
		resolve = onResolve;
		reject = onReject;
	});
	return { promise, resolve, reject };
}

describe("server clock for L1 action expiry", () => {
	beforeEach(() => {
		vi.useFakeTimers({ now: 1_000_000 });
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("expires actions 15 seconds after the exchange clock when the device clock runs behind", async () => {
		const fetchServerTime = vi.fn(() => new Promise<number>((resolve) => setTimeout(() => resolve(1_060_000), 200)));
		const clock = createServerClock(fetchServerTime);

		const expiresAfter = clock.getExpiresAfter();
		await vi.advanceTimersByTimeAsync(200);

		expect(await expiresAfter).toBe(1_060_000 + EXCHANGE_ACTION_EXPIRY_MS);
		expect(fetchServerTime).toHaveBeenCalledOnce();

		await vi.advanceTimersByTimeAsync(5_000);
		expect(await clock.getExpiresAfter()).toBe(1_065_000 + EXCHANGE_ACTION_EXPIRY_MS);
		expect(fetchServerTime).toHaveBeenCalledOnce();
	});

	it("waits for one server time request when several actions start before it answers", async () => {
		const pending = deferred<number>();
		const fetchServerTime = vi.fn(() => pending.promise);
		const clock = createServerClock(fetchServerTime);

		const first = clock.getExpiresAfter();
		const second = clock.getExpiresAfter();
		pending.resolve(3_000_000);
		await vi.advanceTimersByTimeAsync(0);

		expect(fetchServerTime).toHaveBeenCalledOnce();
		expect(await first).toBe(3_000_000 + 15_000);
		expect(await second).toBe(3_000_000 + 15_000);
	});

	it("keeps counting from the sample when the system clock is set back", async () => {
		const fetchServerTime = vi.fn().mockResolvedValueOnce(1_000_000).mockRejectedValue(new Error("network down"));
		const clock = createServerClock(fetchServerTime);
		await clock.sync();

		await vi.advanceTimersByTimeAsync(10_000);
		vi.setSystemTime(Date.now() - 60 * 60_000);

		expect(await clock.getExpiresAfter()).toBe(1_010_000 + EXCHANGE_ACTION_EXPIRY_MS);
		expect(fetchServerTime).toHaveBeenCalledTimes(2);
	});

	it("never stretches the expiry when the system clock jumps forward after the sample", async () => {
		const fetchServerTime = vi.fn().mockResolvedValueOnce(1_000_000).mockRejectedValue(new Error("network down"));
		const clock = createServerClock(fetchServerTime);
		await clock.sync();

		await vi.advanceTimersByTimeAsync(10_000);
		vi.setSystemTime(Date.now() + 60 * 60_000);

		expect(await clock.getExpiresAfter()).toBe(1_010_000 + EXCHANGE_ACTION_EXPIRY_MS);
		expect(fetchServerTime).toHaveBeenCalledTimes(2);
	});

	it("waits for a new exchange time before signing once the system clock was changed", async () => {
		const fetchServerTime = vi
			.fn()
			.mockResolvedValueOnce(1_000_000)
			.mockImplementationOnce(() => new Promise<number>((resolve) => setTimeout(() => resolve(1_010_400), 100)));
		const clock = createServerClock(fetchServerTime);
		await clock.sync();

		await vi.advanceTimersByTimeAsync(10_000);
		vi.setSystemTime(Date.now() + 60 * 60_000);

		let settled = false;
		const expiresAfter = clock.getExpiresAfter().finally(() => {
			settled = true;
		});
		await vi.advanceTimersByTimeAsync(99);
		expect(settled).toBe(false);
		await vi.advanceTimersByTimeAsync(1);

		expect(await expiresAfter).toBe(1_010_400 + EXCHANGE_ACTION_EXPIRY_MS);
		expect(fetchServerTime).toHaveBeenCalledTimes(2);
	});

	it("asks again at once while the clocks still disagree, despite a failure moments ago", async () => {
		const fetchServerTime = vi
			.fn()
			.mockResolvedValueOnce(1_000_000)
			.mockRejectedValueOnce(new Error("network down"))
			.mockResolvedValueOnce(1_015_000);
		const clock = createServerClock(fetchServerTime);
		await clock.sync();

		await vi.advanceTimersByTimeAsync(10_000);
		vi.setSystemTime(Date.now() + 60 * 60_000);
		expect(await clock.getExpiresAfter()).toBe(1_010_000 + EXCHANGE_ACTION_EXPIRY_MS);

		await vi.advanceTimersByTimeAsync(5_000);
		expect(await clock.getExpiresAfter()).toBe(1_015_000 + EXCHANGE_ACTION_EXPIRY_MS);
		expect(fetchServerTime).toHaveBeenCalledTimes(3);
	});

	it("discards an answer whose request spanned a sleep and asks again before signing", async () => {
		const background = deferred<number>();
		const fetchServerTime = vi
			.fn()
			.mockResolvedValueOnce(1_000_000)
			.mockReturnValueOnce(background.promise)
			.mockResolvedValueOnce(4_661_000);
		const clock = createServerClock(fetchServerTime);
		await clock.sync();

		await vi.advanceTimersByTimeAsync(61_000);
		expect(await clock.getExpiresAfter()).toBe(1_061_000 + EXCHANGE_ACTION_EXPIRY_MS);
		vi.setSystemTime(Date.now() + 60 * 60_000);
		background.resolve(1_061_000);
		await vi.advanceTimersByTimeAsync(0);

		expect(await clock.getExpiresAfter()).toBe(4_661_000 + EXCHANGE_ACTION_EXPIRY_MS);
		expect(fetchServerTime).toHaveBeenCalledTimes(3);
	});

	it("asks again for actions that joined a request sent before the device slept", async () => {
		const background = deferred<number>();
		const fetchServerTime = vi
			.fn()
			.mockResolvedValueOnce(1_000_000)
			.mockReturnValueOnce(background.promise)
			.mockResolvedValueOnce(4_661_000);
		const clock = createServerClock(fetchServerTime);
		await clock.sync();

		await vi.advanceTimersByTimeAsync(61_000);
		await clock.getExpiresAfter();
		vi.setSystemTime(Date.now() + 60 * 60_000);
		const first = clock.getExpiresAfter();
		const second = clock.getExpiresAfter();
		background.resolve(1_061_000);

		expect(await first).toBe(4_661_000 + EXCHANGE_ACTION_EXPIRY_MS);
		expect(await second).toBe(4_661_000 + EXCHANGE_ACTION_EXPIRY_MS);
		expect(fetchServerTime).toHaveBeenCalledTimes(3);
	});

	it("does not ask twice when the request an action joins was sent after the clock change", async () => {
		const fresh = deferred<number>();
		const fetchServerTime = vi.fn().mockResolvedValueOnce(1_000_000).mockReturnValueOnce(fresh.promise);
		const clock = createServerClock(fetchServerTime);
		await clock.sync();

		await vi.advanceTimersByTimeAsync(10_000);
		vi.setSystemTime(Date.now() + 60 * 60_000);
		const first = clock.getExpiresAfter();
		const second = clock.getExpiresAfter();
		fresh.reject(new Error("network down"));

		expect(await first).toBe(1_010_000 + EXCHANGE_ACTION_EXPIRY_MS);
		expect(await second).toBe(1_010_000 + EXCHANGE_ACTION_EXPIRY_MS);
		expect(fetchServerTime).toHaveBeenCalledTimes(2);
	});

	it("ignores a small wall-clock drift and counts only monotonic time", async () => {
		const fetchServerTime = vi.fn(async () => 1_000_000);
		const clock = createServerClock(fetchServerTime);
		await clock.sync();

		await vi.advanceTimersByTimeAsync(10_000);
		vi.setSystemTime(Date.now() + 900);

		expect(await clock.getExpiresAfter()).toBe(1_010_000 + EXCHANGE_ACTION_EXPIRY_MS);
		expect(fetchServerTime).toHaveBeenCalledOnce();
	});

	it("falls back to the device clock and waits 30 seconds before asking again when the server time is unavailable", async () => {
		const fetchServerTime = vi.fn(async () => {
			throw new Error("network down");
		});
		const clock = createServerClock(fetchServerTime);

		expect(await clock.getExpiresAfter()).toBe(1_000_000 + EXCHANGE_ACTION_EXPIRY_MS);
		await vi.advanceTimersByTimeAsync(29_000);
		expect(await clock.getExpiresAfter()).toBe(1_029_000 + EXCHANGE_ACTION_EXPIRY_MS);
		expect(fetchServerTime).toHaveBeenCalledOnce();

		await vi.advanceTimersByTimeAsync(2_000);
		await clock.getExpiresAfter();
		expect(fetchServerTime).toHaveBeenCalledTimes(2);
	});

	it("abandons a server time request after two seconds", async () => {
		const fetchServerTime = vi.fn(
			(signal: AbortSignal) =>
				new Promise<number>((_resolve, reject) => {
					signal.addEventListener("abort", () => reject(new Error("aborted")));
				}),
		);
		const clock = createServerClock(fetchServerTime);

		const expiresAfter = clock.getExpiresAfter();
		await vi.advanceTimersByTimeAsync(2_000);

		expect(await expiresAfter).toBe(1_002_000 + EXCHANGE_ACTION_EXPIRY_MS);
	});

	it("uses only a server time that arrives within the two-second limit", async () => {
		const onTime = createServerClock(
			() => new Promise<number>((resolve) => setTimeout(() => resolve(5_000_000), 1_900)),
		);
		const ignoresAbort = createServerClock(
			() => new Promise<number>((resolve) => setTimeout(() => resolve(5_000_000), 2_500)),
		);

		const fast = onTime.getExpiresAfter();
		await vi.advanceTimersByTimeAsync(1_900);
		expect(await fast).toBe(5_000_000 + EXCHANGE_ACTION_EXPIRY_MS);

		const late = ignoresAbort.getExpiresAfter();
		await vi.advanceTimersByTimeAsync(2_500);
		expect(await late).toBe(1_004_400 + EXCHANGE_ACTION_EXPIRY_MS);
	});

	it("does not use a late server time when the system clock was set back while it was on its way", async () => {
		const clock = createServerClock(
			() => new Promise<number>((resolve) => setTimeout(() => resolve(5_000_000), 2_500)),
		);

		const late = clock.getExpiresAfter();
		await vi.advanceTimersByTimeAsync(1_000);
		vi.setSystemTime(Date.now() - 3_000);
		await vi.advanceTimersByTimeAsync(1_500);

		expect(await late).toBe(999_500 + EXCHANGE_ACTION_EXPIRY_MS);
	});

	it("refreshes an old sample in the background without delaying the action", async () => {
		const pending = deferred<number>();
		const fetchServerTime = vi.fn().mockResolvedValueOnce(1_000_000).mockReturnValueOnce(pending.promise);
		const clock = createServerClock(fetchServerTime);
		await clock.sync();

		await vi.advanceTimersByTimeAsync(61_000);
		expect(await clock.getExpiresAfter()).toBe(1_061_000 + EXCHANGE_ACTION_EXPIRY_MS);
		expect(fetchServerTime).toHaveBeenCalledTimes(2);

		pending.resolve(2_000_000);
		await vi.advanceTimersByTimeAsync(0);
		expect(await clock.getExpiresAfter()).toBe(2_000_000 + EXCHANGE_ACTION_EXPIRY_MS);
	});
});

describe("exchange clients", () => {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ["Date", "performance"], now: 1_800_000_000_000 });
		vi.stubGlobal("navigator", {
			...navigator,
			locks: { request: async (_name: string, _options: unknown, callback: () => unknown) => callback() },
		});
		vi.stubGlobal("fetch", fakeFetch);
		localStorage.clear();
		http.requests = [];
		http.serverOffset = 120_000;
		http.testnetServerOffset = -300_000;
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it("signs every L1 action with an expiry 15 seconds after the exchange clock", async () => {
		const { getTradingClient } = await import("@sairn/hl-react/clients");
		const agent = privateKeyToAccount(`0x${"0".repeat(63)}3`);
		const client = getTradingClient(agent, false);

		await client.order({
			orders: [{ a: 0, b: true, p: "1", s: "1", r: false, t: { limit: { tif: "Gtc" } } }],
			grouping: "na",
		});
		await client.cancel({ cancels: [{ a: 0, o: 1 }] });

		const statusRequests = http.requests.filter((request) => request.endpoint === "info");
		expect(statusRequests).toEqual([
			{ endpoint: "info", testnet: false, sentAt: expect.any(Number), payload: { type: "exchangeStatus" } },
		]);
		const exchangeRequests = http.requests.filter((request) => request.endpoint === "exchange");
		expect(exchangeRequests).toHaveLength(2);
		expect(EXCHANGE_ACTION_EXPIRY_MS).toBe(15_000);
		for (const request of exchangeRequests) expect(expiryDrift(request)).toBe(0);
	});

	it("signs the owner's own L1 actions with the same 15-second expiry", async () => {
		const { createExchangeClient } = await import("@sairn/hl-react/clients");
		const owner = privateKeyToAccount(`0x${"0".repeat(63)}5`);
		const client = createExchangeClient(owner, false);

		await client.cancel({ cancels: [{ a: 0, o: 1 }] });

		const [request] = http.requests.filter((entry) => entry.endpoint === "exchange");
		expect(expiryDrift(request)).toBe(0);
	});

	it("keeps the exchange clock of each network apart", async () => {
		const { getTradingClient } = await import("@sairn/hl-react/clients");
		const agent = privateKeyToAccount(`0x${"0".repeat(63)}6`);

		await getTradingClient(agent, true).cancel({ cancels: [{ a: 0, o: 1 }] });
		await getTradingClient(agent, false).cancel({ cancels: [{ a: 0, o: 2 }] });

		const [testnetRequest, mainnetRequest] = http.requests.filter((entry) => entry.endpoint === "exchange");
		expect(testnetRequest?.testnet).toBe(true);
		expect(expiryDrift(testnetRequest)).toBe(0);
		expect(mainnetRequest?.testnet).toBe(false);
		expect(expiryDrift(mainnetRequest)).toBe(0);
	});

	it("signs without an expiry and asks for no server time while Transaction Delay Protection is off", async () => {
		const { getTradingClient, setTransactionDelayProtectionReader } = await import("@sairn/hl-react/clients");
		const agent = privateKeyToAccount(`0x${"0".repeat(63)}7`);
		const client = getTradingClient(agent, false);
		let enabled = false;
		setTransactionDelayProtectionReader(() => enabled);
		try {
			await client.cancel({ cancels: [{ a: 0, o: 1 }] });
			enabled = true;
			await client.cancel({ cancels: [{ a: 0, o: 2 }] });
		} finally {
			setTransactionDelayProtectionReader(() => true);
		}

		expect(http.requests[0]?.endpoint).toBe("exchange");
		expect(http.requests[0]?.payload).not.toHaveProperty("expiresAfter");
		const [, protectedRequest] = http.requests.filter((entry) => entry.endpoint === "exchange");
		expect(expiryDrift(protectedRequest)).toBe(0);
	});

	it("lets the owner's own client follow the same switch, off and on again", async () => {
		const { createExchangeClient, setTransactionDelayProtectionReader } = await import("@sairn/hl-react/clients");
		const owner = privateKeyToAccount(`0x${"0".repeat(63)}8`);
		const client = createExchangeClient(owner, false);
		let enabled = false;
		setTransactionDelayProtectionReader(() => enabled);
		try {
			await client.cancel({ cancels: [{ a: 0, o: 1 }] });
			enabled = true;
			await client.cancel({ cancels: [{ a: 0, o: 2 }] });
			enabled = false;
			await client.cancel({ cancels: [{ a: 0, o: 3 }] });
		} finally {
			setTransactionDelayProtectionReader(() => true);
		}

		const [first, second, third] = http.requests.filter((entry) => entry.endpoint === "exchange");
		expect(http.requests[0]?.endpoint).toBe("exchange");
		expect(first?.payload).not.toHaveProperty("expiresAfter");
		expect(expiryDrift(second)).toBe(0);
		expect(third?.payload).not.toHaveProperty("expiresAfter");
	});

	it("leaves user-signed actions without an expiry", async () => {
		const { createExchangeClient } = await import("@sairn/hl-react/clients");
		const owner = privateKeyToAccount(`0x${"0".repeat(63)}4`);
		const client = createExchangeClient(owner, true);

		await client.approveBuilderFee({ builder: "0x2222222222222222222222222222222222222222", maxFeeRate: "0.01%" });

		const exchangeRequests = http.requests.filter((request) => request.endpoint === "exchange");
		expect(exchangeRequests).toHaveLength(1);
		expect(exchangeRequests[0]?.payload).not.toHaveProperty("expiresAfter");
		expect(http.requests.some((request) => request.endpoint === "info")).toBe(false);
	});
});
