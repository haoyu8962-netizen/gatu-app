import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ORDER_RECONCILIATION_CONFIRMATION_WINDOW_MS } from "@/domain/trade/order-tracking";
import {
	getPendingOrderActions,
	hasPendingOrderForAssets,
	hasPendingOrderIntent,
} from "@/stores/use-pending-order-store";

const USER = "0x1111111111111111111111111111111111111111" as const;

describe("pending order store", () => {
	beforeEach(() => {
		getPendingOrderActions().prune(Number.MAX_SAFE_INTEGER);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("blocks the affected asset until every child has a known exchange status", () => {
		const submission = getPendingOrderActions().add({
			env: "Mainnet",
			user: USER,
			intentKey: "scale-order",
			children: [
				{ assetId: 0, cloid: "0x00000000000000000000000000000001" },
				{ assetId: 0, cloid: "0x00000000000000000000000000000002" },
			],
		});
		const firstChild = submission.children[0];
		const secondChild = submission.children[1];
		if (!firstChild || !secondChild) throw new Error("Expected two tracked order children");

		expect(hasPendingOrderForAssets("Mainnet", USER, [0])).toBe(true);
		expect(getPendingOrderActions().resolve("Mainnet", USER, firstChild.cloid, "open")).toBeNull();
		expect(hasPendingOrderForAssets("Mainnet", USER, [0])).toBe(true);

		const completed = getPendingOrderActions().resolve("Mainnet", USER, secondChild.cloid, "filled");
		expect(completed?.children.map((child) => child.status)).toEqual(["open", "filled"]);
		expect(hasPendingOrderForAssets("Mainnet", USER, [0])).toBe(false);
	});

	it("scopes duplicate protection by network and actual user", () => {
		getPendingOrderActions().add({
			env: "Mainnet",
			user: USER,
			intentKey: "order",
			children: [{ assetId: 10, cloid: "0x00000000000000000000000000000003" }],
		});

		expect(hasPendingOrderForAssets("Mainnet", USER, [10])).toBe(true);
		expect(hasPendingOrderForAssets("Testnet", USER, [10])).toBe(false);
		expect(hasPendingOrderForAssets("Mainnet", "0x2222222222222222222222222222222222222222", [10])).toBe(false);
	});

	it("releases the hard lock after the confirmation window while retaining the tracked record", () => {
		const submission = getPendingOrderActions().add({
			env: "Mainnet",
			user: USER,
			intentKey: "order",
			children: [{ assetId: 11, cloid: "0x00000000000000000000000000000004" }],
		});
		vi.spyOn(Date, "now").mockReturnValue(submission.createdAt + ORDER_RECONCILIATION_CONFIRMATION_WINDOW_MS);

		expect(hasPendingOrderForAssets("Mainnet", USER, [11])).toBe(false);
		expect(hasPendingOrderIntent("Mainnet", USER, "order")).toBe(false);
		expect(getPendingOrderActions().markUnconfirmed(submission.id, Date.now())).toMatchObject({
			id: submission.id,
			unconfirmedAt: Date.now(),
		});
	});
});
