import { beforeEach, describe, expect, it } from "vitest";
import {
	getPendingTradingActionActions,
	getPendingTradingActionSnapshot,
	TRADING_ACTION_CONFIRMATION_TIMEOUT_MS,
} from "@/stores/use-pending-trading-action-store";

const OWNER = "0x1111111111111111111111111111111111111111";
const OTHER_OWNER = "0x2222222222222222222222222222222222222222";

describe("pending trading action store", () => {
	beforeEach(() => getPendingTradingActionActions().reset());

	it("isolates modification claims by environment, owner, and order id", () => {
		const actions = getPendingTradingActionActions();
		const input = {
			env: "Mainnet" as const,
			owner: OWNER,
			oid: 42,
			originalSize: "2",
			originalTriggerPx: "0",
			expectedSize: "1",
		};
		expect(actions.claimModification(input)).not.toBeNull();
		expect(actions.claimModification(input)).toBeNull();
		expect(actions.claimModification({ ...input, owner: OTHER_OWNER })).not.toBeNull();
		expect(actions.claimModification({ ...input, env: "Testnet" })).not.toBeNull();
		expect(actions.claimModification({ ...input, oid: 43 })).not.toBeNull();
	});

	it("captures the first SDK request boundary without moving the freshness baseline", () => {
		const actions = getPendingTradingActionActions();
		const modification = actions.claimModification({
			env: "Mainnet",
			owner: OWNER,
			oid: 42,
			originalSize: "2",
			originalTriggerPx: "0",
			expectedSize: "1",
		});
		if (!modification) throw new Error("Expected modification claim");
		actions.markModificationRequestStarted(modification.id, 1_000);
		actions.markModificationRequestStarted(modification.id, 2_000);
		actions.markModificationUnconfirmed(modification.id, 3_000);
		actions.markModificationUnconfirmed(modification.id, 4_000);
		expect(getPendingTradingActionSnapshot().modifications[0]).toMatchObject({
			requestStartedAt: 1_000,
			unconfirmedAt: 3_000,
		});
	});

	it("keeps an unconfirmed modification locked while allowing cancellation", () => {
		const actions = getPendingTradingActionActions();
		const modification = actions.claimModification({
			env: "Mainnet",
			owner: OWNER,
			oid: 42,
			originalSize: "2",
			originalTriggerPx: "0",
			expectedSize: "1",
		});
		expect(modification).not.toBeNull();
		if (!modification) return;
		actions.markModificationUnconfirmed(modification.id, 1_000);
		expect(
			actions.claimModification({
				env: "Mainnet",
				owner: OWNER,
				oid: 42,
				originalSize: "2",
				originalTriggerPx: "0",
				expectedSize: "1",
			}),
		).toBeNull();

		const cancellation = actions.claimOrderCancellation({ env: "Mainnet", owner: OWNER, oids: [42] });
		expect(cancellation).not.toBeNull();
		if (!cancellation) return;
		actions.releaseOrderCancellation(cancellation.id);
		expect(
			actions.claimModification({
				env: "Mainnet",
				owner: OWNER,
				oid: 42,
				originalSize: "2",
				originalTriggerPx: "0",
				expectedSize: "1",
			}),
		).toBeNull();
	});

	it("clears modification uncertainty only after cancellation confirmation", () => {
		const actions = getPendingTradingActionActions();
		const modification = actions.claimModification({
			env: "Mainnet",
			owner: OWNER,
			oid: 42,
			originalSize: "2",
			originalTriggerPx: "0",
			expectedSize: "1",
		});
		if (!modification) throw new Error("Expected modification claim");
		actions.markModificationUnconfirmed(modification.id, 1_000);
		const cancellation = actions.claimOrderCancellation({ env: "Mainnet", owner: OWNER, oids: [42] });
		if (!cancellation) throw new Error("Expected cancellation claim");
		actions.confirmOrderCancellation(cancellation.id);

		expect(
			actions.claimModification({
				env: "Mainnet",
				owner: OWNER,
				oid: 42,
				originalSize: "2",
				originalTriggerPx: "0",
				expectedSize: "1",
			}),
		).not.toBeNull();
	});

	it("expires only a currently awaiting action and reports whether the transition occurred", () => {
		const actions = getPendingTradingActionActions();
		const modification = actions.claimModification({
			env: "Mainnet",
			owner: OWNER,
			oid: 50,
			originalSize: "2",
			originalTriggerPx: "0",
			expectedSize: "1",
		});
		if (!modification) throw new Error("Expected modification claim");
		actions.markModificationAwaiting(modification.id, 1_000);
		actions.resolveModification(modification.id);
		expect(actions.expireModificationAwaiting(modification.id, 1_000 + TRADING_ACTION_CONFIRMATION_TIMEOUT_MS)).toBe(
			false,
		);

		const cancellation = actions.claimOrderCancellation({ env: "Mainnet", owner: OWNER, oids: [51] });
		if (!cancellation) throw new Error("Expected cancellation claim");
		actions.markOrderCancellationAwaiting(cancellation.id, 2_000);
		const awaitingCancellations = getPendingTradingActionSnapshot().orderCancellations;
		expect(
			actions.expireOrderCancellationAwaiting(cancellation.id, 2_000 + TRADING_ACTION_CONFIRMATION_TIMEOUT_MS - 1),
		).toBe(false);
		expect(getPendingTradingActionSnapshot().orderCancellations).toBe(awaitingCancellations);
		expect(
			actions.expireOrderCancellationAwaiting(cancellation.id, 2_000 + TRADING_ACTION_CONFIRMATION_TIMEOUT_MS),
		).toBe(true);
		expect(actions.expireOrderCancellationAwaiting(cancellation.id, Number.MAX_SAFE_INTEGER)).toBe(false);
		expect(getPendingTradingActionSnapshot().orderCancellations[0]).toMatchObject({
			phase: "unconfirmed",
			unconfirmedAt: 2_000 + TRADING_ACTION_CONFIRMATION_TIMEOUT_MS,
		});
	});
});
