import { beforeEach, describe, expect, it } from "vitest";
import {
	getNextTradingActionExpiryDelayMs,
	getPendingTradingActionActions,
	getPendingTradingActionSnapshot,
	TRADING_ACTION_CONFIRMATION_TIMEOUT_MS,
	wasReceivedAfter,
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

	it("times out an awaiting action on the monotonic clock after the system clock is set back", () => {
		const actions = getPendingTradingActionActions();
		const cancellation = actions.claimOrderCancellation({ env: "Mainnet", owner: OWNER, oids: [52] });
		if (!cancellation) throw new Error("Expected cancellation claim");
		const startedAt = 1_790_000_000_000;
		const rolledBackAt = startedAt - 60 * 60_000;
		actions.markOrderCancellationAwaiting(cancellation.id, startedAt, 1_000);
		const [awaiting] = getPendingTradingActionSnapshot().orderCancellations;
		if (!awaiting) throw new Error("Expected awaiting cancellation");

		expect(getNextTradingActionExpiryDelayMs([awaiting], rolledBackAt, 1_000 + 5_000)).toBe(
			TRADING_ACTION_CONFIRMATION_TIMEOUT_MS - 5_000,
		);
		expect(
			actions.expireOrderCancellationAwaiting(
				cancellation.id,
				rolledBackAt + TRADING_ACTION_CONFIRMATION_TIMEOUT_MS - 1,
				1_000 + TRADING_ACTION_CONFIRMATION_TIMEOUT_MS - 1,
			),
		).toBe(false);
		expect(
			actions.expireOrderCancellationAwaiting(
				cancellation.id,
				rolledBackAt + TRADING_ACTION_CONFIRMATION_TIMEOUT_MS,
				1_000 + TRADING_ACTION_CONFIRMATION_TIMEOUT_MS,
			),
		).toBe(true);
		expect(getPendingTradingActionSnapshot().orderCancellations[0]).toMatchObject({
			phase: "unconfirmed",
			unconfirmedAt: rolledBackAt + TRADING_ACTION_CONFIRMATION_TIMEOUT_MS,
			monotonicUnconfirmedAt: 1_000 + TRADING_ACTION_CONFIRMATION_TIMEOUT_MS,
		});
	});

	it("still times out an awaiting action when only the wall clock moved forward", () => {
		const actions = getPendingTradingActionActions();
		const modification = actions.claimModification({
			env: "Mainnet",
			owner: OWNER,
			oid: 53,
			originalSize: "2",
			originalTriggerPx: "0",
			expectedSize: "1",
		});
		if (!modification) throw new Error("Expected modification claim");
		actions.markModificationAwaiting(modification.id, 1_000, 1_000);

		expect(
			actions.expireModificationAwaiting(modification.id, 1_000 + TRADING_ACTION_CONFIRMATION_TIMEOUT_MS, 1_001),
		).toBe(true);
	});

	it("orders a frame after a local event only by their monotonic readings", () => {
		expect(wasReceivedAfter(1_001, 1_000)).toBe(true);
		expect(wasReceivedAfter(1_000, 1_000)).toBe(false);
		expect(wasReceivedAfter(999, 1_000)).toBe(false);
		expect(wasReceivedAfter(undefined, 1_000)).toBe(false);
		expect(wasReceivedAfter(1_001, null)).toBe(false);
	});
});
