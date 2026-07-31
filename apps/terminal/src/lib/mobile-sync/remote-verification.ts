import {
	type ExpectedMobileAgent,
	type ExpectedMobileAgentVerification,
	verifyExpectedMobileAgent,
} from "@gatu/hl-react/signing/mobile-agent";
import type { ExtraAgentsResponse } from "@nktkas/hyperliquid";

export const MOBILE_AGENT_REMOTE_VERIFICATION_DELAYS_MS = [0, 250, 500, 1_000, 2_000] as const;

export type MobileAgentRemoteVerificationResult =
	| {
			status: "approved";
			attempts: number;
			remoteAgent: ExtraAgentsResponse[number];
	  }
	| {
			status: "unverified";
			attempts: number;
			hadNetworkError: boolean;
			lastVerification: ExpectedMobileAgentVerification;
	  }
	| {
			status: "aborted";
			attempts: number;
	  };

export interface WaitForExpectedMobileAgentOptions {
	signal?: AbortSignal;
	delaysMs?: readonly number[];
	now?: () => number;
	maxElapsedMs?: number;
	requestTimeoutMs?: number;
	monotonicNow?: () => number;
	/**
	 * Optional reconciliation condition evaluated only after the exact expected
	 * Agent is approved. Revocation uses this to require every old address to be
	 * absent before declaring success.
	 */
	acceptExtraAgents?: (extraAgents: ExtraAgentsResponse) => boolean;
}

export type LoadExtraAgents = (signal: AbortSignal) => Promise<ExtraAgentsResponse | undefined>;

/**
 * Reconciles an expected Mobile Agent against Hyperliquid's eventually
 * consistent `extraAgents` response. Network failures and stale reads are
 * retried inside a small, bounded window; every attempt receives its own
 * AbortSignal so a timeout or caller cancellation also stops the HTTP request.
 * No error payload is retained.
 */
export async function waitForExpectedMobileAgent(
	loadExtraAgents: LoadExtraAgents,
	expected: ExpectedMobileAgent,
	options: WaitForExpectedMobileAgentOptions = {},
): Promise<MobileAgentRemoteVerificationResult> {
	const delaysMs = options.delaysMs ?? MOBILE_AGENT_REMOTE_VERIFICATION_DELAYS_MS;
	const now = options.now ?? Date.now;
	const monotonicNow = options.monotonicNow ?? getMonotonicNow;
	const maxElapsedMs = options.maxElapsedMs ?? 5_000;
	const requestTimeoutMs = options.requestTimeoutMs ?? 1_000;
	const startedAtMs = monotonicNow();
	let attempts = 0;
	let hadNetworkError = false;
	let lastVerification: ExpectedMobileAgentVerification = { status: "remote_unknown" };

	for (const delayMs of delaysMs) {
		if (options.signal?.aborted) return { status: "aborted", attempts };
		const remainingBeforeDelay = maxElapsedMs - (monotonicNow() - startedAtMs);
		if (remainingBeforeDelay <= 0 || delayMs >= remainingBeforeDelay) break;
		if (delayMs > 0 && !(await waitForDelay(delayMs, options.signal))) {
			return { status: "aborted", attempts };
		}

		const remainingForRequest = maxElapsedMs - (monotonicNow() - startedAtMs);
		if (remainingForRequest <= 0) break;
		attempts++;
		const loadResult = await loadExtraAgentsWithControls(
			loadExtraAgents,
			options.signal,
			Math.min(requestTimeoutMs, remainingForRequest),
		);
		if (loadResult.status === "aborted") return { status: "aborted", attempts };
		if (loadResult.status === "network_error") {
			hadNetworkError = true;
			continue;
		}

		const extraAgents = loadResult.extraAgents;
		lastVerification = verifyExpectedMobileAgent(extraAgents, expected, now());
		if (
			lastVerification.status === "approved" &&
			(!extraAgents || !options.acceptExtraAgents || options.acceptExtraAgents(extraAgents))
		) {
			return {
				status: "approved",
				attempts,
				remoteAgent: lastVerification.remoteAgent,
			};
		}
	}

	return {
		status: "unverified",
		attempts,
		hadNetworkError,
		lastVerification,
	};
}

function waitForDelay(delayMs: number, signal?: AbortSignal): Promise<boolean> {
	if (signal?.aborted) return Promise.resolve(false);

	return new Promise((resolve) => {
		const timeoutId = globalThis.setTimeout(() => {
			signal?.removeEventListener("abort", handleAbort);
			resolve(true);
		}, delayMs);

		function handleAbort() {
			globalThis.clearTimeout(timeoutId);
			signal?.removeEventListener("abort", handleAbort);
			resolve(false);
		}

		signal?.addEventListener("abort", handleAbort, { once: true });
	});
}

type LoadExtraAgentsResult =
	| { status: "loaded"; extraAgents: ExtraAgentsResponse | undefined }
	| { status: "network_error" }
	| { status: "aborted" };

function loadExtraAgentsWithControls(
	loadExtraAgents: LoadExtraAgents,
	signal: AbortSignal | undefined,
	timeoutMs: number,
): Promise<LoadExtraAgentsResult> {
	if (signal?.aborted) return Promise.resolve({ status: "aborted" });

	return new Promise((resolve) => {
		let settled = false;
		const attemptController = new AbortController();
		const timeoutId = globalThis.setTimeout(handleTimeout, Math.max(1, timeoutMs));

		function finish(result: LoadExtraAgentsResult) {
			if (settled) return;
			settled = true;
			globalThis.clearTimeout(timeoutId);
			signal?.removeEventListener("abort", handleAbort);
			resolve(result);
		}

		function handleAbort() {
			attemptController.abort();
			finish({ status: "aborted" });
		}

		function handleTimeout() {
			attemptController.abort();
			finish({ status: "network_error" });
		}

		signal?.addEventListener("abort", handleAbort, { once: true });
		Promise.resolve()
			.then(() => loadExtraAgents(attemptController.signal))
			.then(
				(extraAgents) => finish({ status: "loaded", extraAgents }),
				() => finish({ status: "network_error" }),
			);
	});
}

function getMonotonicNow(): number {
	return typeof performance === "undefined" ? Date.now() : performance.now();
}
