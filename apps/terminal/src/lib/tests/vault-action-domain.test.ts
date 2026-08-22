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
			amountAtomic: "1234567",
			detailSnapshot: rawDetail(),
			equitiesSnapshot: [],
			clearinghouseSnapshot: { withdrawable: "1.23456789" },
			now: NOW,
		});
		expect(accepted).toMatchObject({ valid: true, availableAtomic: "1234567" });

		expect(
			verifyVaultActionPreflight({
				action: "deposit",
				vaultAddress: VAULT,
				ownerAddress: OWNER,
				amountAtomic: "1234568",
				detailSnapshot: rawDetail(),
				equitiesSnapshot: [],
				clearinghouseSnapshot: { withdrawable: "1.23456789" },
				now: NOW,
			}),
		).toEqual({ valid: false, error: "amountExceedsAvailable" });
		expect(
			verifyVaultActionPreflight({
				action: "deposit",
				vaultAddress: VAULT,
				ownerAddress: OWNER,
				amountAtomic: "1",
				detailSnapshot: { ...rawDetail(), isClosed: true },
				equitiesSnapshot: [],
				clearinghouseSnapshot: { withdrawable: "100" },
				now: NOW,
			}),
		).toEqual({ valid: false, error: "depositsClosed" });
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
