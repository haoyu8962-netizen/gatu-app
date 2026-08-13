import Big from "big.js";
import type { FundsActionMatch } from "@/components/funds-action/funds-action-reconciliation";
import { USDC_ATOMIC_DECIMALS } from "@/components/funds-action/funds-amount";
import {
	deriveVaultOwnerView,
	isUnsignedDecimal,
	normalizeVaultAddress,
	parseVaultDetailsSnapshot,
	parseVaultEquitiesSnapshot,
	type VaultDetail,
	type VaultOwnerView,
} from "./domain/vaults";

export type VaultFundsAction = "deposit" | "withdraw";

export type VaultActionPreflightFailure =
	| "detailUnavailable"
	| "vaultMismatch"
	| "ownerMismatch"
	| "depositsClosed"
	| "balanceUnavailable"
	| "equityUnavailable"
	| "withdrawalLocked"
	| "withdrawalUnavailable"
	| "amountExceedsAvailable";

export type VaultActionPreflightResult =
	| {
			valid: true;
			detail: VaultDetail;
			owner: VaultOwnerView | null;
			availableAmount: string;
			availableAtomic: string;
	  }
	| { valid: false; error: VaultActionPreflightFailure };

export interface VerifyVaultActionPreflightInput {
	action: VaultFundsAction;
	vaultAddress: `0x${string}`;
	ownerAddress: `0x${string}`;
	amountAtomic: string;
	detailSnapshot: unknown;
	equitiesSnapshot: unknown;
	clearinghouseSnapshot: unknown;
	now: number;
}

/**
 * Verifies the authoritative snapshots immediately before a Vault signature.
 * Every decimal comparison stays in Big.js and server number ceilings are
 * conservatively floored to the six atomic USDC decimals accepted by the SDK.
 */
export function verifyVaultActionPreflight({
	action,
	vaultAddress,
	ownerAddress,
	amountAtomic,
	detailSnapshot,
	equitiesSnapshot,
	clearinghouseSnapshot,
	now,
}: VerifyVaultActionPreflightInput): VaultActionPreflightResult {
	const parsedDetail = parseVaultDetailsSnapshot(detailSnapshot);
	if (parsedDetail.status !== "valid") return { valid: false, error: "detailUnavailable" };
	const detail = parsedDetail.detail;
	if (normalizeVaultAddress(detail.vaultAddress) !== normalizeVaultAddress(vaultAddress)) {
		return { valid: false, error: "vaultMismatch" };
	}
	if (
		detail.followerState &&
		normalizeVaultAddress(detail.followerState.user) !== normalizeVaultAddress(ownerAddress)
	) {
		return { valid: false, error: "ownerMismatch" };
	}

	if (action === "deposit") {
		if (detail.isClosed || !detail.allowDeposits) return { valid: false, error: "depositsClosed" };
		const availableAmount = parseClearinghouseWithdrawable(clearinghouseSnapshot);
		if (availableAmount === null) return { valid: false, error: "balanceUnavailable" };
		const availableAtomic = floorDecimalStringToAtomic(availableAmount, USDC_ATOMIC_DECIMALS);
		if (availableAtomic === null) return { valid: false, error: "balanceUnavailable" };
		if (!atomicAmountFits(amountAtomic, availableAtomic)) {
			return { valid: false, error: "amountExceedsAvailable" };
		}
		return { valid: true, detail, owner: null, availableAmount, availableAtomic };
	}

	const parsedEquities = parseVaultEquitiesSnapshot(equitiesSnapshot);
	if (parsedEquities.status !== "valid") return { valid: false, error: "equityUnavailable" };
	const targetEquities = parsedEquities.equities.filter(
		(equity) => normalizeVaultAddress(equity.vaultAddress) === normalizeVaultAddress(vaultAddress),
	);
	if (targetEquities.length !== 1) return { valid: false, error: "equityUnavailable" };
	const owner = deriveVaultOwnerView({
		detail,
		account: { status: "ready", equities: parsedEquities.equities },
		now,
	});
	if (owner.status !== "ready") return { valid: false, error: "equityUnavailable" };
	if (owner.isLocked) return { valid: false, error: "withdrawalLocked" };
	if (!owner.canWithdraw) return { valid: false, error: "withdrawalUnavailable" };
	const availableAtomic = floorDecimalStringToAtomic(owner.maxWithdrawable, USDC_ATOMIC_DECIMALS);
	if (availableAtomic === null) return { valid: false, error: "withdrawalUnavailable" };
	if (!atomicAmountFits(amountAtomic, availableAtomic)) {
		return { valid: false, error: "amountExceedsAvailable" };
	}
	return {
		valid: true,
		detail,
		owner,
		availableAmount: owner.maxWithdrawable,
		availableAtomic,
	};
}

export function parseClearinghouseWithdrawable(value: unknown): string | null {
	if (!isRecord(value) || !isUnsignedDecimal(value.withdrawable)) return null;
	return value.withdrawable;
}

export function floorDecimalStringToAtomic(value: string, decimals: number): string | null {
	if (!isUnsignedDecimal(value) || !Number.isSafeInteger(decimals) || decimals < 0) return null;
	try {
		return new Big(value).times(new Big(10).pow(decimals)).round(0, Big.roundDown).toFixed(0);
	} catch {
		return null;
	}
}

export function atomicAmountFits(amountAtomic: string, availableAtomic: string): boolean {
	if (!/^\d+$/.test(amountAtomic) || !/^\d+$/.test(availableAtomic)) return false;
	try {
		return new Big(amountAtomic).gt(0) && new Big(amountAtomic).lte(availableAtomic);
	} catch {
		return false;
	}
}

export type VaultMutationFailureKind = "rejected" | "deterministic" | "ambiguous";

/** An application-side guard rejected the request before the SDK dispatch boundary. */
export class VaultLocalPreDispatchError extends Error {
	constructor() {
		super("Vault request was cancelled before dispatch");
		this.name = "VaultLocalPreDispatchError";
	}
}

export function classifyVaultMutationFailure(error: unknown): VaultMutationFailureKind {
	if (isUserRejectedRequest(error)) return "rejected";
	if (
		error instanceof Error &&
		(error.name === "ApiRequestError" ||
			error.name === "ValidationError" ||
			error.name === "VaultLocalPreDispatchError")
	) {
		return "deterministic";
	}
	return "ambiguous";
}

export function formatVaultOperationReference(input: {
	env: string;
	owner: string;
	method: "vaultTransfer";
	target: string;
	direction: VaultFundsAction;
	atomicAmount: string;
	startedAt: number;
	identityEpoch: string;
}): string {
	return [
		input.env,
		input.owner.toLowerCase(),
		input.method,
		input.target.toLowerCase(),
		input.direction,
		input.atomicAmount,
		String(input.startedAt),
		input.identityEpoch,
	].join("|");
}

export interface VaultActionReceipt extends FundsActionMatch {
	operationReference: string;
}

function isUserRejectedRequest(error: unknown): boolean {
	if (!isRecord(error)) return false;
	return (
		error.code === 4001 ||
		(typeof error.message === "string" &&
			/user rejected|user denied|rejected the request in (?:the )?wallet|request rejected by (?:the )?user/i.test(
				error.message,
			))
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
