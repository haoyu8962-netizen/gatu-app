import type { IRequestTransport } from "@nktkas/hyperliquid";
import {
	type AbstractWallet,
	getWalletAddress,
	getWalletChainId,
	type Signature,
	signUserSignedAction,
} from "@nktkas/hyperliquid/signing";
import { ZodError, z } from "zod";
import { WalletAccountMismatchError } from "./errors";
import type { HyperliquidEnv } from "./signing/types";

const LEGAL_RESTRICTIONS = ["n", "a", "o", "u"] as const;

export const LEGAL_STATUS_HTTP_TIMEOUT_MS = 10_000;
export const LEGAL_STATUS_STALE_TIME_MS = 30_000;
export const LEGAL_STATUS_ERROR_REASONS = [
	"aborted",
	"invalid_response",
	"network",
	"rate_limited",
	"request_rejected",
	"service_unavailable",
	"timeout",
	"unknown",
] as const;

export type LegalStatusErrorReason = (typeof LEGAL_STATUS_ERROR_REASONS)[number];
export type LegalActionCapability = "actions" | "referrals";
export type LegalActionBlockReason = "blocked" | "status_unavailable" | "terms_required";

function getLegalActionNotAllowedMessage(reason: LegalActionBlockReason): string {
	if (reason === "terms_required") return "Hyperliquid terms must be accepted before this action";
	if (reason === "blocked") return "This account is not permitted to perform this Hyperliquid action";
	return "Hyperliquid access could not be verified before this action";
}

export class LegalActionNotAllowedError extends Error {
	readonly reason: LegalActionBlockReason;
	readonly statusReason?: LegalStatusErrorReason;

	constructor(
		reason: LegalActionBlockReason,
		options: { cause?: unknown; statusReason?: LegalStatusErrorReason } = {},
	) {
		super(getLegalActionNotAllowedMessage(reason), options.cause === undefined ? undefined : { cause: options.cause });
		this.name = "LegalActionNotAllowedError";
		this.reason = reason;
		this.statusReason = options.statusReason;
	}
}

const LegalCheckResponseSchema = z.object({
	acceptedTerms: z.boolean(),
	userAllowed: z.boolean(),
	restrictions: z.string().optional(),
});

export type LegalRestriction = (typeof LEGAL_RESTRICTIONS)[number];

export interface LegalStatus {
	acceptedTerms: boolean;
	userAllowed: boolean;
	restriction: LegalRestriction | "unknown";
	canPerformActions: boolean;
	canViewOutcomeMarkets: boolean;
	canUseReferrals: boolean;
}

export interface AcceptTermsRequest {
	type: "acceptTerms2";
	user: `0x${string}`;
	time: number;
	signature: Signature;
	signatureChainId: `0x${string}`;
}

interface AcceptHyperliquidTermsOptions {
	wallet: AbstractWallet;
	transport: IRequestTransport;
	env: HyperliquidEnv;
	user: `0x${string}`;
	beforeSubmit: () => void | Promise<void>;
	time?: number;
}

const ACCEPT_TERMS_TYPES = {
	"Hyperliquid:AcceptTerms": [
		{ name: "hyperliquidChain", type: "string" },
		{ name: "time", type: "uint64" },
	],
} as const;

function isLegalRestriction(value: string | undefined): value is LegalRestriction {
	return value !== undefined && (LEGAL_RESTRICTIONS as readonly string[]).includes(value);
}

export function parseLegalStatus(value: unknown): LegalStatus {
	const response = LegalCheckResponseSchema.parse(value);
	const restriction = isLegalRestriction(response.restrictions) ? response.restrictions : "unknown";
	const restrictionKnown = restriction !== "unknown";

	return {
		acceptedTerms: response.acceptedTerms,
		userAllowed: response.userAllowed,
		restriction,
		canPerformActions: response.userAllowed && restrictionKnown && restriction !== "a",
		canViewOutcomeMarkets: response.userAllowed && restrictionKnown && restriction !== "o" && restriction !== "u",
		canUseReferrals: response.userAllowed && restrictionKnown && restriction !== "u",
	};
}

export function assertLegalStatusAllows(status: LegalStatus, capability: LegalActionCapability = "actions"): void {
	const capabilityAllowed = capability === "referrals" ? status.canUseReferrals : status.canPerformActions;
	if (!status.userAllowed || !capabilityAllowed) throw new LegalActionNotAllowedError("blocked");
	if (!status.acceptedTerms) throw new LegalActionNotAllowedError("terms_required");
}

/**
 * Terms acceptance is the one user action that must be allowed while
 * `acceptedTerms` is still false. All other access restrictions still fail
 * closed immediately before the signed request is submitted.
 */
export function assertLegalStatusAllowsTermsAcceptance(status: LegalStatus): void {
	if (!status.userAllowed || !status.canPerformActions) {
		throw new LegalActionNotAllowedError("blocked");
	}
}

export function classifyLegalStatusError(error: unknown): LegalStatusErrorReason {
	if (error instanceof ZodError) return "invalid_response";
	if (isAbortError(error)) return "aborted";

	const response = getHttpResponse(error);
	const status = response?.status;
	if (status === 408) return "timeout";
	if (status === 429) return "rate_limited";
	if (typeof status === "number" && status >= 500) return "service_unavailable";
	if (typeof status === "number" && status >= 400) return "request_rejected";

	const message = error instanceof Error ? error.message.toLowerCase() : "";
	if (message.includes("timed out") || message.includes("timeout")) return "timeout";
	if (message.includes("invalid json")) return "invalid_response";
	if (isNetworkError(error)) return "network";
	return "unknown";
}

export function shouldRetryLegalStatus(failureCount: number, error: unknown): boolean {
	const reason = classifyLegalStatusError(error);
	if (reason === "rate_limited") return failureCount < 1;
	if (reason === "network" || reason === "service_unavailable" || reason === "timeout") {
		return failureCount < 2;
	}
	return false;
}

export function getLegalStatusRetryDelayMs(
	failureCount: number,
	error: unknown,
	random: () => number = Math.random,
): number {
	const retryAfterMs = parseRetryAfterMs(getHttpResponse(error)?.headers.get("retry-after") ?? null);
	if (retryAfterMs !== null) return retryAfterMs;
	if (classifyLegalStatusError(error) === "rate_limited") return 10_000;

	const backoffMs = Math.min(1000 * 2 ** failureCount, 30_000);
	return Math.min(Math.round(backoffMs + backoffMs * 0.1 * random()), 30_000);
}

export function runWithLegalRequestTimeout<T>(request: (signal: AbortSignal) => Promise<T>): Promise<T> {
	const controller = new AbortController();
	return new Promise<T>((resolve, reject) => {
		const timeoutError = new DOMException("Legal request timed out", "TimeoutError");
		const timeoutId = setTimeout(() => {
			controller.abort(timeoutError);
			reject(timeoutError);
		}, LEGAL_STATUS_HTTP_TIMEOUT_MS);

		Promise.resolve()
			.then(() => request(controller.signal))
			.then(resolve, reject)
			.finally(() => clearTimeout(timeoutId));
	});
}

function getHttpResponse(error: unknown): Response | undefined {
	if (!isRecord(error) || !(error.response instanceof Response)) return undefined;
	return error.response;
}

function isAbortError(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	if (error.name === "AbortError") return true;
	return error.cause !== error && isAbortError(error.cause);
}

function isNetworkError(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	if (error.name === "NetworkError" || error instanceof TypeError) return true;
	if (error.name === "HttpRequestError" && !getHttpResponse(error)) return true;
	return error.cause !== error && isNetworkError(error.cause);
}

function parseRetryAfterMs(value: string | null, nowMs = Date.now()): number | null {
	if (!value) return null;
	const seconds = Number(value);
	if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 60_000);

	const retryAt = Date.parse(value);
	if (!Number.isFinite(retryAt)) return null;
	return Math.min(Math.max(retryAt - nowMs, 0), 60_000);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function acceptHyperliquidTerms({
	wallet,
	transport,
	env,
	user,
	beforeSubmit,
	time = Date.now(),
}: AcceptHyperliquidTermsOptions): Promise<AcceptTermsRequest> {
	const normalizedUser = user.toLowerCase() as `0x${string}`;
	const walletAddress = await getWalletAddress(wallet);
	if (walletAddress.toLowerCase() !== normalizedUser) throw new WalletAccountMismatchError();

	const signatureChainId = await getWalletChainId(wallet);
	const signature = await signUserSignedAction({
		wallet,
		action: {
			signatureChainId,
			hyperliquidChain: env,
			time,
		},
		types: ACCEPT_TERMS_TYPES,
	});
	const request: AcceptTermsRequest = {
		type: "acceptTerms2",
		user: normalizedUser,
		time,
		signature,
		signatureChainId,
	};

	await beforeSubmit();
	await runWithLegalRequestTimeout((signal) => transport.request<unknown>("info", request, signal));
	return request;
}
