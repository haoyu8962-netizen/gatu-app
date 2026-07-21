import { beforeEach, describe, expect, it } from "vitest";
import { getPendingTwapActions, hasPendingTwapForAsset } from "@/stores/use-pending-twap-store";

const USER = "0x1111111111111111111111111111111111111111" as const;

function addSubmission(assetId = 7) {
	return getPendingTwapActions().add({
		env: "Mainnet",
		user: USER,
		intent: {
			assetId,
			coin: "xyz:GOLD",
			side: "B",
			size: "1",
			minutes: 30,
			reduceOnly: false,
			randomize: true,
		},
		activeBaseline: { ready: true, knownIds: [10] },
		historyBaseline: { ready: true, knownIds: [9, 10] },
	});
}

describe("pending TWAP store", () => {
	beforeEach(() => {
		getPendingTwapActions().prune(Number.MAX_SAFE_INTEGER);
	});

	it("blocks duplicate TWAP submissions only for the same network, user, and asset", () => {
		addSubmission();

		expect(hasPendingTwapForAsset("Mainnet", USER, 7)).toBe(true);
		expect(hasPendingTwapForAsset("Testnet", USER, 7)).toBe(false);
		expect(hasPendingTwapForAsset("Mainnet", "0x2222222222222222222222222222222222222222", 7)).toBe(false);
		expect(hasPendingTwapForAsset("Mainnet", USER, 8)).toBe(false);
	});

	it("returns the persisted submission exactly once when reconciliation resolves it", () => {
		const submission = addSubmission(8);

		expect(getPendingTwapActions().resolve(submission.id)).toEqual(submission);
		expect(getPendingTwapActions().resolve(submission.id)).toBeNull();
		expect(hasPendingTwapForAsset("Mainnet", USER, 8)).toBe(false);
	});
});
