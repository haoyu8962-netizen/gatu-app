// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getBboPrices, getMidReferencePrice, useOrderbookMidPrice } from "@/hooks/trade/use-orderbook-mid-price";

const mocks = vi.hoisted(() => ({
	calls: [] as Array<[string, unknown, unknown]>,
	result: {
		data: undefined as
			| {
					bbo: [{ n: number; px: string; sz: string } | null, { n: number; px: string; sz: string } | null];
					coin: string;
					time: number;
			  }
			| undefined,
		error: undefined as unknown,
		isStale: false,
		status: "idle" as "active" | "error" | "idle" | "subscribing",
	},
}));

vi.mock("@/lib/hyperliquid", () => ({
	useSubscription: (method: string, params: unknown, options: unknown) => {
		mocks.calls.push([method, params, options]);
		return mocks.result;
	},
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let hookValue: ReturnType<typeof useOrderbookMidPrice> | null = null;

function Probe({ coin }: { coin: string | undefined }) {
	hookValue = useOrderbookMidPrice(coin);
	return null;
}

describe("useOrderbookMidPrice", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		hookValue = null;
		mocks.calls.length = 0;
		mocks.result.data = undefined;
		mocks.result.error = undefined;
		mocks.result.isStale = false;
		mocks.result.status = "idle";
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("subscribes to the official BBO stream without creating an extra L2 book", () => {
		mocks.result.data = {
			bbo: [
				{ n: 1, px: "12345678901234567890.11", sz: "1" },
				{ n: 2, px: "12345678901234567890.13", sz: "2" },
			],
			coin: "BTC",
			time: 1,
		};
		mocks.result.status = "active";

		act(() => root.render(<Probe coin="BTC" />));

		expect(mocks.calls).toEqual([["bbo", { coin: "BTC" }, { enabled: true, throttleMs: 50 }]]);
		expect(mocks.calls.some(([method]) => method === "l2Book")).toBe(false);
		expect(hookValue).toMatchObject({
			bestAsk: "12345678901234567890.13",
			bestBid: "12345678901234567890.11",
			midPx: "12345678901234567890.12",
			status: "active",
		});
	});

	it("keeps one-sided and malformed BBO data unavailable instead of inventing a mid", () => {
		expect(getBboPrices([{ px: "10" }, null])).toEqual({
			bestAsk: undefined,
			bestBid: "10",
			midPx: undefined,
		});
		expect(getBboPrices([null, { px: "11" }])).toEqual({
			bestAsk: "11",
			bestBid: undefined,
			midPx: undefined,
		});
		expect(getBboPrices([{ px: "invalid" }, { px: "0" }])).toEqual({
			bestAsk: undefined,
			bestBid: undefined,
			midPx: undefined,
		});
		expect(getBboPrices([{ px: "12" }, { px: "11" }])).toEqual({
			bestAsk: undefined,
			bestBid: undefined,
			midPx: undefined,
		});
	});

	it("rejects a late BBO event from the previously selected market", () => {
		mocks.result.data = {
			bbo: [
				{ n: 1, px: "10", sz: "1" },
				{ n: 1, px: "12", sz: "1" },
			],
			coin: "ETH",
			time: 1,
		};
		mocks.result.status = "active";

		act(() => root.render(<Probe coin="BTC" />));

		expect(hookValue).toMatchObject({ bestAsk: undefined, bestBid: undefined, midPx: undefined });
	});

	it("rejects retained BBO data while its subscription is recovering", () => {
		mocks.result.data = {
			bbo: [
				{ n: 1, px: "10", sz: "1" },
				{ n: 1, px: "12", sz: "1" },
			],
			coin: "BTC",
			time: 1,
		};
		mocks.result.status = "subscribing";

		act(() => root.render(<Probe coin="BTC" />));

		expect(hookValue).toMatchObject({ bestAsk: undefined, bestBid: undefined, midPx: undefined });
	});

	it("disables the BBO subscription until a canonical coin is available", () => {
		act(() => root.render(<Probe coin={undefined} />));

		expect(mocks.calls).toEqual([["bbo", { coin: "" }, { enabled: false, throttleMs: 50 }]]);
		expect(hookValue?.midPx).toBeUndefined();
	});

	it("uses a real BBO mid for Mid controls and falls back to mark only while BBO is unavailable", () => {
		expect(getMidReferencePrice("101.25", "99.75")).toBe("101.25");
		expect(getMidReferencePrice(undefined, "99.75")).toBe("99.75");
	});
});
