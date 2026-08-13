import {
	type ApiWalletAgentTuple,
	type ApiWalletApproval,
	type ApiWalletRemoval,
	isApiWalletExtraAgentSnapshot,
	isApiWalletRemovalReconciled,
	matchesApiWalletApproval,
} from "./api-wallet-state";

const RECONCILIATION_ATTEMPTS = 8;
const RECONCILIATION_INTERVAL_MS = 1_000;

export type ApiWalletReconciliationTarget =
	| { kind: "authorize"; approval: ApiWalletApproval }
	| { kind: "remove"; removal: ApiWalletRemoval };

export type ApiWalletReconciliationResult =
	| { status: "success" }
	| { status: "unknown"; reason: "conflict" | "notVisible" | "unavailable" };

export interface ApiWalletSnapshotResult {
	data?: unknown;
	error?: unknown;
}

interface ReconciliationOptions {
	loadSnapshot: () => Promise<ApiWalletSnapshotResult>;
	signal: AbortSignal;
	target: ApiWalletReconciliationTarget;
	attempts?: number;
	intervalMs?: number;
	wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
}

export async function reconcileApiWalletAction({
	loadSnapshot,
	signal,
	target,
	attempts = RECONCILIATION_ATTEMPTS,
	intervalMs = RECONCILIATION_INTERVAL_MS,
	wait = waitForReconciliation,
}: ReconciliationOptions): Promise<ApiWalletReconciliationResult> {
	let observedSnapshot = false;
	for (let attempt = 0; attempt < attempts; attempt += 1) {
		throwIfAborted(signal);
		const snapshot = await loadSnapshot();
		throwIfAborted(signal);
		if (isApiWalletExtraAgentSnapshot(snapshot.data) && snapshot.error == null) {
			observedSnapshot = true;
			if (
				target.kind === "authorize" &&
				snapshot.data.some((agent) => matchesApiWalletApproval(agent, target.approval))
			) {
				return { status: "success" };
			}
			if (target.kind === "remove") {
				if (isApiWalletRemovalReconciled(snapshot.data, target.removal)) return { status: "success" };
				if (hasConflictingReplacement(snapshot.data, target.removal)) {
					return { status: "unknown", reason: "conflict" };
				}
			}
		}
		if (attempt + 1 < attempts) await wait(intervalMs, signal);
	}

	return { status: "unknown", reason: observedSnapshot ? "notVisible" : "unavailable" };
}

function hasConflictingReplacement(agents: readonly ApiWalletAgentTuple[], removal: ApiWalletRemoval): boolean {
	const oldAddressPresent = agents.some(
		(agent) => agent.address.toLowerCase() === removal.target.address.toLowerCase(),
	);
	if (oldAddressPresent) return false;
	return agents.some(
		(agent) =>
			agent.name === removal.target.name && agent.address.toLowerCase() !== removal.target.address.toLowerCase(),
	);
}

function waitForReconciliation(milliseconds: number, signal: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		const timeout = window.setTimeout(resolve, milliseconds);
		const abort = () => {
			window.clearTimeout(timeout);
			reject(new DOMException("API wallet verification was cancelled.", "AbortError"));
		};
		if (signal.aborted) abort();
		else signal.addEventListener("abort", abort, { once: true });
	});
}

function throwIfAborted(signal: AbortSignal): void {
	if (signal.aborted) throw new DOMException("API wallet verification was cancelled.", "AbortError");
}
