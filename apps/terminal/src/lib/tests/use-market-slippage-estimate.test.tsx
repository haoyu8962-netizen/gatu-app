// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMarketSlippageEstimate } from "@/hooks/trade/use-market-slippage-estimate";
import type { Numeric } from "@/lib/trade/numbers";
import type { Side } from "@/lib/trade/types";

type BookLevel = { px: string; sz: string; n: number };

const mocks = vi.hoisted(() => ({
	infoCalls: [] as Array<[string, Record<string, unknown>, Record<string, unknown>]>,
	subscriptionCalls: [] as string[],
	result: {
		data: undefined as { coin: string; levels: [BookLevel[], BookLevel[]]; time: number } | null | undefined,
	},
}));

vi.mock("@/lib/hyperliquid", () => ({
	useInfo: (method: string, params: Record<string, unknown>, options: Record<string, unknown>) => {
		mocks.infoCalls.push([method, params, options]);
		return mocks.result;
	},
	useSubscription: (method: string) => {
		mocks.subscriptionCalls.push(method);
		return { data: undefined, error: undefined, isStale: false, status: "idle" };
	},
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const snapshot = {
	coin: "HYPE",
	levels: [
		[
			{ px: "99.9", sz: "2", n: 1 },
			{ px: "99.8", sz: "5", n: 1 },
		],
		[
			{ px: "100.1", sz: "2", n: 1 },
			{ px: "100.2", sz: "5", n: 1 },
		],
	] as [BookLevel[], BookLevel[]],
	time: 1,
};

let hookValue: ReturnType<typeof useMarketSlippageEstimate> = null;

function Probe({
	coin,
	enabled,
	side,
	size,
}: {
	coin: string | undefined;
	enabled: boolean;
	side: Side;
	size: Numeric;
}) {
	hookValue = useMarketSlippageEstimate(coin, side, size, enabled);
	return null;
}

describe("useMarketSlippageEstimate", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		hookValue = null;
		mocks.infoCalls.length = 0;
		mocks.subscriptionCalls.length = 0;
		mocks.result.data = snapshot;
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	function render(props: { coin?: string | undefined; enabled?: boolean; side?: Side; size?: Numeric } = {}) {
		const coin = "coin" in props ? props.coin : "HYPE";
		const size = "size" in props ? props.size : 1;
		act(() =>
			root.render(<Probe coin={coin} enabled={props.enabled ?? true} side={props.side ?? "buy"} size={size} />),
		);
	}

	function lastInfoOptions(): Record<string, unknown> {
		return mocks.infoCalls[mocks.infoCalls.length - 1]?.[2] ?? {};
	}

	it("reads the book over the info API instead of opening a second l2Book subscription", () => {
		render();

		expect(mocks.subscriptionCalls).toHaveLength(0);
		expect(mocks.infoCalls[0]?.[0]).toBe("l2Book");
		expect(mocks.infoCalls[0]?.[1]).toEqual({ coin: "HYPE" });
		expect(Object.keys(mocks.infoCalls[0]?.[1] ?? {})).toEqual(["coin"]);
	});

	it("polls only while a market order carries a positive size", () => {
		render();
		expect(lastInfoOptions()).toMatchObject({
			enabled: true,
			refetchInterval: 3_000,
			refetchIntervalInBackground: false,
		});

		render({ size: 0 });
		expect(lastInfoOptions()).toMatchObject({ enabled: false, refetchInterval: false });
		expect(hookValue).toBeNull();

		render({ enabled: false });
		expect(lastInfoOptions()).toMatchObject({ enabled: false, refetchInterval: false });
		expect(hookValue).toBeNull();

		render({ coin: undefined });
		expect(lastInfoOptions()).toMatchObject({ enabled: false, refetchInterval: false });
		expect(hookValue).toBeNull();
	});

	it("estimates from the snapshot and flags a size beyond the visible depth", () => {
		render({ size: 2 });
		expect(hookValue).toEqual({ avgPx: 100.1, exceedsVisibleDepth: false, refPx: 100, slippageBps: 10 });

		render({ size: 100 });
		expect(hookValue?.exceedsVisibleDepth).toBe(true);
	});

	it("ignores a snapshot that belongs to another coin or is missing", () => {
		mocks.result.data = { ...snapshot, coin: "BTC" };
		render();
		expect(hookValue).toBeNull();

		mocks.result.data = null;
		render();
		expect(hookValue).toBeNull();

		mocks.result.data = undefined;
		render();
		expect(hookValue).toBeNull();
	});
});
