import { t } from "@lingui/core/macro";
import Big from "big.js";
import type { Address } from "viem";

export interface PreTransferCheck {
	fee: string;
	isSanctioned: boolean;
	userExists: boolean;
	userHasSentTx: boolean;
}

const DECIMAL_PATTERN = /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
const HYPERCORE_SPOT_SYSTEM_ADDRESS_BASE = 0x2000000000000000000000000000000000000000n;
const MAX_EVM_ADDRESS = (1n << 160n) - 1n;

export class PreTransferCheckExecutionError extends Error {
	readonly reason: "changed" | "sanctioned" | "unavailable";

	constructor(reason: "changed" | "sanctioned" | "unavailable") {
		super(
			reason === "changed"
				? t`The account activation fee changed before signing. Review the updated fee and try again.`
				: reason === "sanctioned"
					? t`Withdrawals are unavailable for this address.`
					: t`Unable to verify withdrawal eligibility. Request was not submitted.`,
		);
		this.name = "PreTransferCheckExecutionError";
		this.reason = reason;
	}
}

/**
 * HyperCore exposes each spot token through the system address
 * `0x2000...0000 + tokenIndex`. The token index must always come from the
 * current spot metadata; silently falling back to a known index can check the
 * wrong destination when metadata is unavailable or malformed.
 */
export function getCanonicalSpotSystemAddress(spotMeta: unknown, tokenName: string): Address {
	if (!spotMeta || typeof spotMeta !== "object" || Array.isArray(spotMeta)) {
		throw new Error("Hyperliquid returned invalid spot metadata");
	}
	const tokens = (spotMeta as Record<string, unknown>).tokens;
	if (!Array.isArray(tokens)) throw new Error("Hyperliquid returned invalid spot metadata");

	const matches = tokens.filter((token) => {
		if (!token || typeof token !== "object" || Array.isArray(token)) return false;
		const record = token as Record<string, unknown>;
		return record.name === tokenName && record.isCanonical === true;
	});
	if (matches.length !== 1) throw new Error("Hyperliquid returned invalid spot metadata");

	const tokenIndex = (matches[0] as Record<string, unknown>).index;
	if (typeof tokenIndex !== "number" || !Number.isSafeInteger(tokenIndex) || tokenIndex < 0) {
		throw new Error("Hyperliquid returned invalid spot metadata");
	}

	const addressValue = HYPERCORE_SPOT_SYSTEM_ADDRESS_BASE + BigInt(tokenIndex);
	if (addressValue > MAX_EVM_ADDRESS) throw new Error("Hyperliquid returned invalid spot metadata");
	return `0x${addressValue.toString(16).padStart(40, "0")}` as Address;
}

export function normalizePreTransferCheck(value: unknown): PreTransferCheck {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error("Hyperliquid returned an invalid pre-transfer check");
	}
	const record = value as Record<string, unknown>;
	if (
		typeof record.fee !== "string" ||
		record.fee.length > 128 ||
		!DECIMAL_PATTERN.test(record.fee) ||
		typeof record.isSanctioned !== "boolean" ||
		typeof record.userExists !== "boolean" ||
		typeof record.userHasSentTx !== "boolean"
	) {
		throw new Error("Hyperliquid returned an invalid pre-transfer check");
	}
	return {
		fee: record.fee,
		isSanctioned: record.isSanctioned,
		userExists: record.userExists,
		userHasSentTx: record.userHasSentTx,
	};
}

export function assertPreTransferCheckMatchesReview(reviewedFee: string, current: PreTransferCheck): void {
	if (current.isSanctioned) throw new PreTransferCheckExecutionError("sanctioned");

	let feeMatches = false;
	try {
		feeMatches = DECIMAL_PATTERN.test(reviewedFee) && new Big(current.fee).eq(reviewedFee);
	} catch {
		throw new PreTransferCheckExecutionError("unavailable");
	}
	if (!feeMatches) throw new PreTransferCheckExecutionError("changed");
}
