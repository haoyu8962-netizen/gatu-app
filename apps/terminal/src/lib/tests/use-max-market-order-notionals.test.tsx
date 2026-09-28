// @vitest-environment jsdom

import type { MaxMarketOrderNtlsResponse } from "@nktkas/hyperliquid";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMaxMarketOrderNotionals } from "@/hooks/trade/use-max-market-order-notionals";

const TIERS: MaxMarketOrderNtlsResponse = [
	[25, "30000000.0"],
	[20, "5000000.0"],
	[10, "2000000.0"],
	[1, "500000.0"],
];

const mocks = vi.hoisted(() => ({
	infoCalls: [] as Array<[string, unknown, Record<string, unknown>]>,
	subscriptionCalls: [] as string[],
	result: {
		data: undefined as unknown,
		isSuccess: false,
		status: "pending" as "pending" | "error" | "success",
	},
}));

vi.mock("@/lib/hyperliquid", () => ({
	useInfo: (method: string, params: unknown, options: Record<string, unknown>) => {
		mocks.infoCalls.push([method, params, options]);
		return mocks.result;
	},
	useSubscription: (method: string) => {
		mocks.subscriptionCalls.push(method);
		return { data: undefined, error: undefined, isStale: false, status: "idle" };
	},
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let hookValue: ReturnType<typeof useMaxMarketOrderNotionals> | "unset" = "unset";

function Probe({ enabled }: { enabled: boolean }) {
	hookValue = useMaxMarketOrderNotionals(enabled);
	return null;
}

describe("useMaxMarketOrderNotionals", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		hookValue = "unset";
		mocks.infoCalls.length = 0;
		mocks.subscriptionCalls.length = 0;
		mocks.result = { data: TIERS, isSuccess: true, status: "success" };
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	function render(enabled: boolean) {
		act(() => root.render(<Probe enabled={enabled} />));
	}

	it("requests the user-independent tier table through the info API with a long cache", () => {
		render(true);

		expect(mocks.subscriptionCalls).toHaveLength(0);
		expect(mocks.infoCalls).toHaveLength(1);
		const [method, params, options] = mocks.infoCalls[0] ?? [];
		expect(method).toBe("maxMarketOrderNtls");
		expect(params).toBeUndefined();
		expect(options).toEqual({ enabled: true, staleTime: 30 * 60_000, gcTime: 30 * 60_000 });
		expect(options).not.toHaveProperty("persist");
		expect(hookValue).toBe(TIERS);
	});

	it("passes the dialog open state through as the query switch", () => {
		render(false);
		expect(mocks.infoCalls.at(-1)?.[2]).toMatchObject({ enabled: false });
	});

	it.each([
		["pending", { data: undefined, isSuccess: false, status: "pending" as const }],
		["error", { data: undefined, isSuccess: false, status: "error" as const }],
		["a failed refetch that kept older data", { data: TIERS, isSuccess: false, status: "error" as const }],
	])("returns nothing while the query is %s", (_label, result) => {
		mocks.result = result;
		render(true);
		expect(hookValue).toBeUndefined();
	});

	it("keeps returning cached success data after the dialog starts closing", () => {
		render(true);
		expect(hookValue).toBe(TIERS);

		render(false);
		expect(mocks.infoCalls.at(-1)?.[2]).toMatchObject({ enabled: false });
		expect(hookValue).toBe(TIERS);
	});
});
