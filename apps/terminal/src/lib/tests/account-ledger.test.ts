import type { UserNonFundingLedgerUpdatesResponse } from "@nktkas/hyperliquid";
import { describe, expect, it } from "vitest";
import {
	type AccountLedgerUpdate,
	buildAccountLedgerRow,
	fetchAccountLedgerHistory,
	getAccountLedgerUpdateKey,
	getAccountLedgerUsdcBridge,
	mergeAccountLedgerUpdates,
} from "@/lib/trade/account-ledger";

const USER = "0x1111111111111111111111111111111111111111";
const OTHER = "0x3333333333333333333333333333333333333333";
const HASH = `0x${"a".repeat(64)}` as `0x${string}`;
const BRIDGE = getAccountLedgerUsdcBridge(false);
const USDC_SYSTEM_ADDRESS = "0x2000000000000000000000000000000000000000";
const MAINNET_CORE_DEPOSIT_WALLET = "0x6b9e773128f453f5c2c60935ee2de2cbc5390a24";
const TESTNET_CORE_DEPOSIT_WALLET = "0x0b80659a4076e9e93c7dbe0f10675a16a3e5c206";

type SendDelta = Extract<UserNonFundingLedgerUpdatesResponse[number]["delta"], { type: "send" }>;
type SpotTransferDelta = Extract<UserNonFundingLedgerUpdatesResponse[number]["delta"], { type: "spotTransfer" }>;

function createSend(overrides: Partial<SendDelta>): SendDelta {
	return {
		type: "send",
		amount: "5",
		destination: OTHER,
		destinationDex: "spot",
		fee: "0",
		feeToken: "USDC",
		nativeTokenFee: "0",
		nonce: 1,
		sourceDex: "spot",
		token: "USDC",
		usdcValue: "5",
		user: USER,
		...overrides,
	};
}

function createSpotTransfer(overrides: Partial<SpotTransferDelta>): SpotTransferDelta {
	return {
		type: "spotTransfer",
		amount: "2",
		destination: OTHER,
		fee: "0",
		feeToken: "",
		nativeTokenFee: "0",
		nonce: 1,
		token: "HYPE",
		usdcValue: "60",
		user: USER,
		...overrides,
	};
}

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
		const deposit = buildAccountLedgerRow(createUpdate({ type: "deposit", usdc: "25.5" }), USER, BRIDGE);
		const withdrawal = buildAccountLedgerRow(
			createUpdate({ type: "withdraw", usdc: "20", fee: "1", nonce: 999 }),
			USER,
			BRIDGE,
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

	it("keeps amounts below 1e-7 as plain decimal strings", () => {
		const deposit = buildAccountLedgerRow(createUpdate({ type: "deposit", usdc: "0.00000001" }), USER, BRIDGE);
		const withdrawal = buildAccountLedgerRow(
			createUpdate({ type: "withdraw", usdc: "0.00000002", fee: "0.00000001", nonce: 1 }),
			USER,
			BRIDGE,
		);

		expect(deposit?.amount).toBe("0.00000001");
		expect(withdrawal?.amount).not.toMatch(/e/i);
		expect(withdrawal?.fee?.amount).toBe("0.00000001");
		expect(deposit?.amount).not.toMatch(/e/i);
	});

	it("derives send direction from the queried account", () => {
		const sendDelta: Extract<UserNonFundingLedgerUpdatesResponse[number]["delta"], { type: "send" }> = {
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

		expect(buildAccountLedgerRow(outgoing, USER, BRIDGE)).toMatchObject({
			action: "send",
			amount: "-5",
			destination: { kind: "spot" },
			fee: { amount: "0.1", token: "USDC" },
			source: { kind: "perps" },
		});
		expect(buildAccountLedgerRow(incoming, USER, BRIDGE)).toMatchObject({ amount: "5" });
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
			BRIDGE,
		);

		expect(row).toMatchObject({
			destination: { dex: "cash", kind: "perpDex" },
			fee: { amount: "0.01", token: "HYPE" },
			source: { dex: "xyz", kind: "perpDex" },
		});
	});

	it("labels a CCTP withdrawal sent to the USDC system address as a withdrawal to HyperEVM", () => {
		const row = buildAccountLedgerRow(
			createUpdate(createSend({ amount: "10.49", destination: USDC_SYSTEM_ADDRESS, fee: "0.001734" })),
			USER,
			BRIDGE,
		);

		expect(row).toMatchObject({
			action: "withdrawal",
			amount: "-10.49",
			destination: { kind: "hyperevm" },
			explorer: "hyperliquid",
			fee: { amount: "0.001734", token: "USDC" },
			source: { kind: "spot" },
			token: "USDC",
		});
	});

	it.each([
		["", { kind: "perps" }],
		["xyz", { dex: "xyz", kind: "perpDex" }],
	] as const)(
		"treats a send to the USDC system address on DEX %j as a transfer, not a withdrawal",
		(destinationDex, destination) => {
			const row = buildAccountLedgerRow(
				createUpdate(createSend({ destination: USDC_SYSTEM_ADDRESS, destinationDex })),
				USER,
				BRIDGE,
			);

			expect(row).toMatchObject({ action: "transfer", destination });
		},
	);

	it("labels USDC arriving from the network's CoreDepositWallet as a deposit from HyperEVM", () => {
		const delta = createSend({ destination: USER, destinationDex: "", user: MAINNET_CORE_DEPOSIT_WALLET });
		const testnetDelta = { ...delta, user: TESTNET_CORE_DEPOSIT_WALLET };

		expect(buildAccountLedgerRow(createUpdate(delta), USER, BRIDGE)).toMatchObject({
			action: "deposit",
			amount: "5",
			destination: { kind: "perps" },
			explorer: "hyperliquid",
			source: { kind: "hyperevm" },
		});
		expect(buildAccountLedgerRow(createUpdate(testnetDelta), USER, getAccountLedgerUsdcBridge(true))).toMatchObject({
			action: "deposit",
		});
		expect(buildAccountLedgerRow(createUpdate(testnetDelta), USER, BRIDGE)).toMatchObject({
			action: "send",
			source: { kind: "spot" },
		});
	});

	it("labels moves through other HyperCore system addresses and between own balances as transfers", () => {
		const toEvm = buildAccountLedgerRow(
			createUpdate(createSend({ destination: "0x20000000000000000000000000000000000000c8", token: "PURR" })),
			USER,
			BRIDGE,
		);
		const betweenOwnDexes = buildAccountLedgerRow(
			createUpdate(createSend({ destination: USER, destinationDex: "xyz", sourceDex: "" })),
			USER,
			BRIDGE,
		);
		const hypeFromEvm = buildAccountLedgerRow(
			createUpdate(createSpotTransfer({ destination: USER, user: "0x2222222222222222222222222222222222222222" })),
			USER,
			BRIDGE,
		);
		const usdcToEvm = buildAccountLedgerRow(
			createUpdate(createSpotTransfer({ destination: USDC_SYSTEM_ADDRESS, token: "USDC" })),
			USER,
			BRIDGE,
		);

		expect(toEvm).toMatchObject({ action: "transfer", destination: { kind: "hyperevm" }, source: { kind: "spot" } });
		expect(betweenOwnDexes).toMatchObject({
			action: "transfer",
			destination: { dex: "xyz", kind: "perpDex" },
			source: { kind: "perps" },
		});
		expect(hypeFromEvm).toMatchObject({
			action: "transfer",
			amount: "2",
			destination: { kind: "spot" },
			source: { kind: "hyperevm" },
		});
		expect(usdcToEvm).toMatchObject({
			action: "transfer",
			amount: "-2",
			destination: { kind: "hyperevm" },
			source: { kind: "spot" },
		});
	});

	it("keeps transfers to other accounts as sends", () => {
		expect(buildAccountLedgerRow(createUpdate(createSend({})), USER, BRIDGE)).toMatchObject({
			action: "send",
			destination: { kind: "spot" },
			source: { kind: "spot" },
		});
		expect(buildAccountLedgerRow(createUpdate(createSpotTransfer({})), USER, BRIDGE)).toMatchObject({
			action: "send",
			destination: { kind: "spot" },
			source: { kind: "spot" },
		});
	});

	it("maps account, staking, and earn transfers with signed values", () => {
		const toPerps = buildAccountLedgerRow(
			createUpdate({ type: "accountClassTransfer", toPerp: true, usdc: "10" }),
			USER,
			BRIDGE,
		);
		const stake = buildAccountLedgerRow(
			createUpdate({ type: "cStakingTransfer", amount: "2", isDeposit: true, token: "HYPE" }),
			USER,
			BRIDGE,
		);
		const borrow = buildAccountLedgerRow(
			createUpdate({ type: "borrowLend", amount: "4", interestAmount: "0", operation: "borrow", token: "USDC" }),
			USER,
			BRIDGE,
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
			BRIDGE,
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
			BRIDGE,
		);

		expect(row).toBeNull();
	});

	it("maps production ledger delta types missing from SDK 0.33.3", () => {
		const activation = buildAccountLedgerRow(
			createUpdate({ type: "accountActivationGas", amount: "0.025", token: "HYPE" }),
			USER,
			BRIDGE,
		);
		const hip3Withdrawal = buildAccountLedgerRow(
			createUpdate({ type: "hip3LiquidatorWithdraw", amount: "12.5", dex: "xyz", token: "USDC" }),
			USER,
			BRIDGE,
		);

		expect(activation).toMatchObject({ action: "accountActivationFee", amount: "-0.025", token: "HYPE" });
		expect(hip3Withdrawal).toMatchObject({
			action: "hip3LiquidatorWithdrawal",
			amount: "12.5",
			destination: { dex: "xyz", kind: "perpDex" },
		});
	});

	it("keeps unknown production deltas visible with their raw type", () => {
		const row = buildAccountLedgerRow(createUpdate({ type: "futureLedgerDelta", requestedUsd: "4.2" }), USER, BRIDGE);

		expect(row).toMatchObject({ action: "other", amount: "4.2", rawType: "futureLedgerDelta" });
	});

	it("degrades malformed known deltas instead of throwing during toolbar render", () => {
		const row = buildAccountLedgerRow(createUpdate({ type: "deposit" }), USER, BRIDGE);

		expect(row).toMatchObject({ action: "other", amount: null, rawType: "deposit" });
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
		const rest: AccountLedgerUpdate[] = [withdrawal];
		const realtime: AccountLedgerUpdate[] = [withdrawal, commission];

		const merged = mergeAccountLedgerUpdates(rest, realtime);

		expect(merged).toHaveLength(2);
		expect(getAccountLedgerUpdateKey(withdrawal)).not.toBe(getAccountLedgerUpdateKey(commission));
	});

	it("pages complete history with the API's inclusive start-time overlap", async () => {
		const first = createUpdate({ type: "deposit", usdc: "1" }, { time: 1_000 });
		const overlap = createUpdate({ type: "deposit", usdc: "2" }, { hash: `0x${"b".repeat(64)}`, time: 2_000 });
		const last = createUpdate({ type: "withdraw", usdc: "1", fee: "1", nonce: 3 }, { time: 3_000 });
		const requestedStartTimes: number[] = [];
		const controller = new AbortController();

		const result = await fetchAccountLedgerHistory(
			async (startTime) => {
				requestedStartTimes.push(startTime);
				if (startTime === 0) return [first, overlap];
				if (startTime === 2_000) return [overlap, last];
				return [];
			},
			{ endTime: 3_000, signal: controller.signal },
		);

		expect(requestedStartTimes).toEqual([0, 2_000, 3_000]);
		expect(result.truncated).toBe(false);
		expect(result.updates.map((update) => update.time)).toEqual([3_000, 2_000, 1_000]);
	});

	it("reports a bounded export when the page limit is reached", async () => {
		const controller = new AbortController();
		const result = await fetchAccountLedgerHistory(
			async () => [createUpdate({ type: "deposit", usdc: "1" }, { time: 1_000 })],
			{ endTime: 1_000, maxPages: 1, signal: controller.signal },
		);

		expect(result.truncated).toBe(true);
		expect(result.updates).toHaveLength(1);
	});

	it("rejects malformed updates instead of exporting incomplete history", async () => {
		const controller = new AbortController();

		await expect(
			fetchAccountLedgerHistory(async () => [createUpdate({ type: "deposit", usdc: "1" }, { hash: "" })], {
				endTime: 1_000,
				signal: controller.signal,
			}),
		).rejects.toMatchObject({ name: "MalformedHistoryPageError" });
	});
});
