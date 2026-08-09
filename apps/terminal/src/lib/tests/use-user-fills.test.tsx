// @vitest-environment jsdom

import type { UserFillsResponse, UserFillsWsEvent } from "@nktkas/hyperliquid";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_HISTORY_ROWS } from "@/config/trade";
import { useUserFills } from "@/hooks/trade/use-user-fills";

type UserFill = UserFillsResponse[number];

const mocks = vi.hoisted(() => ({
	address: "0x1111111111111111111111111111111111111111" as `0x${string}` | undefined,
	isConnected: true,
	query: {
		data: undefined as UserFillsResponse | undefined,
		error: null as unknown,
		isError: false,
	},
	subscription: {
		data: undefined as UserFillsWsEvent | undefined,
		error: undefined as unknown,
		status: "idle" as "idle" | "subscribing" | "active" | "error",
	},
	useInfo: vi.fn(),
	useSubscription: vi.fn(),
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({
		address: mocks.address,
		isConnected: mocks.isConnected,
	}),
}));

vi.mock("@/lib/hyperliquid", () => ({
	useInfo: (method: string, ...args: unknown[]) => {
		mocks.useInfo(method, ...args);
		return mocks.query;
	},
	useSubscription: (method: string, ...args: unknown[]) => {
		mocks.useSubscription(method, ...args);
		return mocks.subscription;
	},
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let hookValue: ReturnType<typeof useUserFills> | null = null;

function createFill(overrides: Partial<UserFill> = {}): UserFill {
	return {
		closedPnl: "0.0",
		coin: "BTC",
		crossed: true,
		dir: "Open Long",
		fee: "0.01",
		feeToken: "USDC",
		hash: "0x0000000000000000000000000000000000000000000000000000000000000000",
		oid: 42,
		px: "63000",
		side: "B",
		startPosition: "0.0",
		sz: "0.01",
		tid: 100,
		time: 1000,
		twapId: null,
		...overrides,
	};
}

function Probe() {
	hookValue = useUserFills();
	return null;
}

describe("useUserFills", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		hookValue = null;
		mocks.address = "0x1111111111111111111111111111111111111111";
		mocks.isConnected = true;
		mocks.query.data = undefined;
		mocks.query.error = null;
		mocks.query.isError = false;
		mocks.subscription.data = undefined;
		mocks.subscription.error = undefined;
		mocks.subscription.status = "idle";
		mocks.useInfo.mockReset();
		mocks.useSubscription.mockReset();
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	function renderHook() {
		act(() => root.render(<Probe />));
		if (!hookValue) throw new Error("Missing user fills hook value");
		return hookValue;
	}

	it("does not treat an empty realtime snapshot as confirmed empty history while REST is pending", () => {
		mocks.subscription.data = {
			fills: [],
			isSnapshot: true,
			user: mocks.address as `0x${string}`,
		};
		mocks.subscription.status = "active";

		const result = renderHook();

		expect(result.status).toBe("loading");
		expect(result.fills).toEqual([]);
	});

	it("uses the REST snapshot when the realtime snapshot is empty", () => {
		const fill = createFill();
		mocks.query.data = [fill];
		mocks.subscription.data = {
			fills: [],
			isSnapshot: true,
			user: mocks.address as `0x${string}`,
		};
		mocks.subscription.status = "active";

		const result = renderHook();

		expect(result.status).toBe("ready");
		expect(result.fills).toEqual([fill]);
		expect(mocks.useInfo).toHaveBeenCalledWith(
			"userFills",
			{ aggregateByTime: true, user: mocks.address },
			expect.objectContaining({
				enabled: true,
				refetchOnReconnect: true,
				refetchOnWindowFocus: false,
			}),
		);
		expect(mocks.useSubscription).toHaveBeenCalledWith(
			"userFills",
			{ aggregateByTime: true, user: mocks.address },
			{ enabled: true },
		);
		expect(mocks.useInfo.mock.calls.some(([method]) => method === "userTwapSliceFills")).toBe(false);
		expect(mocks.useSubscription.mock.calls.some(([method]) => method === "userTwapSliceFills")).toBe(false);
	});

	it("excludes TWAP fills reported by the general fills stream", () => {
		const ordinaryFill = createFill({ oid: 84, tid: 200, time: 1000 });
		const zeroIdTwapFill = createFill({ oid: 85, tid: 201, time: 2000, twapId: 0 });
		const twapFill = createFill({ oid: 86, tid: 202, time: 3000, twapId: 7 });
		mocks.query.data = [ordinaryFill, zeroIdTwapFill];
		mocks.subscription.data = {
			fills: [twapFill],
			user: mocks.address as `0x${string}`,
		};

		const result = renderHook();

		expect(result.status).toBe("ready");
		expect(result.fills).toEqual([ordinaryFill]);
	});

	it("filters TWAP fills before applying the recent-history row limit", () => {
		const ordinaryFill = createFill({ oid: 999, tid: 999, time: 1 });
		const twapFills = Array.from({ length: MAX_HISTORY_ROWS }, (_, index) =>
			createFill({ oid: index + 1, tid: index + 1, time: index + 2, twapId: index }),
		);
		mocks.query.data = [...twapFills, ordinaryFill];

		const result = renderHook();

		expect(result.status).toBe("ready");
		expect(result.fills).toEqual([ordinaryFill]);
	});

	it("accepts an explicit empty REST response as an empty trade history", () => {
		mocks.query.data = [];
		mocks.subscription.status = "error";
		mocks.subscription.error = new Error("WebSocket unavailable");

		const result = renderHook();

		expect(result.status).toBe("ready");
		expect(result.error).toBeUndefined();
		expect(result.fills).toEqual([]);
	});

	it("keeps realtime fills visible but does not mark history complete while REST is pending", () => {
		const fill = createFill();
		mocks.subscription.data = {
			fills: [fill],
			isSnapshot: true,
			user: mocks.address as `0x${string}`,
		};
		mocks.subscription.status = "active";

		const result = renderHook();

		expect(result.status).toBe("loading");
		expect(result.fills).toEqual([fill]);
	});

	it("does not let a non-empty realtime update hide a failed REST snapshot", () => {
		const queryError = new Error("REST unavailable");
		mocks.query.error = queryError;
		mocks.query.isError = true;
		mocks.subscription.data = {
			fills: [createFill()],
			user: mocks.address as `0x${string}`,
		};
		mocks.subscription.status = "active";

		const result = renderHook();

		expect(result.status).toBe("error");
		expect(result.error).toBe(queryError);
	});

	it("fails closed when the REST snapshot contains an invalid fill identity", () => {
		mocks.query.data = [{ ...createFill(), tid: undefined as never }];

		const result = renderHook();

		expect(result.status).toBe("error");
		expect(result.error).toMatchObject({ name: "MalformedHistoryPageError" });
		expect(result.fills).toEqual([]);
	});

	it("fails closed instead of throwing when the REST snapshot is not an array", () => {
		mocks.query.data = { fills: [] } as never;

		const result = renderHook();

		expect(result.status).toBe("error");
		expect(result.error).toMatchObject({ name: "MalformedHistoryPageError" });
	});

	it("fails closed when a realtime fill has an invalid timestamp", () => {
		mocks.query.data = [];
		mocks.subscription.data = {
			fills: [{ ...createFill(), time: Number.NaN }],
			user: mocks.address as `0x${string}`,
		};
		mocks.subscription.status = "active";

		const result = renderHook();

		expect(result.status).toBe("error");
		expect(result.error).toMatchObject({ name: "MalformedHistoryPageError" });
	});

	it("fails closed when a fill has a malformed TWAP ID", () => {
		mocks.query.data = [createFill({ twapId: Number.NaN })];

		const result = renderHook();

		expect(result.status).toBe("error");
		expect(result.error).toMatchObject({ name: "MalformedHistoryPageError" });
		expect(result.fills).toEqual([]);
	});

	it("reports an error when REST fails and the active realtime stream has no history", () => {
		const queryError = new Error("REST unavailable");
		mocks.query.error = queryError;
		mocks.query.isError = true;
		mocks.subscription.data = {
			fills: [],
			isSnapshot: true,
			user: mocks.address as `0x${string}`,
		};
		mocks.subscription.status = "active";

		const result = renderHook();

		expect(result.status).toBe("error");
		expect(result.error).toBe(queryError);
	});
});
