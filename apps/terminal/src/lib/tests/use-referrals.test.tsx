// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useReferrals } from "@/hooks/trade/use-referrals";
import type { ReferralData } from "@/lib/trade/referral";

const OWNER = "0x1111111111111111111111111111111111111111" as const;

const testState = vi.hoisted(() => ({
	accountLedgerEnabled: undefined as boolean | undefined,
	accountLedgerRetry: vi.fn(),
	isConnected: true,
	referralQuery: {
		data: undefined as ReferralData | null | undefined,
		error: null as unknown,
		fetchStatus: "idle" as "fetching" | "idle" | "paused",
		isError: false,
		isSuccess: false,
		refetch: vi.fn(),
	},
	spotMetaQuery: {
		data: undefined,
	},
	useInfo: vi.fn(),
	userFeesQuery: {
		data: undefined,
		refetch: vi.fn(),
	},
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({ address: testState.isConnected ? OWNER : undefined, isConnected: testState.isConnected }),
}));

vi.mock("@/hooks/trade/use-account-ledger", () => ({
	useAccountLedger: ({ enabled }: { enabled?: boolean } = {}) => {
		testState.accountLedgerEnabled = enabled;
		return {
			retry: testState.accountLedgerRetry,
			rewardClaimRows: [],
			status: "idle",
		};
	},
}));

vi.mock("@/lib/hyperliquid", () => ({
	useInfo: (method: string, ...args: unknown[]) => {
		testState.useInfo(method, ...args);
		if (method === "referral") return testState.referralQuery;
		if (method === "userFees") return testState.userFeesQuery;
		return testState.spotMetaQuery;
	},
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let hookValue: ReturnType<typeof useReferrals> | null = null;

function createReferralData(): ReferralData {
	return {
		builderRewards: "0",
		claimedRewards: "0",
		cumVlm: "0",
		referredBy: null,
		referrerState: { stage: "needToCreateCode" },
		rewardHistory: [],
		tokenToState: [],
		unclaimedRewards: "0",
	};
}

let claimHistoryEnabled = false;

function Probe() {
	hookValue = useReferrals({ claimHistoryEnabled });
	return null;
}

describe("useReferrals query state", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		vi.clearAllMocks();
		testState.isConnected = true;
		testState.accountLedgerEnabled = undefined;
		claimHistoryEnabled = false;
		testState.referralQuery.data = undefined;
		testState.referralQuery.error = null;
		testState.referralQuery.fetchStatus = "idle";
		testState.referralQuery.isError = false;
		testState.referralQuery.isSuccess = false;
		testState.referralQuery.refetch.mockResolvedValue({ data: createReferralData(), error: null });
		testState.userFeesQuery.refetch.mockResolvedValue({ data: undefined, error: null });
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		hookValue = null;
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	function renderHook() {
		act(() => root.render(<Probe />));
		if (!hookValue) throw new Error("Missing referrals hook value");
		return hookValue;
	}

	it("shows loading only while the referral request is actually fetching", () => {
		testState.referralQuery.fetchStatus = "fetching";
		expect(renderHook().status).toBe("loading");

		testState.referralQuery.fetchStatus = "paused";
		expect(renderHook().status).toBe("unavailable");

		testState.referralQuery.fetchStatus = "idle";
		expect(renderHook().status).toBe("unavailable");
	});

	it("keeps validated cached data visible during a background refresh", () => {
		testState.referralQuery.data = createReferralData();
		testState.referralQuery.fetchStatus = "fetching";

		const result = renderHook();

		expect(result.status).toBe("ready");
		expect(result.isRefreshing).toBe(true);
	});

	it("exposes only positive unclaimed reward rows through the renamed hook fields", () => {
		const data = createReferralData();
		data.tokenToState = [
			[
				0,
				{
					builderRewards: "3",
					claimedRewards: "2",
					cumVlm: "10",
					unclaimedRewards: "0",
				},
			],
			[
				1,
				{
					builderRewards: "4",
					claimedRewards: "1",
					cumVlm: "20",
					unclaimedRewards: "1.25",
				},
			],
		];
		testState.referralQuery.data = data;

		const result = renderHook();

		expect(result.hasUnclaimedRewards).toBe(true);
		expect(result.unclaimedRewardRows.map((row) => row.tokenId)).toEqual([1]);
		expect(result.unclaimedRewardRows[0]?.unclaimedRewards).toBe("1.25");
	});

	it("distinguishes disconnected and failed states from unavailable queries", () => {
		testState.isConnected = false;
		expect(renderHook().status).toBe("idle");

		testState.isConnected = true;
		testState.referralQuery.error = new Error("offline");
		testState.referralQuery.fetchStatus = "paused";
		testState.referralQuery.isError = true;
		expect(renderHook().status).toBe("error");

		testState.referralQuery.error = null;
		testState.referralQuery.fetchStatus = "idle";
		testState.referralQuery.isError = false;
		testState.referralQuery.isSuccess = true;
		testState.referralQuery.data = null;
		expect(renderHook().status).toBe("error");
	});

	it("uses one bounded primary request and reuses persisted supporting queries", () => {
		renderHook();

		expect(testState.useInfo).toHaveBeenCalledWith(
			"referral",
			{ user: OWNER },
			expect.objectContaining({ requestTimeoutMs: 4_000, retry: false, staleTime: 30_000 }),
		);
		expect(testState.useInfo).toHaveBeenCalledWith(
			"userFees",
			{ user: OWNER },
			expect.objectContaining({ enabled: false, persist: true, staleTime: 30 * 60_000 }),
		);
		expect(testState.useInfo).toHaveBeenCalledWith(
			"spotMeta",
			undefined,
			expect.objectContaining({ enabled: false, persist: true, staleTime: 30 * 60_000 }),
		);
		expect(testState.accountLedgerEnabled).toBe(false);

		testState.referralQuery.data = createReferralData();
		claimHistoryEnabled = true;
		renderHook();

		expect(testState.useInfo).toHaveBeenCalledWith(
			"userFees",
			{ user: OWNER },
			expect.objectContaining({ enabled: true, persist: true }),
		);
		expect(testState.useInfo).toHaveBeenCalledWith(
			"spotMeta",
			undefined,
			expect.objectContaining({ enabled: true, persist: true }),
		);
		expect(testState.accountLedgerEnabled).toBe(true);
	});

	it("only retries the primary query after an explicit request", () => {
		const result = renderHook();

		result.retry();

		expect(testState.referralQuery.refetch).toHaveBeenCalledOnce();
	});
});
