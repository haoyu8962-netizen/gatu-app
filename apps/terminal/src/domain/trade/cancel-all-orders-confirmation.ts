export type CancelAllConfirmationBlockReason = "orders-changed" | "session-changed" | "snapshot-not-ready";

export interface CancelAllConfirmationOrder {
	coin: string;
	oid: number;
}

export interface CancelAllConfirmationInput {
	owner: string;
	snapshotOwner: string | null | undefined;
	env: "Mainnet" | "Testnet";
	isSnapshotReady: boolean;
	orders: readonly CancelAllConfirmationOrder[];
}

export interface CancelAllConfirmationSnapshot {
	owner: string;
	env: "Mainnet" | "Testnet";
	orderKeys: readonly string[];
}

export type CancelAllConfirmationResult =
	| { status: "ready"; snapshot: CancelAllConfirmationSnapshot }
	| { status: "blocked"; reason: CancelAllConfirmationBlockReason };

function normalizeOwner(owner: string | null | undefined): string | null {
	if (!owner || owner === "disconnected") return null;
	return owner.toLowerCase();
}

function getOrderKeys(orders: readonly CancelAllConfirmationOrder[]): string[] | null {
	if (orders.length === 0) return null;

	const keys = orders.map((order) => `${order.coin}\u0000${order.oid}`).sort();
	return new Set(keys).size === keys.length ? keys : null;
}

export function createCancelAllConfirmationSnapshot(input: CancelAllConfirmationInput): CancelAllConfirmationResult {
	const owner = normalizeOwner(input.owner);
	const snapshotOwner = normalizeOwner(input.snapshotOwner);
	if (!owner || owner !== snapshotOwner) return { status: "blocked", reason: "session-changed" };
	if (!input.isSnapshotReady) return { status: "blocked", reason: "snapshot-not-ready" };

	const orderKeys = getOrderKeys(input.orders);
	if (!orderKeys) return { status: "blocked", reason: "orders-changed" };

	return {
		status: "ready",
		snapshot: { owner, env: input.env, orderKeys },
	};
}

export function validateCancelAllConfirmationSnapshot(
	snapshot: CancelAllConfirmationSnapshot,
	input: CancelAllConfirmationInput,
): CancelAllConfirmationBlockReason | null {
	const current = createCancelAllConfirmationSnapshot(input);
	if (current.status === "blocked") return current.reason;
	if (current.snapshot.owner !== snapshot.owner || current.snapshot.env !== snapshot.env) return "session-changed";
	if (
		current.snapshot.orderKeys.length !== snapshot.orderKeys.length ||
		current.snapshot.orderKeys.some((key, index) => key !== snapshot.orderKeys[index])
	) {
		return "orders-changed";
	}
	return null;
}
