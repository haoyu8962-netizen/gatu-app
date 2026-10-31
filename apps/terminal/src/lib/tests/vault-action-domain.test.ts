import { getAddress } from "viem";
import { describe, expect, it } from "vitest";
import {
	atomicAmountFits,
	classifyVaultMutationFailure,
	floorDecimalStringToAtomic,
	formatVaultOperationReference,
	verifyVaultActionPreflight,
} from "@/components/vaults/vault-action-domain";

const OWNER = "0x1111111111111111111111111111111111111111" as const;
const OTHER_OWNER = "0x2222222222222222222222222222222222222222" as const;
const VAULT = "0x3333333333333333333333333333333333333333" as const;
const LEADER = "0x4444444444444444444444444444444444444444" as const;
const NOW = 1_786_579_200_000;

describe("Vault action preflight", () => {
	it("floors server ceilings to micro-USDC and compares atomic strings without Number precision loss", () => {
		expect(floorDecimalStringToAtomic("1.23456789", 6)).toBe("1234567");
		expect(floorDecimalStringToAtomic("9007199254740993.9999999", 6)).toBe("9007199254740993999999");
		expect(atomicAmountFits("9007199254740993999999", "9007199254740994000000")).toBe(true);
		expect(atomicAmountFits("9007199254740994000001", "9007199254740994000000")).toBe(false);
	});

	it("requires a fresh open Vault and exact available balance for deposits", () => {
		const accepted = verifyVaultActionPreflight({
			action: "deposit",
			vaultAddress: VAULT,
			ownerAddress: OWNER,
			amountAtomic: "12345678",
			detailSnapshot: rawDetail(),
			equitiesSnapshot: [],
			clearinghouseSnapshot: { withdrawable: "12.3456789" },
			spotClearinghouseSnapshot: null,
			accountAbstraction: "disabled",
			now: NOW,
		});
		expect(accepted).toMatchObject({ valid: true, availableAtomic: "12345678" });

		expect(
			verifyVaultActionPreflight({
				action: "deposit",
				vaultAddress: VAULT,
				ownerAddress: OWNER,
				amountAtomic: "12345679",
				detailSnapshot: rawDetail(),
				equitiesSnapshot: [],
				clearinghouseSnapshot: { withdrawable: "12.3456789" },
				spotClearinghouseSnapshot: null,
				accountAbstraction: "disabled",
				now: NOW,
			}),
		).toEqual({ valid: false, error: "amountExceedsAvailable" });
		expect(
			verifyVaultActionPreflight({
				action: "deposit",
				vaultAddress: VAULT,
				ownerAddress: OWNER,
				amountAtomic: "5000000",
				detailSnapshot: { ...rawDetail(), isClosed: true },
				equitiesSnapshot: [],
				clearinghouseSnapshot: { withdrawable: "100" },
				spotClearinghouseSnapshot: null,
				accountAbstraction: "disabled",
				now: NOW,
			}),
		).toEqual({ valid: false, error: "depositsClosed" });
	});

	function deposit(overrides: Partial<Parameters<typeof verifyVaultActionPreflight>[0]> = {}) {
		return verifyVaultActionPreflight({
			action: "deposit",
			vaultAddress: VAULT,
			ownerAddress: OWNER,
			amountAtomic: "10000000",
			detailSnapshot: rawDetail(),
			equitiesSnapshot: [],
			clearinghouseSnapshot: { withdrawable: "0.0" },
			spotClearinghouseSnapshot: {
				balances: [{ coin: "USDC", token: 0, total: "10.1", hold: "0.0", entryNtl: "0.0" }],
			},
			accountAbstraction: "unifiedAccount",
			now: NOW,
			...overrides,
		});
	}

	it("draws a shared-balance account's deposit from spot USDC that is not on hold", () => {
		expect(deposit()).toMatchObject({ valid: true, availableAmount: "10.1", availableAtomic: "10100000" });
		expect(deposit({ accountAbstraction: "portfolioMargin" })).toMatchObject({ valid: true, availableAmount: "10.1" });
		expect(
			deposit({
				spotClearinghouseSnapshot: {
					balances: [{ coin: "USDC", token: 0, total: "20", hold: "15", spotHold: "2", entryNtl: "0" }],
				},
				amountAtomic: "18000000",
			}),
		).toMatchObject({ valid: true, availableAmount: "18" });
		expect(deposit({ amountAtomic: "10100001" })).toEqual({ valid: false, error: "amountExceedsAvailable" });
		expect(deposit({ accountAbstraction: "disabled" })).toEqual({ valid: false, error: "amountExceedsAvailable" });
	});

	it.each([null, undefined, "default", "unknown", "somethingNew"])(
		"fails a deposit closed when the account mode is %s",
		(accountAbstraction) => {
			expect(deposit({ accountAbstraction })).toEqual({ valid: false, error: "balanceUnavailable" });
		},
	);

	it("lets the leader add to its own Vault after deposits from others are disabled", () => {
		const closedToOthers = rawDetail({ allowDeposits: false });
		expect(deposit({ detailSnapshot: closedToOthers })).toEqual({ valid: false, error: "depositsClosed" });
		expect(deposit({ detailSnapshot: closedToOthers, ownerAddress: LEADER })).toMatchObject({ valid: true });
		expect(
			deposit({ detailSnapshot: rawDetail({ allowDeposits: false, isClosed: true }), ownerAddress: LEADER }),
		).toEqual({ valid: false, error: "depositsClosed" });
		const checksummedLeader = getAddress("0xabcdefabcdefabcdefabcdefabcdefabcdefabcd");
		expect(
			deposit({
				detailSnapshot: rawDetail({ allowDeposits: false, leader: checksummedLeader }),
				ownerAddress: checksummedLeader.toLowerCase() as `0x${string}`,
			}),
		).toMatchObject({ valid: true });
	});

	it("requires the official minimum deposit, which rises to 10 USDC above $100M of TVL", () => {
		expect(deposit({ amountAtomic: "4999999" })).toEqual({ valid: false, error: "belowMinimumDeposit" });
		expect(deposit({ amountAtomic: "5000000" })).toMatchObject({ valid: true });
		const largeSnapshot = { accountValueHistory: [[NOW, "100000001"]], pnlHistory: [[NOW, "0"]], vlm: "0" };
		const largeVault = rawDetail({
			portfolio: [
				["day", largeSnapshot],
				["week", largeSnapshot],
				["month", largeSnapshot],
				["allTime", largeSnapshot],
			],
		});
		expect(deposit({ detailSnapshot: largeVault, amountAtomic: "9999999" })).toEqual({
			valid: false,
			error: "belowMinimumDeposit",
		});
		expect(deposit({ detailSnapshot: largeVault, amountAtomic: "10000000" })).toMatchObject({ valid: true });
		const boundarySnapshot = { accountValueHistory: [[NOW, "100000000"]], pnlHistory: [[NOW, "0"]], vlm: "0" };
		const boundaryVault = rawDetail({
			portfolio: [
				["day", boundarySnapshot],
				["week", boundarySnapshot],
				["month", boundarySnapshot],
				["allTime", boundarySnapshot],
			],
		});
		expect(deposit({ detailSnapshot: boundaryVault, amountAtomic: "5000000" })).toMatchObject({ valid: true });
	});

	it("fails withdrawals closed for missing exact equity, server locks, and fresh maximum changes", () => {
		const lockedEquity = [{ vaultAddress: VAULT, equity: "10", lockedUntilTimestamp: NOW + 1 }];
		expect(
			verifyVaultActionPreflight({
				action: "withdraw",
				vaultAddress: VAULT,
				ownerAddress: OWNER,
				amountAtomic: "1000000",
				detailSnapshot: rawDetail({ followerState: null }),
				equitiesSnapshot: lockedEquity,
				clearinghouseSnapshot: null,
				spotClearinghouseSnapshot: null,
				accountAbstraction: "disabled",
				now: NOW,
			}),
		).toEqual({ valid: false, error: "withdrawalLocked" });

		expect(
			verifyVaultActionPreflight({
				action: "withdraw",
				vaultAddress: VAULT,
				ownerAddress: OWNER,
				amountAtomic: "1000001",
				detailSnapshot: rawDetail({ followerState: null, maxWithdrawable: 1.0000019 }),
				equitiesSnapshot: [{ vaultAddress: VAULT, equity: "10", lockedUntilTimestamp: NOW }],
				clearinghouseSnapshot: null,
				spotClearinghouseSnapshot: null,
				accountAbstraction: "disabled",
				now: NOW,
			}),
		).toMatchObject({ valid: true, availableAtomic: "1000001" });

		expect(
			verifyVaultActionPreflight({
				action: "withdraw",
				vaultAddress: VAULT,
				ownerAddress: OWNER,
				amountAtomic: "1",
				detailSnapshot: rawDetail({ followerState: null }),
				equitiesSnapshot: [],
				clearinghouseSnapshot: null,
				spotClearinghouseSnapshot: null,
				accountAbstraction: "disabled",
				now: NOW,
			}),
		).toEqual({ valid: false, error: "equityUnavailable" });
	});

	it("rejects a refreshed follower identity that differs from the signing owner", () => {
		expect(
			verifyVaultActionPreflight({
				action: "deposit",
				vaultAddress: VAULT,
				ownerAddress: OWNER,
				amountAtomic: "1",
				detailSnapshot: rawDetail({
					followerState: {
						user: OTHER_OWNER,
						vaultEquity: "1",
						pnl: "0",
						allTimePnl: "0",
						daysFollowing: 1,
						vaultEntryTime: NOW - 1,
						lockupUntil: NOW,
					},
				}),
				equitiesSnapshot: [],
				clearinghouseSnapshot: { withdrawable: "1" },
				spotClearinghouseSnapshot: null,
				accountAbstraction: "disabled",
				now: NOW,
			}),
		).toEqual({ valid: false, error: "ownerMismatch" });
	});
});

describe("Vault mutation result safety", () => {
	it("clears only rejected and deterministic SDK failures", () => {
		expect(classifyVaultMutationFailure({ code: 4001, message: "User rejected" })).toBe("rejected");
		const apiError = new Error("bad request");
		apiError.name = "ApiRequestError";
		expect(classifyVaultMutationFailure(apiError)).toBe("deterministic");
		const validationError = new Error("bad amount");
		validationError.name = "ValidationError";
		expect(classifyVaultMutationFailure(validationError)).toBe("deterministic");
		expect(classifyVaultMutationFailure(new Error("transport disconnected"))).toBe("ambiguous");
	});

	it("classifies an exchange rejection by its source even when its text mentions a user rejection", () => {
		const apiError = new Error("User rejected the request because the vault is closed");
		apiError.name = "ApiRequestError";
		expect(classifyVaultMutationFailure(apiError)).toBe("deterministic");
	});

	it("formats only the public operation tuple", () => {
		const reference = formatVaultOperationReference({
			env: "Mainnet",
			owner: OWNER,
			method: "vaultTransfer",
			target: VAULT,
			direction: "withdraw",
			atomicAmount: "1000000",
			startedAt: NOW,
			identityEpoch: "identity-epoch",
		});
		expect(reference).toBe(`Mainnet|${OWNER}|vaultTransfer|${VAULT}|withdraw|1000000|${NOW}|identity-epoch`);
		expect(reference).not.toMatch(/private|signature|secret/i);
	});
});

function rawDetail(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	const snapshot = {
		accountValueHistory: [[NOW, "100"]],
		pnlHistory: [[NOW, "0"]],
		vlm: "100",
	};
	return {
		name: "Safety Vault",
		vaultAddress: VAULT,
		leader: LEADER,
		description: "Fixture",
		portfolio: [
			["day", snapshot],
			["week", snapshot],
			["month", snapshot],
			["allTime", snapshot],
		],
		apr: 0.1,
		followerState: null,
		leaderFraction: 0.1,
		leaderCommission: 0.1,
		followers: [],
		maxDistributable: 0,
		maxWithdrawable: 10,
		isClosed: false,
		relationship: { type: "normal" },
		allowDeposits: true,
		alwaysCloseOnWithdraw: false,
		...overrides,
	};
}
