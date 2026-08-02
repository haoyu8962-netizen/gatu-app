import type { UserNonFundingLedgerUpdatesResponse } from "@nktkas/hyperliquid";
import { describe, expect, it } from "vitest";
import {
	type AccountLedgerUpdate,
	buildAccountLedgerRow,
	fetchAccountLedgerHistory,
	getAccountLedgerUpdateKey,
	mergeAccountLedgerUpdates,
} from "@/lib/trade/account-ledger";

const USER = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";
const HASH = `0x${"a".repeat(64)}` as `0x${string}`;

function createUpdate(
	delta: AccountLedgerUpdate["delta"],
	overrides: Partial<Omit<AccountLedgerUpdate, "delta">> = {},
): AccountLedgerUpdate {
	return {
		delta,
		hash: HASH,
		time: 1_000,
		...overrides,
	};
}

describe("account ledger", () => {
	it("maps documented bridge deposits and withdrawals", () => {
		const deposit = buildAccountLedgerRow(createUpdate({ type: "deposit", usdc: "25.5" }), USER);
		const withdrawal = buildAccountLedgerRow(
			createUpdate({ type: "withdraw", usdc: "20", fee: "1", nonce: 999 }),
			USER,
		);

		expect(deposit).toMatchObject({
			action: "deposit",
			amount: "25.5",
			destination: { kind: "perps" },
			explorer: "arbitrum",
			fee: null,
			source: { kind: "arbitrum" },
			token: "USDC",
		});
		expect(withdrawal).toMatchObject({
			action: "withdrawal",
			amount: "-20",
			destination: { kind: "arbitrum" },
			explorer: "arbitrum",
			fee: { amount: "1", token: "USDC" },
			source: { kind: "perps" },
		});
	});

	it("derives send direction from the queried account", () => {
		const sendDelta: Extract<AccountLedgerUpdate["delta"], { type: "send" }> = {
			type: "send",
			amount: "5",
			destination: OTHER,
			destinationDex: "spot",
			fee: "0.1",
			feeToken: "USDC",
			nativeTokenFee: "0",
			nonce: 1,
			sourceDex: "",
			token: "USDC",
			usdcValue: "5",
			user: USER,
		};
		const outgoing = createUpdate(sendDelta);
		const incoming = createUpdate(
			{
				...sendDelta,
				destination: USER,
				user: OTHER,
			},
			{ time: 2_000 },
		);

		expect(buildAccountLedgerRow(outgoing, USER)).toMatchObject({
			action: "send",
			amount: "-5",
			destination: { kind: "spot" },
			fee: { amount: "0.1", token: "USDC" },
			source: { kind: "perps" },
		});
		expect(buildAccountLedgerRow(incoming, USER)).toMatchObject({ amount: "5" });
	});

	it("prefers native fees and preserves builder dex locations", () => {
		const row = buildAccountLedgerRow(
			createUpdate({
				type: "send",
				amount: "3",
				destination: OTHER,
				destinationDex: "cash",
				fee: "0.2",
				feeToken: "USDC",
				nativeTokenFee: "0.01",
				nonce: 2,
				sourceDex: "xyz",
				token: "USDC",
				usdcValue: "3",
				user: USER,
			}),
			USER,
		);

		expect(row).toMatchObject({
			destination: { dex: "cash", kind: "perpDex" },
			fee: { amount: "0.01", token: "HYPE" },
			source: { dex: "xyz", kind: "perpDex" },
		});
	});

	it("maps account, staking, and earn transfers with signed values", () => {
		const toPerps = buildAccountLedgerRow(
			createUpdate({ type: "accountClassTransfer", toPerp: true, usdc: "10" }),
			USER,
		);
		const stake = buildAccountLedgerRow(
			createUpdate({ type: "cStakingTransfer", amount: "2", isDeposit: true, token: "HYPE" }),
			USER,
		);
		const borrow = buildAccountLedgerRow(
			createUpdate({ type: "borrowLend", amount: "4", interestAmount: "0", operation: "borrow", token: "USDC" }),
			USER,
		);

		expect(toPerps).toMatchObject({
			action: "transfer",
			amount: "10",
			destination: { kind: "perps" },
			source: { kind: "spot" },
		});
		expect(stake).toMatchObject({
			action: "stake",
			amount: "-2",
			destination: { kind: "staking" },
			source: { kind: "spot" },
		});
		expect(borrow).toMatchObject({
			action: "borrow",
			amount: "4",
			destination: { kind: "spot" },
			source: { kind: "earn" },
		});
	});

	it("uses SDK vault accounting fields without JavaScript number arithmetic", () => {
		const row = buildAccountLedgerRow(
			createUpdate({
				type: "vaultWithdraw",
				basis: "0",
				closingCost: "0",
				commission: "0.000000000000000003",
				netWithdrawnUsd: "1.000000000000000007",
				requestedUsd: "1.1",
				user: USER,
				vault: OTHER,
			}),
			USER,
		);

		expect(row?.amount).toBe("1.00000000000000001");
		expect(row?.action).toBe("vaultWithdrawal");
	});

	it("ignores liquidation rows that would increase account value", () => {
		const row = buildAccountLedgerRow(
			createUpdate({
				type: "liquidation",
				accountValue: "-1",
				leverageType: "Cross",
				liquidatedNtlPos: "10",
				liquidatedPositions: [],
			}),
			USER,
		);

		expect(row).toBeNull();
	});

	it("deduplicates identical REST and WS entries while preserving same-hash deltas", () => {
		const withdrawal = createUpdate({
			type: "vaultWithdraw",
			basis: "0",
			closingCost: "0",
			commission: "1",
			netWithdrawnUsd: "9",
			requestedUsd: "10",
			user: USER,
			vault: OTHER,
		});
		const commission = createUpdate({ type: "vaultLeaderCommission", user: USER, usdc: "1" });
		const rest: UserNonFundingLedgerUpdatesResponse = [withdrawal];
		const realtime: UserNonFundingLedgerUpdatesResponse = [withdrawal, commission];

		const merged = mergeAccountLedgerUpdates(rest, realtime);

		expect(merged).toHaveLength(2);
		expect(getAccountLedgerUpdateKey(withdrawal)).not.toBe(getAccountLedgerUpdateKey(commission));
	});

	it("pages complete history with the API's inclusive start-time overlap", async () => {
		const first = createUpdate({ type: "deposit", usdc: "1" }, { time: 1_000 });
		const overlap = createUpdate({ type: "deposit", usdc: "2" }, { hash: `0x${"b".repeat(64)}`, time: 2_000 });
		const last = createUpdate({ type: "withdraw", usdc: "1", fee: "1", nonce: 3 }, { time: 3_000 });
		const requestedStartTimes: number[] = [];

		const result = await fetchAccountLedgerHistory(async (startTime) => {
			requestedStartTimes.push(startTime);
			if (startTime === 0) return [first, overlap];
			if (startTime === 2_000) return [overlap, last];
			return [];
		});

		expect(requestedStartTimes).toEqual([0, 2_000, 3_000]);
		expect(result.truncated).toBe(false);
		expect(result.updates.map((update) => update.time)).toEqual([3_000, 2_000, 1_000]);
	});

	it("reports a bounded export when the page limit is reached", async () => {
		const result = await fetchAccountLedgerHistory(
			async () => [createUpdate({ type: "deposit", usdc: "1" }, { time: 1_000 })],
			1,
		);

		expect(result.truncated).toBe(true);
		expect(result.updates).toHaveLength(1);
	});
});
