// @vitest-environment jsdom

import type { UserNonFundingLedgerUpdatesResponse, UserNonFundingLedgerUpdatesWsEvent } from "@nktkas/hyperliquid";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAccountLedger } from "@/hooks/trade/use-account-ledger";

const ADDRESS = "0x1111111111111111111111111111111111111111" as const;

const mocks = vi.hoisted(() => ({
	address: "0x1111111111111111111111111111111111111111" as `0x${string}` | undefined,
	isConnected: true,
	query: {
		data: undefined as UserNonFundingLedgerUpdatesResponse | undefined,
		error: null as unknown,
		isError: false,
		refetch: vi.fn(),
	},
	subscription: {
		data: undefined as UserNonFundingLedgerUpdatesWsEvent | undefined,
		error: undefined as unknown,
		status: "idle" as "active" | "error" | "idle" | "subscribing",
	},
	useInfo: vi.fn(),
	useSubscription: vi.fn(),
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({ address: mocks.address, isConnected: mocks.isConnected }),
}));

vi.mock("@/lib/hyperliquid", () => ({
	useInfo: (...args: unknown[]) => {
		mocks.useInfo(...args);
		return mocks.query;
	},
	useSubscription: (...args: unknown[]) => {
		mocks.useSubscription(...args);
		return mocks.subscription;
	},
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let hookValue: ReturnType<typeof useAccountLedger> | null = null;

function Probe() {
	hookValue = useAccountLedger();
	return null;
}

function createDeposit(time: number): UserNonFundingLedgerUpdatesResponse[number] {
	return {
		delta: { type: "deposit", usdc: "5" },
		hash: `0x${time.toString(16).padStart(64, "0")}`,
		time,
	};
}

describe("useAccountLedger", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		hookValue = null;
		mocks.address = ADDRESS;
		mocks.isConnected = true;
		mocks.query.data = undefined;
		mocks.query.error = null;
		mocks.query.isError = false;
		mocks.query.refetch.mockReset();
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
		if (!hookValue) throw new Error("Missing account ledger hook value");
		return hookValue;
	}

	it("uses the documented REST request and WebSocket subscription", () => {
		mocks.query.data = [createDeposit(1_000)];

		const result = renderHook();

		expect(result.status).toBe("ready");
		expect(result.rows).toHaveLength(1);
		expect(mocks.useInfo).toHaveBeenCalledWith(
			"userNonFundingLedgerUpdates",
			{ startTime: 0, user: ADDRESS },
			expect.objectContaining({
				enabled: true,
				refetchOnReconnect: true,
				refetchOnWindowFocus: false,
			}),
		);
		expect(mocks.useSubscription).toHaveBeenCalledWith(
			"userNonFundingLedgerUpdates",
			{ user: ADDRESS },
			{ enabled: true },
		);
	});

	it("merges and orders REST history with realtime updates", () => {
		mocks.query.data = [createDeposit(1_000)];
		mocks.subscription.data = {
			isSnapshot: true,
			nonFundingLedgerUpdates: [createDeposit(2_000), createDeposit(1_000)],
			user: ADDRESS,
		};
		mocks.subscription.status = "active";

		const result = renderHook();

		expect(result.rows.map((row) => row.time)).toEqual([2_000, 1_000]);
	});

	it("keeps an empty snapshot loading until REST confirms history", () => {
		mocks.subscription.data = { isSnapshot: true, nonFundingLedgerUpdates: [], user: ADDRESS };
		mocks.subscription.status = "active";

		expect(renderHook().status).toBe("loading");
	});

	it("reports a terminal error only when both data paths have no usable history", () => {
		const error = new Error("Info unavailable");
		mocks.query.error = error;
		mocks.query.isError = true;
		mocks.subscription.data = { isSnapshot: true, nonFundingLedgerUpdates: [], user: ADDRESS };
		mocks.subscription.status = "active";

		const result = renderHook();

		expect(result.status).toBe("error");
		expect(result.error).toBe(error);
		result.retry();
		expect(mocks.query.refetch).toHaveBeenCalledOnce();
	});

	it("disables both data paths while disconnected", () => {
		mocks.address = undefined;
		mocks.isConnected = false;

		const result = renderHook();

		expect(result.status).toBe("idle");
		expect(mocks.useInfo).toHaveBeenCalledWith(
			"userNonFundingLedgerUpdates",
			expect.objectContaining({ user: expect.any(String) }),
			expect.objectContaining({ enabled: false }),
		);
		expect(mocks.useSubscription).toHaveBeenCalledWith("userNonFundingLedgerUpdates", expect.any(Object), {
			enabled: false,
		});
	});
});
