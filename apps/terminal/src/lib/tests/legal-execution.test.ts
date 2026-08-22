// @vitest-environment jsdom

import { HttpRequestError } from "@nktkas/hyperliquid";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	classifyLegalStatusError,
	getLegalStatusRetryDelayMs,
	infoKey,
	shouldRetryLegalStatus,
	verifyLegalActionAllowed,
} from "@/lib/hyperliquid";

const OWNER = "0xABCDEF0000000000000000000000000000000000" as const;
const NORMALIZED_OWNER = OWNER.toLowerCase() as `0x${string}`;

describe("legal execution verification", () => {
	let queryClient: QueryClient;

	beforeEach(() => {
		queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
	});

	afterEach(() => {
		queryClient.clear();
		vi.restoreAllMocks();
	});

	it("checks and caches the exact normalized master owner within the legal TTL", async () => {
		const legalCheck = vi.fn().mockResolvedValue({ acceptedTerms: true, userAllowed: true, restrictions: "n" });
		const options = {
			queryClient,
			info: { legalCheck } as never,
			env: "Mainnet" as const,
			owner: OWNER,
		};

		await expect(verifyLegalActionAllowed(options)).resolves.toMatchObject({ canPerformActions: true });
		await expect(verifyLegalActionAllowed(options)).resolves.toMatchObject({ canPerformActions: true });

		expect(legalCheck).toHaveBeenCalledTimes(1);
		expect(legalCheck).toHaveBeenCalledWith({ user: NORMALIZED_OWNER }, expect.any(AbortSignal));
	});

	it("forces a fresh legal request for every funds-write preflight", async () => {
		const legalCheck = vi.fn().mockResolvedValue({ acceptedTerms: true, userAllowed: true, restrictions: "n" });
		const options = {
			queryClient,
			info: { legalCheck } as never,
			env: "Mainnet" as const,
			owner: OWNER,
			forceFresh: true,
		};

		await expect(verifyLegalActionAllowed(options)).resolves.toMatchObject({ canPerformActions: true });
		await expect(verifyLegalActionAllowed(options)).resolves.toMatchObject({ canPerformActions: true });

		expect(legalCheck).toHaveBeenCalledTimes(2);
	});

	it("retains a previous successful status when a forced preflight request fails", async () => {
		const queryKey = infoKey("legalCheck", { user: NORMALIZED_OWNER }, "Mainnet");
		const cached = { acceptedTerms: true, userAllowed: true, restrictions: "n" };
		queryClient.setQueryData(queryKey, cached);
		const deniedRequest = new HttpRequestError({ response: new Response(null, { status: 403 }) });

		await expect(
			verifyLegalActionAllowed({
				queryClient,
				info: { legalCheck: vi.fn().mockRejectedValue(deniedRequest) } as never,
				env: "Mainnet",
				owner: OWNER,
				forceFresh: true,
			}),
		).rejects.toMatchObject({ reason: "status_unavailable", statusReason: "request_rejected" });

		expect(queryClient.getQueryData(queryKey)).toEqual(cached);
	});

	it("does not authorize a write from fresh cached data after a failed refetch", async () => {
		const queryKey = infoKey("legalCheck", { user: NORMALIZED_OWNER }, "Mainnet");
		const cached = { acceptedTerms: true, userAllowed: true, restrictions: "n" };
		queryClient.setQueryData(queryKey, cached);
		const query = queryClient.getQueryCache().find({ queryKey, exact: true });
		if (!query) throw new Error("Legal query was not created");
		query.setState({ ...query.state, error: new TypeError("background network failure"), status: "error" });
		const legalCheck = vi.fn().mockResolvedValue(cached);

		await expect(
			verifyLegalActionAllowed({
				queryClient,
				info: { legalCheck } as never,
				env: "Mainnet",
				owner: OWNER,
			}),
		).resolves.toMatchObject({ canPerformActions: true });

		expect(legalCheck).toHaveBeenCalledOnce();
	});

	it("fails closed for missing terms, restrictions, invalid contracts, and offline state", async () => {
		const responses = [
			[{ acceptedTerms: false, userAllowed: true, restrictions: "n" }, "terms_required"],
			[{ acceptedTerms: false, userAllowed: false, restrictions: "a" }, "blocked"],
			[{ acceptedTerms: true, userAllowed: true, restrictions: "a" }, "blocked"],
			[{ acceptedTerms: true, userAllowed: true, restrictions: "future" }, "blocked"],
		];

		for (const [response, reason] of responses) {
			queryClient.clear();
			await expect(
				verifyLegalActionAllowed({
					queryClient,
					info: { legalCheck: vi.fn().mockResolvedValue(response) } as never,
					env: "Mainnet",
					owner: OWNER,
				}),
			).rejects.toMatchObject({ reason });
		}

		queryClient.clear();
		await expect(
			verifyLegalActionAllowed({
				queryClient,
				info: { legalCheck: vi.fn().mockResolvedValue({ acceptedTerms: "yes" }) } as never,
				env: "Mainnet",
				owner: OWNER,
			}),
		).rejects.toMatchObject({ reason: "status_unavailable", statusReason: "invalid_response" });

		Object.defineProperty(window.navigator, "onLine", { configurable: true, value: false });
		const offlineCheck = vi.fn();
		await expect(
			verifyLegalActionAllowed({
				queryClient,
				info: { legalCheck: offlineCheck } as never,
				env: "Mainnet",
				owner: OWNER,
			}),
		).rejects.toMatchObject({ reason: "status_unavailable", statusReason: "network" });
		expect(offlineCheck).not.toHaveBeenCalled();
	});

	it("applies the stricter referral capability without blocking ordinary actions", async () => {
		const legalCheck = vi.fn().mockResolvedValue({ acceptedTerms: true, userAllowed: true, restrictions: "u" });

		await expect(
			verifyLegalActionAllowed({
				queryClient,
				info: { legalCheck } as never,
				env: "Mainnet",
				owner: OWNER,
			}),
		).resolves.toMatchObject({ canPerformActions: true, canUseReferrals: false });
		await expect(
			verifyLegalActionAllowed({
				queryClient,
				info: { legalCheck } as never,
				env: "Mainnet",
				owner: OWNER,
				capability: "referrals",
			}),
		).rejects.toMatchObject({ reason: "blocked" });
	});
});

describe("legal status transport policy", () => {
	it("classifies failures without exposing response bodies", () => {
		expect(classifyLegalStatusError(new HttpRequestError({ detail: "Request timed out after 10000 ms" }))).toBe(
			"timeout",
		);
		expect(classifyLegalStatusError(new HttpRequestError({ response: new Response(null, { status: 429 }) }))).toBe(
			"rate_limited",
		);
		expect(classifyLegalStatusError(new HttpRequestError({ response: new Response(null, { status: 503 }) }))).toBe(
			"service_unavailable",
		);
		expect(classifyLegalStatusError(new HttpRequestError({ response: new Response(null, { status: 403 }) }))).toBe(
			"request_rejected",
		);
	});

	it("retries only transient classes with bounded Retry-After/backoff", () => {
		const rateLimited = new HttpRequestError({
			response: new Response(null, { status: 429, headers: { "retry-after": "2" } }),
		});
		const excessiveRetryAfter = new HttpRequestError({
			response: new Response(null, { status: 429, headers: { "retry-after": "3600" } }),
		});
		const rejected = new HttpRequestError({ response: new Response(null, { status: 400 }) });

		expect(shouldRetryLegalStatus(0, rateLimited)).toBe(true);
		expect(shouldRetryLegalStatus(1, rateLimited)).toBe(false);
		expect(shouldRetryLegalStatus(0, rejected)).toBe(false);
		expect(getLegalStatusRetryDelayMs(0, rateLimited, () => 0)).toBe(2000);
		expect(getLegalStatusRetryDelayMs(2, new TypeError("fetch failed"), () => 0)).toBe(4000);
		expect(getLegalStatusRetryDelayMs(20, new TypeError("fetch failed"), () => 0)).toBe(30_000);
		expect(getLegalStatusRetryDelayMs(20, new TypeError("fetch failed"), () => 1)).toBe(30_000);
		expect(getLegalStatusRetryDelayMs(0, excessiveRetryAfter, () => 0)).toBe(60_000);
	});
});
