import Big from "big.js";
import type { FundsActionHistoryBaseline, FundsActionReference, FundsActionStateBaseline } from "./funds-action-marker";

// Hyperliquid accepts signing nonces from (block time - 2 days, block time + 1 day).
// Anchoring every read to this persisted lookback tolerates an accepted client
// clock that is ahead of the eventual ledger event while still bounding history.
export const FUNDS_ACTION_HISTORY_LOOKBACK_MS = 2 * 24 * 60 * 60 * 1_000;

export function getFundsActionHistoryStartTime(startedAt: number): number {
	return Math.max(0, startedAt - FUNDS_ACTION_HISTORY_LOOKBACK_MS);
}

export interface FundsActionMatch {
	hash: string;
	time: number;
	finalAmount?: string;
	commission?: string;
	closingCost?: string;
}

function equalDecimal(left: unknown, right: string): boolean {
	if (typeof left !== "string") return false;
	try {
		return new Big(left).eq(right);
	} catch {
		return false;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

function getHistoryEntry(value: unknown): { time: number; hash: string; delta: Record<string, unknown> } | null {
	if (
		!isRecord(value) ||
		typeof value.time !== "number" ||
		!Number.isSafeInteger(value.time) ||
		value.time < 0 ||
		typeof value.hash !== "string" ||
		!/^0x[0-9a-fA-F]{64}$/u.test(value.hash) ||
		!isRecord(value.delta)
	) {
		return null;
	}
	return { time: value.time as number, hash: value.hash, delta: value.delta };
}

/**
 * Captures the complete hash set returned by the fresh pre-sign history read.
 * Empty history is valid evidence; malformed or partial history fails closed.
 */
export function createFundsActionHistoryBaseline(
	snapshot: unknown,
	observedAt = Date.now(),
): FundsActionHistoryBaseline | null {
	if (!Array.isArray(snapshot) || !Number.isSafeInteger(observedAt) || observedAt < 0) return null;
	const hashes = new Set<string>();
	for (const raw of snapshot) {
		const entry = getHistoryEntry(raw);
		if (!entry) return null;
		hashes.add(entry.hash.toLowerCase());
	}
	return { version: 1, observedAt, hashes: [...hashes].sort() };
}

function getFreshHistoryEntries(marker: FundsActionReference, snapshot: unknown) {
	if (!marker.historyBaseline || !Array.isArray(snapshot)) return null;
	const baselineHashes = new Set(marker.historyBaseline.hashes.map((hash) => hash.toLowerCase()));
	const entries: Array<{ time: number; hash: string; delta: Record<string, unknown> }> = [];
	for (const raw of snapshot) {
		const entry = getHistoryEntry(raw);
		if (!entry) return null;
		if (!baselineHashes.has(entry.hash.toLowerCase())) entries.push(entry);
	}
	return entries;
}

export function reconcileVaultFundsAction(marker: FundsActionReference, snapshot: unknown): FundsActionMatch | null {
	if (marker.method !== "vaultTransfer") return null;
	const entries = getFreshHistoryEntries(marker, snapshot);
	if (!entries) return null;
	const target = marker.target.toLocaleLowerCase();
	const owner = marker.owner.toLocaleLowerCase();
	const matches: FundsActionMatch[] = [];

	for (const entry of entries) {
		if (marker.direction === "deposit" && entry.delta.type === "vaultDeposit") {
			if (
				typeof entry.delta.vault === "string" &&
				entry.delta.vault.toLocaleLowerCase() === target &&
				equalDecimal(entry.delta.usdc, marker.displayAmount)
			) {
				matches.push({ hash: entry.hash, time: entry.time, finalAmount: entry.delta.usdc as string });
			}
		}
		if (marker.direction === "withdraw" && entry.delta.type === "vaultWithdraw") {
			if (
				typeof entry.delta.vault === "string" &&
				entry.delta.vault.toLocaleLowerCase() === target &&
				typeof entry.delta.user === "string" &&
				entry.delta.user.toLocaleLowerCase() === owner &&
				equalDecimal(entry.delta.requestedUsd, marker.displayAmount)
			) {
				matches.push({
					hash: entry.hash,
					time: entry.time,
					finalAmount: typeof entry.delta.netWithdrawnUsd === "string" ? entry.delta.netWithdrawnUsd : undefined,
					commission: typeof entry.delta.commission === "string" ? entry.delta.commission : undefined,
					closingCost: typeof entry.delta.closingCost === "string" ? entry.delta.closingCost : undefined,
				});
			}
		}
	}
	return matches.length === 1 ? (matches[0] ?? null) : null;
}

export function reconcileStakingFundsAction(marker: FundsActionReference, snapshot: unknown): FundsActionMatch | null {
	if (marker.method === "vaultTransfer") return null;
	const entries = getFreshHistoryEntries(marker, snapshot);
	if (!entries) return null;
	const matches: FundsActionMatch[] = [];
	for (const entry of entries) {
		if (marker.method === "cDeposit") {
			const deposit = entry.delta.cDeposit;
			if (isRecord(deposit) && equalDecimal(deposit.amount, marker.displayAmount)) {
				matches.push({ hash: entry.hash, time: entry.time, finalAmount: deposit.amount as string });
			}
		}

		if (marker.method === "cWithdraw") {
			const withdrawal = entry.delta.withdrawal;
			if (
				isRecord(withdrawal) &&
				withdrawal.phase === "initiated" &&
				equalDecimal(withdrawal.amount, marker.displayAmount)
			) {
				matches.push({ hash: entry.hash, time: entry.time, finalAmount: withdrawal.amount as string });
			}
		}

		if (marker.method === "tokenDelegate") {
			const delegation = entry.delta.delegate;
			if (
				isRecord(delegation) &&
				typeof delegation.validator === "string" &&
				delegation.validator.toLocaleLowerCase() === marker.target.toLocaleLowerCase() &&
				delegation.isUndelegate === (marker.direction === "undelegate") &&
				equalDecimal(delegation.amount, marker.displayAmount)
			) {
				matches.push({ hash: entry.hash, time: entry.time, finalAmount: delegation.amount as string });
			}
		}
	}
	return matches.length === 1 ? (matches[0] ?? null) : null;
}

export interface VaultReconciliationState {
	detailValid: boolean;
	vaultEquity: string;
	withdrawable: string;
}

export interface StakingReconciliationState {
	spotAvailable: string;
	delegated: string;
	undelegated: string;
	totalPendingWithdrawal: string;
	nPendingWithdrawals: number;
	targetDelegation: string;
}

function compareUnsigned(left: string, right: string): -1 | 0 | 1 | null {
	try {
		const comparison = new Big(left).cmp(new Big(right));
		return comparison < 0 ? -1 : comparison > 0 ? 1 : 0;
	} catch {
		return null;
	}
}

function getBaseline<TKind extends FundsActionStateBaseline["kind"]>(
	marker: FundsActionReference,
	kind: TKind,
): Extract<FundsActionStateBaseline, { kind: TKind }> | null {
	return marker.stateBaseline?.kind === kind
		? (marker.stateBaseline as Extract<FundsActionStateBaseline, { kind: TKind }>)
		: null;
}

/**
 * The exact ledger event remains the primary truth. This secondary check proves
 * that all authoritative snapshots parsed and at least one relevant balance
 * moved in the requested direction before the marker can be cleared.
 */
export function verifyVaultReconciliationState(
	marker: FundsActionReference,
	state: VaultReconciliationState | null,
): boolean {
	const baseline = getBaseline(marker, "vault");
	if (!baseline || !state?.detailValid) return false;
	const equity = compareUnsigned(state.vaultEquity, baseline.vaultEquity);
	const withdrawable = compareUnsigned(state.withdrawable, baseline.withdrawable);
	if (equity === null || withdrawable === null) return false;
	return marker.direction === "deposit"
		? equity === 1 || withdrawable === -1
		: marker.direction === "withdraw" && (equity === -1 || withdrawable === 1);
}

export function verifyStakingReconciliationState(
	marker: FundsActionReference,
	state: StakingReconciliationState | null,
): boolean {
	const baseline = getBaseline(marker, "staking");
	if (!baseline || !state) return false;
	const spot = compareUnsigned(state.spotAvailable, baseline.spotAvailable);
	const delegated = compareUnsigned(state.delegated, baseline.delegated);
	const undelegated = compareUnsigned(state.undelegated, baseline.undelegated);
	const pending = compareUnsigned(state.totalPendingWithdrawal, baseline.totalPendingWithdrawal);
	const target = compareUnsigned(state.targetDelegation, baseline.targetDelegation);
	if ([spot, delegated, undelegated, pending, target].some((value) => value === null)) return false;

	if (marker.method === "cDeposit") return spot === -1 || undelegated === 1;
	if (marker.method === "cWithdraw") {
		return undelegated === -1 || pending === 1 || state.nPendingWithdrawals > baseline.nPendingWithdrawals;
	}
	if (marker.direction === "delegate") return undelegated === -1 || delegated === 1 || target === 1;
	return marker.direction === "undelegate" && (undelegated === 1 || delegated === -1 || target === -1);
}
