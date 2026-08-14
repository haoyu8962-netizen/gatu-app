import { describe, expect, it } from "vitest";
import { createFundsActionReference } from "@/components/funds-action/funds-action-marker";
import {
	createFundsActionHistoryBaseline,
	FUNDS_ACTION_HISTORY_LOOKBACK_MS,
	getFundsActionHistoryStartTime,
	reconcileStakingFundsAction,
	reconcileVaultFundsAction,
	verifyStakingReconciliationState,
	verifyVaultReconciliationState,
} from "@/components/funds-action/funds-action-reconciliation";

const OWNER = "0x1111111111111111111111111111111111111111" as const;
const TARGET = "0x2222222222222222222222222222222222222222";
const HASH = `0x${"a".repeat(64)}`;
const OLD_HASH = `0x${"b".repeat(64)}`;
const SECOND_HASH = `0x${"c".repeat(64)}`;

function vaultReference(direction: "deposit" | "withdraw") {
	return createFundsActionReference({
		env: "Mainnet",
		owner: OWNER,
		method: "vaultTransfer",
		target: TARGET,
		direction,
		displayAmount: "12.5",
		atomicAmount: "12500000",
		atomicDecimals: 6,
		asset: "USDC",
		startedAt: 1000,
		identityEpoch: "epoch",
		historyBaseline: { version: 1, observedAt: 1000, hashes: [OLD_HASH] },
		stateBaseline: { kind: "vault", vaultEquity: "10", withdrawable: "100" },
	});
}

function stakingReference(
	method: "cDeposit" | "cWithdraw" | "tokenDelegate",
	direction: "deposit" | "withdraw" | "delegate" | "undelegate",
) {
	return createFundsActionReference({
		env: "Mainnet",
		owner: OWNER,
		method,
		target: method === "tokenDelegate" ? TARGET : "staking",
		direction,
		displayAmount: "2.5",
		atomicAmount: "250000000",
		atomicDecimals: 8,
		asset: "HYPE",
		startedAt: 1000,
		identityEpoch: "epoch",
		historyBaseline: { version: 1, observedAt: 1000, hashes: [OLD_HASH] },
		stateBaseline: {
			kind: "staking",
			spotAvailable: "20",
			delegated: "5",
			undelegated: "10",
			totalPendingWithdrawal: "1",
			nPendingWithdrawals: 1,
			targetDelegation: "2",
		},
	});
}

describe("funds action reconciliation", () => {
	it("matches an exact new Vault deposit and rejects baseline or non-exact events", () => {
		const marker = vaultReference("deposit");
		expect(
			reconcileVaultFundsAction(marker, [
				{ time: 999, hash: OLD_HASH, delta: { type: "vaultDeposit", vault: TARGET, usdc: "12.5" } },
				{ time: 1001, hash: HASH, delta: { type: "vaultDeposit", vault: TARGET, usdc: "12.50" } },
			]),
		).toMatchObject({ hash: HASH, finalAmount: "12.50" });
		expect(
			reconcileVaultFundsAction(marker, [
				{ time: 1001, hash: HASH, delta: { type: "vaultDeposit", vault: TARGET, usdc: "12.6" } },
			]),
		).toBeNull();
	});

	it("uses the fresh hash baseline instead of the client clock", () => {
		const futureClockMarker = vaultReference("deposit");
		expect(
			reconcileVaultFundsAction(futureClockMarker, [
				{ time: 1, hash: HASH, delta: { type: "vaultDeposit", vault: TARGET, usdc: "12.5" } },
			]),
		).not.toBeNull();
		expect(
			reconcileVaultFundsAction(futureClockMarker, [
				{ time: 5000, hash: OLD_HASH, delta: { type: "vaultDeposit", vault: TARGET, usdc: "12.5" } },
			]),
		).toBeNull();
	});

	it("matches Vault withdrawal owner, request amount, and final accounting", () => {
		const marker = vaultReference("withdraw");
		expect(
			reconcileVaultFundsAction(marker, [
				{
					time: 1001,
					hash: HASH,
					delta: {
						type: "vaultWithdraw",
						vault: TARGET,
						user: OWNER,
						requestedUsd: "12.5",
						netWithdrawnUsd: "12.1",
						commission: "0.3",
						closingCost: "0.1",
					},
				},
			]),
		).toMatchObject({ finalAmount: "12.1", commission: "0.3", closingCost: "0.1" });
	});

	it("fails closed when multiple exact new history candidates could explain one marker", () => {
		expect(
			reconcileVaultFundsAction(vaultReference("deposit"), [
				{ time: 1001, hash: HASH, delta: { type: "vaultDeposit", vault: TARGET, usdc: "12.5" } },
				{ time: 1002, hash: SECOND_HASH, delta: { type: "vaultDeposit", vault: TARGET, usdc: "12.50" } },
			]),
		).toBeNull();
		expect(
			reconcileStakingFundsAction(stakingReference("cDeposit", "deposit"), [
				{ time: 1001, hash: HASH, delta: { cDeposit: { amount: "2.5" } } },
				{ time: 1002, hash: SECOND_HASH, delta: { cDeposit: { amount: "2.50" } } },
			]),
		).toBeNull();
		expect(
			reconcileVaultFundsAction(vaultReference("withdraw"), [
				{ time: 1001, hash: HASH, delta: { type: "vaultWithdraw", vault: TARGET, user: OWNER, requestedUsd: "12.5" } },
				{
					time: 1002,
					hash: SECOND_HASH,
					delta: { type: "vaultWithdraw", vault: TARGET, user: OWNER, requestedUsd: "12.50" },
				},
			]),
		).toBeNull();
		expect(
			reconcileStakingFundsAction(stakingReference("cWithdraw", "withdraw"), [
				{ time: 1001, hash: HASH, delta: { withdrawal: { amount: "2.5", phase: "initiated" } } },
				{ time: 1002, hash: SECOND_HASH, delta: { withdrawal: { amount: "2.50", phase: "initiated" } } },
			]),
		).toBeNull();
		expect(
			reconcileStakingFundsAction(stakingReference("tokenDelegate", "delegate"), [
				{ time: 1001, hash: HASH, delta: { delegate: { validator: TARGET, amount: "2.5", isUndelegate: false } } },
				{
					time: 1002,
					hash: SECOND_HASH,
					delta: {
						delegate: { validator: TARGET.toUpperCase().replace("0X", "0x"), amount: "2.50", isUndelegate: false },
					},
				},
			]),
		).toBeNull();
	});

	it("anchors history reads two days before the marker start and clamps at zero", () => {
		expect(FUNDS_ACTION_HISTORY_LOOKBACK_MS).toBe(172_800_000);
		expect(getFundsActionHistoryStartTime(1_700_000_000_000)).toBe(1_700_000_000_000 - 172_800_000);
		expect(getFundsActionHistoryStartTime(172_800_000)).toBe(0);
		expect(getFundsActionHistoryStartTime(1_000)).toBe(0);
	});

	it("matches staking deposit, withdrawal initiation, delegation, and undelegation exactly", () => {
		expect(
			reconcileStakingFundsAction(stakingReference("cDeposit", "deposit"), [
				{ time: 1001, hash: HASH, delta: { cDeposit: { amount: "2.5" } } },
			]),
		).not.toBeNull();
		expect(
			reconcileStakingFundsAction(stakingReference("cWithdraw", "withdraw"), [
				{ time: 1001, hash: HASH, delta: { withdrawal: { amount: "2.5", phase: "initiated" } } },
			]),
		).not.toBeNull();
		expect(
			reconcileStakingFundsAction(stakingReference("tokenDelegate", "delegate"), [
				{ time: 1001, hash: HASH, delta: { delegate: { validator: TARGET, amount: "2.5", isUndelegate: false } } },
			]),
		).not.toBeNull();
		expect(
			reconcileStakingFundsAction(stakingReference("tokenDelegate", "undelegate"), [
				{ time: 1001, hash: HASH, delta: { delegate: { validator: TARGET, amount: "2.5", isUndelegate: true } } },
			]),
		).not.toBeNull();
	});

	it("does not treat finalized withdrawal or malformed snapshots as a new request", () => {
		expect(
			reconcileStakingFundsAction(stakingReference("cWithdraw", "withdraw"), [
				{ time: 1001, hash: HASH, delta: { withdrawal: { amount: "2.5", phase: "finalized" } } },
			]),
		).toBeNull();
		expect(reconcileVaultFundsAction(vaultReference("deposit"), undefined)).toBeNull();
	});

	it("fails closed for legacy markers without a history baseline", () => {
		const marker = vaultReference("deposit");
		const { historyBaseline: _baseline, ...legacy } = marker;
		expect(
			reconcileVaultFundsAction(legacy, [
				{ time: 1001, hash: HASH, delta: { type: "vaultDeposit", vault: TARGET, usdc: "12.5" } },
			]),
		).toBeNull();
	});

	it("creates a normalized baseline only from a complete valid history snapshot", () => {
		expect(
			createFundsActionHistoryBaseline(
				[
					{ time: 2, hash: HASH.toUpperCase().replace("0X", "0x"), delta: { cDeposit: { amount: "1" } } },
					{ time: 1, hash: OLD_HASH, delta: { cDeposit: { amount: "2" } } },
				],
				123,
			),
		).toEqual({ version: 1, observedAt: 123, hashes: [HASH, OLD_HASH].sort() });
		expect(createFundsActionHistoryBaseline([{ time: 1, hash: "invalid", delta: {} }], 123)).toBeNull();
	});

	it("requires a fresh schema-valid Vault state moving in the requested direction", () => {
		expect(
			verifyVaultReconciliationState(vaultReference("deposit"), {
				detailValid: true,
				vaultEquity: "22.5",
				withdrawable: "87.5",
			}),
		).toBe(true);
		expect(
			verifyVaultReconciliationState(vaultReference("deposit"), {
				detailValid: true,
				vaultEquity: "10",
				withdrawable: "100",
			}),
		).toBe(false);
		expect(
			verifyVaultReconciliationState(vaultReference("withdraw"), {
				detailValid: false,
				vaultEquity: "0",
				withdrawable: "112",
			}),
		).toBe(false);
	});

	it("requires each Staking action to move an authoritative balance in its direction", () => {
		expect(
			verifyStakingReconciliationState(stakingReference("cDeposit", "deposit"), {
				spotAvailable: "17.5",
				delegated: "5",
				undelegated: "12.5",
				totalPendingWithdrawal: "1",
				nPendingWithdrawals: 1,
				targetDelegation: "2",
			}),
		).toBe(true);
		expect(
			verifyStakingReconciliationState(stakingReference("cWithdraw", "withdraw"), {
				spotAvailable: "20",
				delegated: "5",
				undelegated: "7.5",
				totalPendingWithdrawal: "3.5",
				nPendingWithdrawals: 2,
				targetDelegation: "2",
			}),
		).toBe(true);
		expect(
			verifyStakingReconciliationState(stakingReference("tokenDelegate", "delegate"), {
				spotAvailable: "20",
				delegated: "7.5",
				undelegated: "7.5",
				totalPendingWithdrawal: "1",
				nPendingWithdrawals: 1,
				targetDelegation: "4.5",
			}),
		).toBe(true);
		expect(
			verifyStakingReconciliationState(stakingReference("tokenDelegate", "undelegate"), {
				spotAvailable: "20",
				delegated: "5",
				undelegated: "10",
				totalPendingWithdrawal: "1",
				nPendingWithdrawals: 1,
				targetDelegation: "2",
			}),
		).toBe(false);
	});
});
