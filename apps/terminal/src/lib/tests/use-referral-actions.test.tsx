// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReferralActionStatusUnknownError, useReferralActions } from "@/hooks/trade/use-referral-actions";
import { classifyActionErrorOr, formatActionFailure } from "@/lib/errors/action-error";
import type { ReferralData } from "@/lib/trade/referral";
import type { Translate } from "@/lib/translate";

const OWNER = "0x1111111111111111111111111111111111111111" as const;
const OTHER_OWNER = "0x2222222222222222222222222222222222222222" as const;
const GEO_BLOCKED = msg`Referral actions are not available in your region. This referral request was not submitted.`;
const translate: Translate = (descriptor) => i18n._(descriptor);

const testState = vi.hoisted(() => ({
	claimRewards: vi.fn(),
	clientKey: "0x1111111111111111111111111111111111111111" as string,
	env: "Mainnet" as "Mainnet" | "Testnet",
	executionGuards: {} as Record<string, (() => void) | undefined>,
	geoDecision: {
		checkedAt: 0,
		country: "GB",
		status: "allowed",
		ttlMs: 60_000,
	} as
		| { checkedAt: number; country: string; status: "allowed"; ttlMs: number }
		| { checkedAt: number; country: string; reason: "jurisdiction" | "proxy"; status: "blocked" }
		| {
				checkedAt: number;
				reason: "invalid_response" | "missing_config" | "missing_ip" | "provider_error";
				status: "unavailable";
		  },
	legalRefetch: vi.fn(),
	registerReferrer: vi.fn(),
	setReferrer: vi.fn(),
	walletAddress: "0x1111111111111111111111111111111111111111" as string | undefined,
}));

vi.mock("@/lib/geo/get-referral-action-geo", () => ({
	getReferralActionGeo: vi.fn(async () => testState.geoDecision),
}));

vi.mock("@/lib/hyperliquid", async (importOriginal) => {
	const original = await importOriginal<typeof import("@/lib/hyperliquid")>();
	return {
		...original,
		useExchange: (method: string, options?: { executionGuard?: () => void }) => {
			testState.executionGuards[method] = options?.executionGuard;
			const mutation =
				method === "setReferrer"
					? testState.setReferrer
					: method === "registerReferrer"
						? testState.registerReferrer
						: testState.claimRewards;
			return {
				isPending: false,
				mutateAsync: async (input: unknown) => {
					options?.executionGuard?.();
					return mutation(input);
				},
			};
		},
		useHyperliquid: () => ({ clientKey: testState.clientKey, env: testState.env }),
		useLegalStatus: () => ({ refetch: testState.legalRefetch }),
	};
});

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({ hasWalletAccess: true, walletAddress: testState.walletAddress }),
}));

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((promiseResolve) => {
		resolve = promiseResolve;
	});
	return { promise, resolve };
}

function createReferralData(overrides: Partial<ReferralData> = {}): ReferralData {
	return {
		builderRewards: "0",
		claimedRewards: "0",
		cumVlm: "10000",
		referredBy: null,
		referrerState: { stage: "needToCreateCode" },
		rewardHistory: [],
		tokenToState: [
			[
				0,
				{
					builderRewards: "0",
					claimedRewards: "0",
					cumVlm: "10000",
					unclaimedRewards: "1.01",
				},
			],
		],
		unclaimedRewards: "1.01",
		...overrides,
	};
}

function createHttpRequestError(status?: number): Error {
	const error = new Error("Request failed");
	error.name = "HttpRequestError";
	if (status !== undefined) Object.assign(error, { response: { status } });
	return error;
}

let hookValue: ReturnType<typeof useReferralActions> | null = null;
let hookInput: Parameters<typeof useReferralActions>[0];

function Probe() {
	hookValue = useReferralActions(hookInput);
	return null;
}

describe("useReferralActions", () => {
	let container: HTMLDivElement;
	let queryClient: QueryClient;
	let root: Root;

	beforeEach(() => {
		vi.clearAllMocks();
		testState.clientKey = OWNER;
		testState.env = "Mainnet";
		testState.executionGuards = {};
		testState.geoDecision = {
			checkedAt: Date.now(),
			country: "GB",
			status: "allowed",
			ttlMs: 60_000,
		};
		testState.walletAddress = OWNER;
		testState.claimRewards.mockResolvedValue({ status: "ok" });
		testState.registerReferrer.mockResolvedValue({ status: "ok" });
		testState.setReferrer.mockResolvedValue({ status: "ok" });
		testState.legalRefetch.mockResolvedValue({
			data: { acceptedTerms: true, canUseReferrals: true, userAllowed: true },
			error: null,
		});
		container = document.createElement("div");
		document.body.appendChild(container);
		queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
		root = createRoot(container);
		hookValue = null;
	});

	afterEach(() => {
		act(() => root.unmount());
		vi.useRealTimers();
		queryClient.clear();
		container.remove();
		i18n.loadAndActivate({ locale: "en", messages: {} });
	});

	function renderHook(refetchReferral: () => Promise<ReferralData>) {
		hookInput = { refetchReferral, refreshAfterAction: vi.fn().mockResolvedValue(undefined) };
		renderProbe();
		if (!hookValue) throw new Error("Referral action hook was not captured");
		return hookValue;
	}

	function renderProbe() {
		act(() =>
			root.render(
				<QueryClientProvider client={queryClient}>
					<Probe />
				</QueryClientProvider>,
			),
		);
	}

	it("sets a referral code only after fresh legal and referral checks", async () => {
		const before = createReferralData();
		const after = createReferralData({ referredBy: { code: "SAIRN", referrer: OWNER } });
		const refetchReferral = vi.fn().mockResolvedValueOnce(before).mockResolvedValueOnce(after);
		const hook = renderHook(refetchReferral);

		await act(async () => {
			await expect(hook.submit("apply", "SAIRN")).resolves.toBeUndefined();
		});

		expect(testState.setReferrer).toHaveBeenCalledExactlyOnceWith({ code: "SAIRN" });
		expect(testState.registerReferrer).not.toHaveBeenCalled();
		expect(testState.claimRewards).not.toHaveBeenCalled();
		expect(testState.legalRefetch).toHaveBeenCalledOnce();
		expect(refetchReferral).toHaveBeenCalledTimes(2);
		expect(testState.executionGuards.setReferrer).toBeTypeOf("function");
	});

	it("creates a code through the Agent action without a builder authorization flow", async () => {
		const before = createReferralData();
		const after = createReferralData({
			referrerState: { stage: "ready", data: { code: "MYCODE", nReferrals: 0, referralStates: [] } },
		});
		const hook = renderHook(vi.fn().mockResolvedValueOnce(before).mockResolvedValueOnce(after));

		await act(async () => {
			await expect(hook.submit("create", "MYCODE")).resolves.toBeUndefined();
		});

		expect(testState.registerReferrer).toHaveBeenCalledExactlyOnceWith({ code: "MYCODE" });
	});

	it("claims all rewards with no request parameters and reconciles changed token state", async () => {
		const before = createReferralData();
		const beforeTokenState = before.tokenToState[0]?.[1];
		if (!beforeTokenState) throw new Error("Expected a referral reward token state");
		const after = createReferralData({
			claimedRewards: "1.01",
			tokenToState: [[0, { ...beforeTokenState, claimedRewards: "1.01", unclaimedRewards: "0" }]],
			unclaimedRewards: "0",
		});
		const hook = renderHook(vi.fn().mockResolvedValueOnce(before).mockResolvedValueOnce(after));

		await act(async () => {
			await expect(hook.submit("claim")).resolves.toBeUndefined();
		});

		expect(testState.claimRewards).toHaveBeenCalledExactlyOnceWith(undefined);
	});

	it("fails closed before any SDK action when referral access is unknown", async () => {
		testState.legalRefetch.mockResolvedValue({ data: undefined, error: new Error("offline") });
		const refetchReferral = vi.fn();
		const hook = renderHook(refetchReferral);

		await act(async () => {
			await expect(hook.submit("claim")).rejects.toThrow("Referral access could not be verified");
		});

		expect(refetchReferral).not.toHaveBeenCalled();
		expect(testState.claimRewards).not.toHaveBeenCalled();
	});

	it("fails closed when referral location eligibility is unavailable", async () => {
		testState.geoDecision = { checkedAt: Date.now(), reason: "provider_error", status: "unavailable" };
		const refetchReferral = vi.fn().mockResolvedValue(createReferralData());
		const hook = renderHook(refetchReferral);

		await act(async () => {
			await expect(hook.submit("apply", "SAIRN")).rejects.toThrow(
				"Unable to verify regional availability. This referral request was not submitted.",
			);
		});

		expect(refetchReferral).toHaveBeenCalledOnce();
		expect(testState.setReferrer).not.toHaveBeenCalled();
	});

	it("reports a blocked location in the language shown when the failure is displayed", async () => {
		testState.geoDecision = { checkedAt: Date.now(), country: "US", reason: "jurisdiction", status: "blocked" };
		const hook = renderHook(vi.fn().mockResolvedValue(createReferralData()));
		let rejection: unknown;

		await act(async () => {
			rejection = await hook.submit("apply", "SAIRN").catch((error: unknown) => error);
		});

		const failure = classifyActionErrorOr(rejection, msg`Referral request could not be completed.`);
		expect(failure).toEqual(GEO_BLOCKED);
		expect(formatActionFailure(failure, translate)).toBe(
			"Referral actions are not available in your region. This referral request was not submitted.",
		);
		i18n.loadAndActivate({
			locale: "zh",
			messages: { [GEO_BLOCKED.id]: "你所在的地区无法使用推荐操作，此推荐请求未提交。" },
		});
		expect(formatActionFailure(failure, translate)).toBe("你所在的地区无法使用推荐操作，此推荐请求未提交。");
		expect(testState.setReferrer).not.toHaveBeenCalled();
	});

	it("fails closed at the SDK boundary when the referral geo lease has expired", async () => {
		testState.geoDecision = {
			checkedAt: Date.now(),
			country: "GB",
			status: "allowed",
			ttlMs: 0,
		};
		const refetchReferral = vi.fn().mockResolvedValue(createReferralData());
		const hook = renderHook(refetchReferral);

		await act(async () => {
			await expect(hook.submit("apply", "SAIRN")).rejects.toThrow(
				"The regional availability check expired before signing. This referral request was not submitted.",
			);
		});

		expect(testState.setReferrer).not.toHaveBeenCalled();
	});

	it("uses a monotonic local lease when the wall clock is skewed", async () => {
		const wallClock = vi.spyOn(Date, "now").mockReturnValue(Number.MAX_SAFE_INTEGER);
		const before = createReferralData();
		const after = createReferralData({ referredBy: { code: "SAIRN", referrer: OWNER } });
		const hook = renderHook(vi.fn().mockResolvedValueOnce(before).mockResolvedValueOnce(after));

		await act(async () => {
			await expect(hook.submit("apply", "SAIRN")).resolves.toBeUndefined();
		});

		expect(testState.setReferrer).toHaveBeenCalledOnce();
		wallClock.mockRestore();
	});

	it("fails closed if the owner changes while fresh referral data is loading", async () => {
		const referral = deferred<ReferralData>();
		testState.legalRefetch.mockResolvedValue({
			data: { acceptedTerms: true, canUseReferrals: true, userAllowed: true },
			error: null,
		});
		const hook = renderHook(() => referral.promise);
		const submission = hook.submit("apply", "SAIRN");
		const rejection = expect(submission).rejects.toThrow("Wallet or network changed");

		await vi.waitFor(() => expect(testState.legalRefetch).toHaveBeenCalledOnce());
		await act(async () => {
			testState.clientKey = OTHER_OWNER;
			testState.walletAddress = OTHER_OWNER;
			renderProbe();
		});
		expect(hookValue?.identity.clientKey).toBe(OTHER_OWNER);
		await act(async () => {
			referral.resolve(createReferralData());
			await Promise.resolve();
		});

		await rejection;
		expect(testState.setReferrer).not.toHaveBeenCalled();
	});

	it("fails closed if the referral route unmounts before signing", async () => {
		const referral = deferred<ReferralData>();
		const hook = renderHook(() => referral.promise);
		const submission = hook.submit("apply", "SAIRN");
		const rejection = expect(submission).rejects.toThrow("Referral request is no longer active");

		await vi.waitFor(() => expect(testState.legalRefetch).toHaveBeenCalledOnce());
		act(() => root.render(<QueryClientProvider client={queryClient}>{null}</QueryClientProvider>));
		await act(async () => {
			referral.resolve(createReferralData());
			await Promise.resolve();
		});

		await rejection;
		expect(testState.setReferrer).not.toHaveBeenCalled();
	});

	it("reconciles an ambiguous transport error before reporting success", async () => {
		const before = createReferralData();
		const after = createReferralData({ referredBy: { code: "SAIRN", referrer: OWNER } });
		testState.setReferrer.mockRejectedValue(createHttpRequestError());
		const refetchReferral = vi.fn().mockResolvedValueOnce(before).mockResolvedValueOnce(after);
		const hook = renderHook(refetchReferral);

		await act(async () => {
			await expect(hook.submit("apply", "SAIRN")).resolves.toBeUndefined();
		});

		expect(testState.setReferrer).toHaveBeenCalledOnce();
		expect(refetchReferral).toHaveBeenCalledTimes(2);
	});

	it("does not reconcile or retry a deterministic protocol rejection", async () => {
		const before = createReferralData();
		const rejection = createHttpRequestError(400);
		testState.registerReferrer.mockRejectedValue(rejection);
		const refetchReferral = vi.fn().mockResolvedValue(before);
		const hook = renderHook(refetchReferral);

		await act(async () => {
			await expect(hook.submit("create", "MYCODE")).rejects.toBe(rejection);
		});

		expect(testState.registerReferrer).toHaveBeenCalledOnce();
		expect(refetchReferral).toHaveBeenCalledOnce();
	});

	it("reports an unknown final state instead of replaying a signed action", async () => {
		vi.useFakeTimers();
		const before = createReferralData();
		const refetchReferral = vi.fn().mockResolvedValue(before);
		const hook = renderHook(refetchReferral);

		const submission = hook.submit("create", "MYCODE");
		const rejection = expect(submission).rejects.toBeInstanceOf(ReferralActionStatusUnknownError);
		await act(async () => {
			await vi.runAllTimersAsync();
		});

		await rejection;
		expect(testState.registerReferrer).toHaveBeenCalledOnce();
		expect(refetchReferral).toHaveBeenCalledTimes(7);
	});
});
