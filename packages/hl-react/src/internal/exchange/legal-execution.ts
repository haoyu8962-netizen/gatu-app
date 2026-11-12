import type { InfoClient } from "@nktkas/hyperliquid";
import type { QueryClient } from "@tanstack/react-query";
import {
	assertLegalStatusAllows,
	classifyLegalStatusError,
	LEGAL_STATUS_HTTP_TIMEOUT_MS,
	LEGAL_STATUS_STALE_TIME_MS,
	type LegalActionCapability,
	LegalActionNotAllowedError,
	type LegalStatus,
	parseLegalStatus,
} from "../../legal";
import { infoKey, infoQueryOptions } from "../../query/info";
import type { HyperliquidEnv } from "../../signing/types";
import type { ExchangeMethod } from "../../types/clients";

const REFERRAL_METHODS: ReadonlySet<ExchangeMethod> = new Set(["claimRewards", "registerReferrer", "setReferrer"]);

interface VerifyLegalActionOptions {
	queryClient: QueryClient;
	info: Pick<InfoClient, "legalCheck">;
	env: HyperliquidEnv;
	owner: `0x${string}`;
	capability?: LegalActionCapability;
	forceFresh?: boolean;
	/** Ends the wait with `status_unavailable` when the action it guards is abandoned. */
	signal?: AbortSignal;
}

export function getExchangeLegalCapability(method: ExchangeMethod): LegalActionCapability {
	return REFERRAL_METHODS.has(method) ? "referrals" : "actions";
}

/**
 * Revalidates the exact master owner before a write. Cached success is reused
 * only inside the short legal TTL unless the caller requires a fresh funds-write
 * preflight; failed/paused requests and BFCache invalidation always revalidate.
 * One attempt, never paused, bounded as a whole: TanStack's retryer pauses without limit while the
 * page is unfocused, and an action released after that pause would be signed long after the click
 * (ADR 0051). Passive status queries keep their retry policy.
 */
export async function verifyLegalActionAllowed({
	queryClient,
	info,
	env,
	owner,
	capability = "actions",
	forceFresh = false,
	signal,
}: VerifyLegalActionOptions): Promise<LegalStatus> {
	if (signal?.aborted) throw new LegalActionNotAllowedError("status_unavailable", { statusReason: "aborted" });
	if (typeof navigator !== "undefined" && navigator.onLine === false) {
		throw new LegalActionNotAllowedError("status_unavailable", { statusReason: "network" });
	}

	const normalizedOwner = owner.toLowerCase() as `0x${string}`;
	const params = { user: normalizedOwner };
	const queryKey = infoKey("legalCheck", params, env);
	const queryState = queryClient.getQueryState(queryKey);
	const mustRevalidate = queryState?.status === "error" || queryState?.fetchStatus === "paused";

	let timeout: ReturnType<typeof setTimeout> | undefined;
	try {
		const response = await Promise.race([
			queryClient.fetchQuery({
				...infoQueryOptions(info, "legalCheck", params, env, {
					requestTimeoutMs: LEGAL_STATUS_HTTP_TIMEOUT_MS,
				}),
				networkMode: "always",
				retry: false,
				staleTime: forceFresh || mustRevalidate ? 0 : LEGAL_STATUS_STALE_TIME_MS,
			}),
			new Promise<never>((_, reject) => {
				timeout = setTimeout(
					() => reject(new LegalActionNotAllowedError("status_unavailable", { statusReason: "timeout" })),
					LEGAL_STATUS_HTTP_TIMEOUT_MS,
				);
				signal?.addEventListener(
					"abort",
					() => reject(new LegalActionNotAllowedError("status_unavailable", { statusReason: "aborted" })),
					{ once: true },
				);
			}),
		]);
		const status = parseLegalStatus(response);
		assertLegalStatusAllows(status, capability);
		return status;
	} catch (error) {
		if (error instanceof LegalActionNotAllowedError) throw error;
		throw new LegalActionNotAllowedError("status_unavailable", {
			cause: error,
			statusReason: classifyLegalStatusError(error),
		});
	} finally {
		clearTimeout(timeout);
	}
}
