// @vitest-environment jsdom

import type { UserFundingResponse, UserFundingsWsEvent } from "@nktkas/hyperliquid";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RECENT_FUNDING_ROWS } from "@/config/trade";
import { useUserFunding } from "@/hooks/trade/use-user-funding";
import { normalizeUserFundingResponse } from "@/lib/trade/user-funding";

const ADDRESS_A = "0x1111111111111111111111111111111111111111" as const;
const ADDRESS_B = "0x2222222222222222222222222222222222222222" as const;
const NOW = 1_800_000_000_000;

const mocks = vi.hoisted(() => ({
	address: "0x1111111111111111111111111111111111111111" as `0x${string}` | undefined,
	isConnected: true,
	isOnline: true,
	subscription: {
		data: undefined as UserFundingsWsEvent | undefined,
		error: undefined as unknown,
		isStale: false,
		status: "idle" as "active" | "error" | "idle" | "subscribing",
	},
	useSubscription: vi.fn(),
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({ address: mocks.address, isConnected: mocks.isConnected }),
}));

vi.mock("@/hooks/use-mobile", () => ({
	useOnlineStatus: () => mocks.isOnline,
}));

vi.mock("@/lib/hyperliquid", () => ({
	useSubscription: (...args: unknown[]) => {
		mocks.useSubscription(...args);
		return mocks.subscription;
	},
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let hookValue: ReturnType<typeof useUserFunding> | null = null;

function Probe() {
	hookValue = useUserFunding();
	return null;
}

function createFunding(time: number, coin = "BTC"): UserFundingsWsEvent["fundings"][number] {
	return { coin, fundingRate: "0.0001", nSamples: null, szi: "1", time, usdc: "2" };
}

describe("useUserFunding", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		hookValue = null;
		mocks.address = ADDRESS_A;
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
		if (!hookValue) throw new Error("Missing user funding hook value");
		return hookValue;
	}

	it("subscribes to recent funding updates without requesting REST history", () => {
		const result = renderHook();

		expect(result).toMatchObject({ fundings: [], isConnected: true, status: "loading" });
		expect(mocks.useSubscription).toHaveBeenCalledWith("userFundings", { user: ADDRESS_A }, { enabled: true });
	});

	it("uses a valid snapshot immediately and exposes only the latest 30 payments", () => {
		mocks.subscription.data = {
			fundings: Array.from({ length: RECENT_FUNDING_ROWS + 5 }, (_, index) => createFunding(NOW - index)).reverse(),
			isSnapshot: true,
			user: ADDRESS_A,
		};
		mocks.subscription.status = "active";

		const result = renderHook();

		expect(result.status).toBe("ready");
		expect(result.fundings).toHaveLength(RECENT_FUNDING_ROWS);
		expect(result.fundings.at(0)?.time).toBe(NOW);
		expect(result.fundings.at(-1)?.time).toBe(NOW - RECENT_FUNDING_ROWS + 1);
	});

	it("treats an empty WebSocket snapshot as a confirmed empty recent window", () => {
		mocks.subscription.data = { fundings: [], isSnapshot: true, user: ADDRESS_A };
		mocks.subscription.status = "active";

		expect(renderHook()).toMatchObject({ fundings: [], status: "ready" });
	});

	it("normalizes an undocumented missing WebSocket nSamples field to null", () => {
		mocks.subscription.data = {
			fundings: [{ coin: "BTC", fundingRate: "0.0001", szi: "1", time: NOW, usdc: "2" }],
			isSnapshot: true,
			user: ADDRESS_A,
		} as unknown as UserFundingsWsEvent;
		mocks.subscription.status = "active";

		expect(renderHook()).toMatchObject({ fundings: [{ nSamples: null }], status: "ready" });
	});

	it("normalizes an undocumented missing REST nSamples field to null", () => {
		const response = [
			{
				delta: { coin: "BTC", fundingRate: "0.0001", szi: "1", type: "funding", usdc: "2" },
				hash: "0xabc",
				time: NOW,
			},
		] as unknown as UserFundingResponse;

		expect(normalizeUserFundingResponse(response)).toMatchObject([{ nSamples: null }]);
	});

	it("rejects malformed REST fields after normalization", () => {
		const response = [
			{
				delta: { coin: "", fundingRate: "0.0001", szi: "1", type: "funding", usdc: "2" },
				hash: "0xabc",
				time: NOW,
			},
		] as unknown as UserFundingResponse;

		expect(() => normalizeUserFundingResponse(response)).toThrow(
			expect.objectContaining({ name: "MalformedHistoryPageError" }),
		);
	});

	it("keeps accumulated incremental updates ready after the initial snapshot", () => {
		mocks.subscription.data = { fundings: [createFunding(NOW)], user: ADDRESS_A };
		mocks.subscription.status = "active";

		expect(renderHook()).toMatchObject({ fundings: [createFunding(NOW)], status: "ready" });
	});

	it("reports subscription failures separately from an empty snapshot", () => {
		const error = new Error("WebSocket unavailable");
		mocks.subscription.error = error;
		mocks.subscription.status = "error";

		const result = renderHook();

		expect(result.status).toBe("error");
		expect(result.error).toBe(error);
	});

	it("reports offline explicitly before the first WebSocket snapshot", () => {
		mocks.isOnline = false;
		mocks.subscription.status = "subscribing";

		expect(renderHook()).toMatchObject({ fundings: [], isOffline: true, status: "offline" });
	});

	it("keeps a valid snapshot ready while offline", () => {
		mocks.isOnline = false;
		mocks.subscription.data = { fundings: [createFunding(NOW)], isSnapshot: true, user: ADDRESS_A };
		mocks.subscription.status = "active";

		expect(renderHook()).toMatchObject({ fundings: [createFunding(NOW)], isOffline: true, status: "ready" });
	});

	it("keeps a valid snapshot ready when live updates later fail", () => {
		const error = new Error("WebSocket unavailable");
		mocks.subscription.data = { fundings: [createFunding(NOW)], isSnapshot: true, user: ADDRESS_A };
		mocks.subscription.error = error;
		mocks.subscription.status = "error";

		const result = renderHook();

		expect(result).toMatchObject({ fundings: [createFunding(NOW)], status: "ready" });
		expect(result.error).toBe(error);
	});

	it("keeps a retained snapshot visible but marks it stale until a reconnect snapshot arrives", () => {
		mocks.subscription.data = { fundings: [createFunding(NOW)], isSnapshot: true, user: ADDRESS_A };
		mocks.subscription.isStale = true;
		mocks.subscription.status = "active";

		expect(renderHook()).toMatchObject({
			fundings: [createFunding(NOW)],
			isStale: true,
			status: "ready",
		});
	});

	it("fails closed when a funding update is malformed", () => {
		mocks.subscription.data = {
			fundings: [{ ...createFunding(NOW), coin: "" }],
			isSnapshot: true,
			user: ADDRESS_A,
		};
		mocks.subscription.status = "active";

		const result = renderHook();

		expect(result.status).toBe("error");
		expect(result.error).toMatchObject({ name: "MalformedHistoryPageError" });
		expect(result.fundings).toEqual([]);
	});

	it("fails closed when the snapshot belongs to a different user", () => {
		mocks.subscription.data = {
			fundings: [createFunding(NOW)],
			isSnapshot: true,
			user: ADDRESS_B,
		};
		mocks.subscription.status = "active";

		expect(renderHook()).toMatchObject({ fundings: [], status: "error" });
	});

	it("fails closed instead of throwing when the snapshot user is malformed", () => {
		mocks.subscription.data = {
			fundings: [createFunding(NOW)],
			isSnapshot: true,
		} as unknown as UserFundingsWsEvent;
		mocks.subscription.status = "active";

		expect(renderHook()).toMatchObject({ fundings: [], status: "error" });
	});

	it("stays idle and disables the subscription without a connected owner", () => {
		mocks.isConnected = false;
		mocks.address = undefined;

		const result = renderHook();

		expect(result).toMatchObject({ fundings: [], isConnected: false, status: "idle" });
		expect(mocks.useSubscription).toHaveBeenCalledWith(
			"userFundings",
			{ user: "0x0000000000000000000000000000000000000000" },
			{ enabled: false },
		);
	});

	it("treats a connected session without an address as unavailable", () => {
		mocks.address = undefined;

		expect(renderHook()).toMatchObject({ isConnected: false, status: "idle" });
	});

	it("resubscribes with the exact owner when the wallet changes", () => {
		renderHook();
		mocks.address = ADDRESS_B;
		renderHook();

		expect(mocks.useSubscription).toHaveBeenLastCalledWith("userFundings", { user: ADDRESS_B }, { enabled: true });
	});
});
