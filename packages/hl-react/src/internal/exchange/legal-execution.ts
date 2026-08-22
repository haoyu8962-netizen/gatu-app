import type { InfoClient } from "@nktkas/hyperliquid";
import type { QueryClient } from "@tanstack/react-query";
import {
	assertLegalStatusAllows,
	classifyLegalStatusError,
	getLegalStatusRetryDelayMs,
	LEGAL_STATUS_HTTP_TIMEOUT_MS,
	LEGAL_STATUS_STALE_TIME_MS,
	type LegalActionCapability,
	LegalActionNotAllowedError,
	type LegalStatus,
	parseLegalStatus,
	shouldRetryLegalStatus,
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
}

export function getExchangeLegalCapability(method: ExchangeMethod): LegalActionCapability {
	return REFERRAL_METHODS.has(method) ? "referrals" : "actions";
}

/**
 * Revalidates the exact master owner before a write. Cached success is reused
 * only inside the short legal TTL unless the caller requires a fresh funds-write
 * preflight; failed/paused requests and BFCache invalidation always revalidate.
 */
export async function verifyLegalActionAllowed({
	queryClient,
	info,
	env,
	owner,
	capability = "actions",
	forceFresh = false,
}: VerifyLegalActionOptions): Promise<LegalStatus> {
	if (typeof navigator !== "undefined" && navigator.onLine === false) {
		throw new LegalActionNotAllowedError("status_unavailable", { statusReason: "network" });
	}

	const normalizedOwner = owner.toLowerCase() as `0x${string}`;
	const params = { user: normalizedOwner };
	const queryKey = infoKey("legalCheck", params, env);
	const queryState = queryClient.getQueryState(queryKey);
	const mustRevalidate = queryState?.status === "error" || queryState?.fetchStatus === "paused";

	try {
		const response = await queryClient.fetchQuery({
			...infoQueryOptions(info, "legalCheck", params, env, {
				requestTimeoutMs: LEGAL_STATUS_HTTP_TIMEOUT_MS,
			}),
			networkMode: "online",
			retry: shouldRetryLegalStatus,
			retryDelay: getLegalStatusRetryDelayMs,
			staleTime: forceFresh || mustRevalidate ? 0 : LEGAL_STATUS_STALE_TIME_MS,
		});
		const status = parseLegalStatus(response);
		assertLegalStatusAllows(status, capability);
		return status;
	} catch (error) {
		if (error instanceof LegalActionNotAllowedError) throw error;
		throw new LegalActionNotAllowedError("status_unavailable", {
			cause: error,
			statusReason: classifyLegalStatusError(error),
		});
	}
}
