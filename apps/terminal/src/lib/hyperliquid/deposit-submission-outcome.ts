import type { Hash } from "viem";

/**
 * Provider error codes (EIP-1193 and JSON-RPC 2.0) that a wallet returns before it broadcasts
 * anything: the request was rejected, unauthorized, unsupported or malformed. Disconnection
 * (4900, 4901) is not listed, because EIP-1193 only says the provider cannot answer, not that
 * the transaction it was asked to send never left; generic server errors (-32000, -32603) are
 * not listed either, because nodes use them for "already known" and timeouts too.
 */
const DEFINITIVE_WALLET_SUBMISSION_ERROR_CODES = new Set([4001, 4100, 4200, -32003, -32600, -32601, -32602]);
const MAX_CAUSE_DEPTH = 6;

export function getWalletErrorCode(error: unknown): number | undefined {
	let current: unknown = error;
	for (let depth = 0; depth < MAX_CAUSE_DEPTH && current && typeof current === "object"; depth += 1) {
		const code = (current as { code?: unknown }).code;
		if (typeof code === "number" && Number.isInteger(code)) return code;
		current = (current as { cause?: unknown }).cause;
	}
	return undefined;
}

export function isDefinitiveWalletSubmissionFailure(error: unknown, userRejected: boolean): boolean {
	if (userRejected) return true;
	const code = getWalletErrorCode(error);
	return code !== undefined && DEFINITIVE_WALLET_SUBMISSION_ERROR_CODES.has(code);
}

interface DepositSubmissionOutcomeInput {
	/** The sponsored flow handed its authorization to the bundler; no wallet rejection is possible there. */
	sponsoredSubmissionStarted: boolean;
	/** The external wallet was asked to broadcast the deposit transaction. */
	directSubmissionStarted: boolean;
	hash: Hash | undefined;
	error: unknown;
	userRejected: boolean;
}

/**
 * Whether a failed deposit attempt may still have reached the chain. A hash answers the question
 * on its own; without one, any submission the wallet was asked to broadcast counts as unknown
 * unless the wallet refused before broadcasting.
 */
export function isDepositSubmissionOutcomeUnknown({
	sponsoredSubmissionStarted,
	directSubmissionStarted,
	hash,
	error,
	userRejected,
}: DepositSubmissionOutcomeInput): boolean {
	if (hash) return false;
	if (sponsoredSubmissionStarted) return true;
	return directSubmissionStarted && !isDefinitiveWalletSubmissionFailure(error, userRejected);
}
