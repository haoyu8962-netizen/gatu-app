// @vitest-environment jsdom

import type { UserFillsResponse, UserFillsWsEvent } from "@nktkas/hyperliquid";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RECENT_ACCOUNT_HISTORY_ROWS } from "@/config/trade";
import { useUserFills } from "@/hooks/trade/use-user-fills";

type UserFill = UserFillsResponse[number];

const mocks = vi.hoisted(() => ({
	address: "0x1111111111111111111111111111111111111111" as `0x${string}` | undefined,
	isConnected: true,
	isOnline: true,
	subscription: {
		data: undefined as UserFillsWsEvent | undefined,
		error: undefined as unknown,
		isStale: false,
		status: "idle" as "idle" | "subscribing" | "active" | "error",
	},
	useSubscription: vi.fn(),
}));

vi.mock("@/hooks/use-mobile", () => ({
	useOnlineStatus: () => mocks.isOnline,
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({
		address: mocks.address,
		isConnected: mocks.isConnected,
	}),
}));

vi.mock("@/lib/hyperliquid", () => ({
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
		mocks.isOnline = true;
		mocks.subscription.data = undefined;
		mocks.subscription.error = undefined;
		mocks.subscription.isStale = false;
		mocks.subscription.status = "idle";
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

	it("uses the WebSocket snapshot as the recent-history boundary without issuing REST", () => {
		mocks.subscription.data = {
			fills: [],
			isSnapshot: true,
			user: mocks.address as `0x${string}`,
		};
		mocks.subscription.status = "active";
		mocks.subscription.status = "active";

		const result = renderHook();

		expect(result.status).toBe("ready");
		expect(result.fills).toEqual([]);
		expect(mocks.useSubscription).toHaveBeenCalledWith(
			"userFills",
			{ aggregateByTime: true, user: mocks.address },
			{ enabled: true },
		);
	});

	it("filters TWAP fills, sorts newest first, and keeps only the latest 30 ordinary fills", () => {
		const ordinaryFills = Array.from({ length: 35 }, (_, index) =>
			createFill({ oid: index + 1, tid: index + 1, time: index + 1 }),
		);
		const twapFills = Array.from({ length: 5 }, (_, index) =>
			createFill({ oid: 100 + index, tid: 100 + index, time: 100 + index, twapId: index }),
		);
		mocks.subscription.data = {
			fills: [...ordinaryFills, ...twapFills],
			isSnapshot: true,
			user: mocks.address as `0x${string}`,
		};

		const result = renderHook();

		expect(result.status).toBe("ready");
		expect(result.fills).toHaveLength(RECENT_ACCOUNT_HISTORY_ROWS);
		expect(result.fills[0]?.time).toBe(35);
		expect(result.fills.at(-1)?.time).toBe(6);
		expect(result.fills.every((fill) => fill.twapId === null)).toBe(true);
	});

	it("fails closed for a mismatched user or malformed fill identity", () => {
		mocks.subscription.data = {
			fills: [createFill()],
			user: "0x2222222222222222222222222222222222222222",
		};

		let result = renderHook();
		expect(result.status).toBe("error");
		expect(result.error).toMatchObject({ name: "MalformedHistoryPageError" });
		expect(result.fills).toEqual([]);

		mocks.subscription.data = {
			fills: [{ ...createFill(), time: Number.NaN }],
			user: mocks.address as `0x${string}`,
		};
		result = renderHook();
		expect(result.status).toBe("error");
		expect(result.fills).toEqual([]);

		mocks.subscription.data = {
			fills: [{ ...createFill(), side: "X" as never }],
			user: mocks.address as `0x${string}`,
		};
		result = renderHook();
		expect(result.status).toBe("error");
		expect(result.fills).toEqual([]);
	});

	it("keeps a valid snapshot visible when realtime updates later fail", () => {
		const error = new Error("WebSocket unavailable");
		mocks.subscription.data = {
			fills: [createFill()],
			isSnapshot: true,
			user: mocks.address as `0x${string}`,
		};
		mocks.subscription.error = error;
		mocks.subscription.status = "error";

		const result = renderHook();

		expect(result.status).toBe("ready");
		expect(result.error).toBe(error);
		expect(result.fills).toHaveLength(1);
		expect(result.isStale).toBe(true);
	});

	it("keeps a retained snapshot stale until a reconnect delivers fresh data", () => {
		mocks.subscription.data = {
			fills: [createFill()],
			isSnapshot: true,
			user: mocks.address as `0x${string}`,
		};
		mocks.subscription.status = "subscribing";
		mocks.subscription.isStale = true;

		let result = renderHook();
		expect(result.status).toBe("ready");
		expect(result.isStale).toBe(true);

		mocks.subscription.status = "active";
		result = renderHook();
		expect(result.isStale).toBe(true);

		mocks.subscription.isStale = false;
		result = renderHook();
		expect(result.isStale).toBe(false);
	});

	it("distinguishes offline, initial subscription failure, and disconnected states", () => {
		mocks.isOnline = false;
		let result = renderHook();
		expect(result.status).toBe("offline");
		expect(result.isOffline).toBe(true);

		mocks.isOnline = true;
		mocks.subscription.status = "error";
		mocks.subscription.error = new Error("WebSocket unavailable");
		result = renderHook();
		expect(result.status).toBe("error");

		mocks.address = undefined;
		mocks.isConnected = false;
		result = renderHook();
		expect(result.status).toBe("idle");
		expect(result.isConnected).toBe(false);
		expect(mocks.useSubscription).toHaveBeenLastCalledWith(
			"userFills",
			{ aggregateByTime: true, user: "0x0000000000000000000000000000000000000000" },
			{ enabled: false },
		);
	});
});
