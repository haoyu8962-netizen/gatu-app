import zlib from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import {
	decodeCompactAssetCtxs,
	subscribeCompactAssetCtxs,
} from "../../../../../packages/hl-react/src/subscriptions/compact-asset-ctxs";
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

function createTransport() {
	const listeners: ((event: CustomEvent<unknown>) => void)[] = [];
	const unsubscribe = vi.fn(async () => {});
	return {
		unsubscribe,
		subscribe: vi.fn(async (_channel: string, _payload: unknown, listener: (event: CustomEvent<unknown>) => void) => {
			listeners.push(listener);
			return { unsubscribe };
		}),
		emit: (payload: unknown) => {
			for (const listener of listeners) listener(new CustomEvent("frame", { detail: payload }));
		},
	};
}

describe("compact market context channels", () => {
	it("decodes the perp and spot frames into their documented shapes", async () => {
		const perp = await decodeCompactAssetCtxs(
			"pac",
			encode([
				["", [PERP_CTX]],
				["xyz", [PERP_CTX, PERP_CTX]],
			]),
		);
		expect(perp[1]).toEqual(["xyz", [PERP_CTX, PERP_CTX]]);
		const spot = await decodeCompactAssetCtxs("sac", encode({ "@1": SPOT_CTX, "PURR/USDC": SPOT_CTX }));
		expect(spot["PURR/USDC"]).toEqual(SPOT_CTX);
	});

	it("rejects frames that are not compressed strings, not JSON or not the expected shape", async () => {
		await expect(decodeCompactAssetCtxs("pac", { ctxs: [] })).rejects.toMatchObject({ code: "invalid_frame" });
		await expect(decodeCompactAssetCtxs("pac", "!!not base64!!")).rejects.toBeInstanceOf(L2BookStreamError);
		await expect(decodeCompactAssetCtxs("pac", encode({ "": [PERP_CTX] }))).rejects.toMatchObject({
			code: "invalid_frame",
		});
		await expect(decodeCompactAssetCtxs("sac", encode([SPOT_CTX]))).rejects.toMatchObject({ code: "invalid_frame" });
	});

	it("subscribes with the channel payload and delivers decoded frames in arrival order", async () => {
		const transport = createTransport();
		const listener = vi.fn();
		await subscribeCompactAssetCtxs(transport, "pac", listener);
		expect(transport.subscribe).toHaveBeenCalledWith("pac", { type: "pac" }, expect.any(Function), undefined);
		transport.emit(encode([["", [{ ...PERP_CTX, markPx: "1" }]]]));
		transport.emit(encode([["", [{ ...PERP_CTX, markPx: "2" }]]]));
		await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(2));
		expect(listener.mock.calls.map(([event]) => event[0][1][0].markPx)).toEqual(["1", "2"]);
	});

	it("ends the subscription and reports once when a frame cannot be decoded", async () => {
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
});
