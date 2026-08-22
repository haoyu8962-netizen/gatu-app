import { describe, expect, it } from "vitest";
import {
	createCancelAllConfirmationSnapshot,
	validateCancelAllConfirmationSnapshot,
} from "@/domain/trade/cancel-all-orders-confirmation";

const OWNER = "0x1111111111111111111111111111111111111111";

function input(
	overrides: Partial<Parameters<typeof createCancelAllConfirmationSnapshot>[0]> = {},
): Parameters<typeof createCancelAllConfirmationSnapshot>[0] {
	return {
		owner: OWNER,
		snapshotOwner: OWNER.toUpperCase(),
		env: "Mainnet",
		isSnapshotReady: true,
		orders: [
			{ coin: "BTC", oid: 2 },
			{ coin: "xyz:ORCL", oid: 1 },
		],
		...overrides,
	};
}

describe("cancel-all confirmation snapshot", () => {
	it("captures a stable owner, environment, and order identity set", () => {
		const result = createCancelAllConfirmationSnapshot(input());
		expect(result).toEqual({
			status: "ready",
			snapshot: {
				owner: OWNER,
				env: "Mainnet",
				orderKeys: ["BTC\u00002", "xyz:ORCL\u00001"],
			},
		});
	});

	it("fails closed when the owner, environment, or snapshot readiness changes", () => {
		const result = createCancelAllConfirmationSnapshot(input());
		if (result.status !== "ready") throw new Error("expected ready snapshot");

		expect(
			validateCancelAllConfirmationSnapshot(
				result.snapshot,
				input({ owner: "0x2222222222222222222222222222222222222222" }),
			),
		).toBe("session-changed");
		expect(validateCancelAllConfirmationSnapshot(result.snapshot, input({ env: "Testnet" }))).toBe("session-changed");
		expect(validateCancelAllConfirmationSnapshot(result.snapshot, input({ isSnapshotReady: false }))).toBe(
			"snapshot-not-ready",
		);
	});

	it("requires the exact confirmed order set and rejects duplicate identities", () => {
		const result = createCancelAllConfirmationSnapshot(input());
		if (result.status !== "ready") throw new Error("expected ready snapshot");

		expect(
			validateCancelAllConfirmationSnapshot(
				result.snapshot,
				input({ orders: [...input().orders, { coin: "ETH", oid: 3 }] }),
			),
		).toBe("orders-changed");
		expect(validateCancelAllConfirmationSnapshot(result.snapshot, input({ orders: [{ coin: "BTC", oid: 2 }] }))).toBe(
			"orders-changed",
		);
		expect(
			createCancelAllConfirmationSnapshot(
				input({
					orders: [
						{ coin: "BTC", oid: 2 },
						{ coin: "BTC", oid: 2 },
					],
				}),
			),
		).toEqual({ status: "blocked", reason: "orders-changed" });
	});
});
