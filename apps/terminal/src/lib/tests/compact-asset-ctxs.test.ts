import zlib from "node:zlib";
import type { ISubscriptionTransport } from "@nktkas/hyperliquid";
import { describe, expect, it, vi } from "vitest";
import {
	COMPACT_ASSET_CTXS_MAX_PENDING_FRAMES,
	createCompactAssetCtxsAccumulator,
	decodeCompactAssetCtxs,
	parseCompactSpotAssetCtxsDelta,
	subscribeCompactAssetCtxs,
} from "../../../../../packages/hl-react/src/subscriptions/compact-asset-ctxs";
import { CompactSubscriptionClient } from "../../../../../packages/hl-react/src/subscriptions/compact-subscription-client";
import { L2BookStreamError } from "../../../../../packages/hl-react/src/subscriptions/l2";

const PERP_CTX = {
	funding: "0.0000125",
	openInterest: "1",
	prevDayPx: "2",
	dayNtlVlm: "3",
	oraclePx: "4",
	markPx: "5",
	midPx: "6",
	dayBaseVlm: "7",
};
const SPOT_CTX = { prevDayPx: "1", dayNtlVlm: "2", markPx: "3", midPx: "4", dayBaseVlm: "5", circulatingSupply: "6" };

function encode(value: unknown): string {
	return zlib.deflateRawSync(Buffer.from(JSON.stringify(value))).toString("base64");
}

function createTransport(autoConfirm = true) {
	const listeners: ((event: CustomEvent<unknown>) => void)[] = [];
	const confirmations: (() => void)[] = [];
	const unsubscribe = vi.fn(async () => {});
	return {
		unsubscribe,
		confirmations,
		subscribe: vi.fn((_channel: string, _payload: unknown, listener: (event: CustomEvent<unknown>) => void) => {
			listeners.push(listener);
			return new Promise<{ unsubscribe: () => Promise<void> }>((resolve) => {
				const confirm = () => resolve({ unsubscribe });
				if (autoConfirm) confirm();
				else confirmations.push(confirm);
			});
		}),
		emit: (payload: unknown) => {
			for (const listener of listeners) listener(new CustomEvent("frame", { detail: payload }));
		},
	};
}

describe("compact market context frames", () => {
	it("decodes a frame into typed partial contexts, keeping only the known fields", async () => {
		const perp = await decodeCompactAssetCtxs(
			"pac",
			encode([
				["", [{ ...PERP_CTX, premium: "x" }]],
				["xyz", [{ markPx: "9" }]],
			]),
		);
		expect(perp).toEqual([
			["", [PERP_CTX]],
			["xyz", [{ markPx: "9" }]],
		]);
		const spot = await decodeCompactAssetCtxs(
			"sac",
			encode({ "@1": { ...SPOT_CTX, coin: "@1" }, "@2": { midPx: null } }),
		);
		expect(spot).toEqual({ "@1": SPOT_CTX, "@2": { midPx: null } });
	});

	it("rejects frames that are not compressed strings, not JSON, not the expected shape or wrongly typed", async () => {
		await expect(decodeCompactAssetCtxs("pac", { ctxs: [] })).rejects.toMatchObject({ code: "invalid_frame" });
		await expect(decodeCompactAssetCtxs("pac", "!!not base64!!")).rejects.toBeInstanceOf(L2BookStreamError);
		await expect(decodeCompactAssetCtxs("pac", encode({ "": [PERP_CTX] }))).rejects.toMatchObject({
			code: "invalid_frame",
		});
		await expect(decodeCompactAssetCtxs("pac", encode([["", [{ prevDayPx: 5 }]]]))).rejects.toMatchObject({
			code: "invalid_frame",
		});
		await expect(decodeCompactAssetCtxs("sac", encode([SPOT_CTX]))).rejects.toMatchObject({ code: "invalid_frame" });
		await expect(decodeCompactAssetCtxs("sac", encode({ "@1": null }))).rejects.toMatchObject({
			code: "invalid_frame",
		});
	});

	it("rejects a delta with a malformed spot entry instead of keeping that market's previous values", () => {
		expect(() => parseCompactSpotAssetCtxsDelta({ "@1": { markPx: "1" }, "@2": { markPx: "abc" } })).toThrow(
			L2BookStreamError,
		);
		expect(() => parseCompactSpotAssetCtxsDelta({ "@1": { markPx: "1" }, "@3": 4 })).toThrow(L2BookStreamError);
		expect(parseCompactSpotAssetCtxsDelta({ "@1": { markPx: "1" }, "@2": { midPx: null } })).toEqual({
			"@1": { markPx: "1" },
			"@2": { midPx: null },
		});
	});
});

describe("compact market context accumulation", () => {
	it("requires a complete first frame, then merges changed fields by dex index or market name", () => {
		const perp = createCompactAssetCtxsAccumulator("pac");
		expect(() => perp.add([["", [{ markPx: "1" }]]])).toThrow(L2BookStreamError);
		expect(perp.add([["", [PERP_CTX, { ...PERP_CTX, markPx: "8" }]]])).toEqual([
			["", [PERP_CTX, { ...PERP_CTX, markPx: "8" }]],
		]);
		expect(perp.add([["", [{ markPx: "9" }, {}]]])).toEqual([
			[
				"",
				[
					{ ...PERP_CTX, markPx: "9" },
					{ ...PERP_CTX, markPx: "8" },
				],
			],
		]);
		const spot = createCompactAssetCtxsAccumulator("sac");
		expect(() => spot.add({ "@1": { markPx: "1" } })).toThrow(L2BookStreamError);
		spot.add({ "@1": SPOT_CTX });
		expect(spot.add({ "@1": { markPx: "7" }, "@2": { markPx: "1" } })).toEqual({ "@1": { ...SPOT_CTX, markPx: "7" } });
		expect(spot.add({ "@2": { ...SPOT_CTX, markPx: "2" } })).toMatchObject({ "@2": { ...SPOT_CTX, markPx: "2" } });
	});

	it("keeps an entry that appears later out of the view until every field arrived", () => {
		const perp = createCompactAssetCtxsAccumulator("pac");
		perp.add([["", [PERP_CTX]]]);
		expect(perp.add([["", [{}, { markPx: "1" }]]])).toEqual([["", [PERP_CTX, undefined]]]);
		expect(perp.add([["", [{}, { ...PERP_CTX, markPx: "2" }]]])[0][1][1]).toEqual({ ...PERP_CTX, markPx: "2" });
	});
});

describe("compact market context subscription", () => {
	it("subscribes with the channel payload and delivers accumulated views in arrival order", async () => {
		const transport = createTransport();
		const listener = vi.fn();
		await subscribeCompactAssetCtxs(transport, "pac", listener);
		expect(transport.subscribe).toHaveBeenCalledWith("pac", { type: "pac" }, expect.any(Function), {
			onError: expect.any(Function),
		});
		transport.emit(encode([["", [PERP_CTX]]]));
		transport.emit(encode([["", [{ markPx: "2" }]]]));
		transport.emit(encode([["", [{ markPx: "3" }]]]));
		await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(3));
		expect(listener.mock.calls.map(([event]) => event[0][1][0].markPx)).toEqual(["5", "2", "3"]);
	});

	it("ends the subscription and reports once when a confirmed stream cannot be decoded", async () => {
		const transport = createTransport();
		const listener = vi.fn();
		const onError = vi.fn();
		await subscribeCompactAssetCtxs(transport, "sac", listener, { onError });
		transport.emit("!!not base64!!");
		transport.emit(encode({ "@1": SPOT_CTX }));
		await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
		expect(onError.mock.calls[0][0]).toBeInstanceOf(L2BookStreamError);
		expect(transport.unsubscribe).toHaveBeenCalledTimes(1);
		expect(listener).not.toHaveBeenCalled();
	});

	it("treats an incomplete first frame as a format change", async () => {
		const transport = createTransport();
		const onError = vi.fn();
		await subscribeCompactAssetCtxs(transport, "pac", vi.fn(), { onError });
		transport.emit(encode([["", [{ markPx: "1" }]]]));
		await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
		expect(onError.mock.calls[0][0]).toMatchObject({ code: "invalid_frame" });
	});

	it("rejects the subscribe promise when a frame fails before the server confirmation", async () => {
		const transport = createTransport(false);
		const listener = vi.fn();
		const onError = vi.fn();
		const pending = subscribeCompactAssetCtxs(transport, "pac", listener, { onError });
		transport.emit("!!not base64!!");
		await vi.waitFor(() => expect(transport.confirmations).toHaveLength(1));
		await new Promise((resolve) => setTimeout(resolve, 0));
		transport.confirmations[0]();
		await expect(pending).rejects.toBeInstanceOf(L2BookStreamError);
		expect(onError).not.toHaveBeenCalled();
		expect(transport.unsubscribe).toHaveBeenCalledTimes(1);
		expect(listener).not.toHaveBeenCalled();
	});

	it("stops decoding and delivering once the consumer unsubscribes", async () => {
		const transport = createTransport();
		const listener = vi.fn();
		const subscription = await subscribeCompactAssetCtxs(transport, "pac", listener);
		transport.emit(encode([["", [PERP_CTX]]]));
		await subscription.unsubscribe();
		await subscription.unsubscribe();
		transport.emit(encode([["", [PERP_CTX]]]));
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(listener).not.toHaveBeenCalled();
		expect(transport.unsubscribe).toHaveBeenCalledTimes(1);
	});

	it("restarts from a complete snapshot after the socket reconnects and drops decodes from the old connection", async () => {
		const transport = createTransport();
		const listener = vi.fn();
		const onError = vi.fn();
		const disconnectListeners: (() => void)[] = [];
		const detach = vi.fn();
		const subscription = await subscribeCompactAssetCtxs(transport, "pac", listener, { onError }, (handler) => {
			disconnectListeners.push(handler);
			return detach;
		});
		transport.emit(encode([["", [PERP_CTX]]]));
		await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(1));
		transport.emit(encode([["", [{ markPx: "2" }]]]));
		for (const handler of disconnectListeners) handler();
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(listener).toHaveBeenCalledTimes(1);
		transport.emit(encode([["", [{ markPx: "3" }]]]));
		await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
		expect(onError.mock.calls[0][0]).toMatchObject({ code: "invalid_frame" });
		expect(detach).toHaveBeenCalledTimes(1);
		await subscription.unsubscribe();
	});

	it("delivers the reconnect snapshot as a fresh view", async () => {
		const transport = createTransport();
		const listener = vi.fn();
		const disconnectListeners: (() => void)[] = [];
		await subscribeCompactAssetCtxs(transport, "sac", listener, undefined, (handler) => {
			disconnectListeners.push(handler);
			return () => {};
		});
		transport.emit(encode({ "@1": SPOT_CTX, "@9": SPOT_CTX }));
		await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(1));
		for (const handler of disconnectListeners) handler();
		transport.emit(encode({ "@1": { ...SPOT_CTX, markPx: "7" } }));
		await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(2));
		expect(listener.mock.calls[1][0]).toEqual({ "@1": { ...SPOT_CTX, markPx: "7" } });
	});

	it("ends the stream instead of skipping deltas when the backlog grows past the bound", async () => {
		const transport = createTransport();
		const onError = vi.fn();
		await subscribeCompactAssetCtxs(transport, "sac", vi.fn(), { onError });
		for (let index = 0; index <= COMPACT_ASSET_CTXS_MAX_PENDING_FRAMES + 1; index += 1)
			transport.emit(encode({ "@1": SPOT_CTX }));
		await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
		expect(transport.unsubscribe).toHaveBeenCalledTimes(1);
	});
});

describe("fast mark and mid price subscription", () => {
	function createClient(transport: ReturnType<typeof createTransport>) {
		return new CompactSubscriptionClient({ transport: transport as unknown as ISubscriptionTransport });
	}

	it("decodes the snapshot and the deltas in arrival order", async () => {
		const transport = createTransport();
		const listener = vi.fn();
		await createClient(transport).fastAssetCtxs(listener);
		expect(transport.subscribe).toHaveBeenCalledWith(
			"fastAssetCtxs",
			{ type: "fastAssetCtxs" },
			expect.any(Function),
			expect.anything(),
		);
		transport.emit(encode({ BTC: { markPx: "1", midPx: "1.5" }, ETH: { markPx: "2", midPx: null } }));
		transport.emit(encode({ BTC: { markPx: "3" } }));
		await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(2));
		expect(listener.mock.calls.map(([event]) => event)).toEqual([
			{ BTC: { markPx: "1", midPx: "1.5" }, ETH: { markPx: "2", midPx: null } },
			{ BTC: { markPx: "3" } },
		]);
	});

	it.each([
		["cannot be decompressed", () => "!!not base64!!"],
		["is not the expected shape", () => encode({ BTC: { markPx: 5 } })],
	])("reports a frame that %s instead of silently dropping every later frame", async (_case, frame) => {
		const transport = createTransport();
		const listener = vi.fn();
		const onError = vi.fn();
		await createClient(transport).fastAssetCtxs(listener, { onError });
		transport.emit(frame());
		transport.emit(encode({ BTC: { markPx: "1" } }));
		await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
		expect(onError.mock.calls[0][0]).toBeInstanceOf(L2BookStreamError);
		expect(transport.unsubscribe).toHaveBeenCalledTimes(1);
		expect(listener).not.toHaveBeenCalled();
	});

	it("reports a listener failure once instead of skipping the frames that follow", async () => {
		const transport = createTransport();
		const onError = vi.fn();
		const listener = vi.fn(() => {
			throw new Error("consumer failed");
		});
		await createClient(transport).fastAssetCtxs(listener, { onError });
		transport.emit(encode({ BTC: { markPx: "1" } }));
		transport.emit(encode({ BTC: { markPx: "2" } }));
		await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
		expect(listener).toHaveBeenCalledTimes(1);
	});
});
