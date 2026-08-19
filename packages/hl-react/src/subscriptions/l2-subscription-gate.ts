import type { ISubscriptionTransport } from "@nktkas/hyperliquid";
import { L2BookStreamError, type L2SubscriptionPayload } from "./l2";

interface CoinGate {
	activePayloadKey: string | undefined;
	activeLeases: number;
	available: Promise<void> | undefined;
	resolveAvailable: (() => void) | undefined;
	pendingGeneration: number;
	pendingPayloadKey: string | undefined;
	closeBarrier: Promise<void> | undefined;
	closeError: unknown;
}

interface L2SubscriptionGateLease {
	release: (unsubscribe: () => Promise<void>) => Promise<void>;
}

const transportGates = new WeakMap<ISubscriptionTransport, Map<string, CoinGate>>();
const L2_SUBSCRIPTION_GATE_TIMEOUT_MS = 5_000;

function getCoinGates(transport: ISubscriptionTransport): Map<string, CoinGate> {
	let gates = transportGates.get(transport);
	if (!gates) {
		gates = new Map();
		transportGates.set(transport, gates);
	}
	return gates;
}

export async function acquireL2SubscriptionGate(
	transport: ISubscriptionTransport,
	payload: L2SubscriptionPayload,
): Promise<L2SubscriptionGateLease> {
	return acquireL2SubscriptionGateBefore(transport, payload, Date.now() + L2_SUBSCRIPTION_GATE_TIMEOUT_MS);
}

async function acquireL2SubscriptionGateBefore(
	transport: ISubscriptionTransport,
	payload: L2SubscriptionPayload,
	deadlineAt: number,
): Promise<L2SubscriptionGateLease> {
	const gates = getCoinGates(transport);
	const existing = gates.get(payload.c);
	if (existing?.closeError !== undefined) {
		throw new L2BookStreamError("unsubscribe_failed", { cause: existing.closeError });
	}

	const payloadKey = JSON.stringify(payload);
	if (existing && (existing.closeBarrier || (existing.activeLeases > 0 && existing.activePayloadKey !== payloadKey))) {
		if (!existing.available) throw new L2BookStreamError("subscription_conflict");
		if (existing.pendingPayloadKey !== payloadKey) {
			existing.pendingGeneration += 1;
			existing.pendingPayloadKey = payloadKey;
		}
		const pendingGeneration = existing.pendingGeneration;
		await waitUntilAvailable(existing.available, deadlineAt);
		if (existing.pendingGeneration !== pendingGeneration) {
			throw new L2BookStreamError("subscription_conflict");
		}
		return acquireL2SubscriptionGateBefore(transport, payload, deadlineAt);
	}

	const gate = existing ?? {
		activePayloadKey: undefined,
		activeLeases: 0,
		available: undefined,
		resolveAvailable: undefined,
		pendingGeneration: 0,
		pendingPayloadKey: undefined,
		closeBarrier: undefined,
		closeError: undefined,
	};
	if (gate.activeLeases === 0) {
		gate.activePayloadKey = payloadKey;
		gate.available = new Promise<void>((resolve) => {
			gate.resolveAvailable = resolve;
		});
	}
	gate.activeLeases += 1;
	gates.set(payload.c, gate);

	let released = false;
	return {
		release: (unsubscribe) => {
			if (released) return Promise.resolve();
			released = true;

			let closePromise: Promise<void>;
			try {
				closePromise = unsubscribe();
			} catch (error) {
				closePromise = Promise.reject(error);
			}

			gate.activeLeases = Math.max(0, gate.activeLeases - 1);
			if (gate.activeLeases === 0) {
				gate.activePayloadKey = undefined;
				gate.closeBarrier = closePromise;
				const settleAvailability = () => {
					gate.closeBarrier = undefined;
					gate.resolveAvailable?.();
					gate.resolveAvailable = undefined;
					gate.available = undefined;
				};
				closePromise.then(
					() => {
						if (gates.get(payload.c) === gate && gate.activeLeases === 0) gates.delete(payload.c);
						settleAvailability();
					},
					(error: unknown) => {
						if (gates.get(payload.c) === gate) gate.closeError = error;
						settleAvailability();
					},
				);
			}
			return closePromise;
		},
	};
}

function waitUntilAvailable(available: Promise<void>, deadlineAt: number): Promise<void> {
	const remainingMs = deadlineAt - Date.now();
	if (remainingMs <= 0) return Promise.reject(new L2BookStreamError("subscription_conflict"));

	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => reject(new L2BookStreamError("subscription_conflict")), remainingMs);
		available.then(
			() => {
				clearTimeout(timeout);
				resolve();
			},
			(error: unknown) => {
				clearTimeout(timeout);
				reject(new L2BookStreamError("unsubscribe_failed", { cause: error }));
			},
		);
	});
}

export function resetL2SubscriptionGateAfterDisconnect(transport: ISubscriptionTransport, coin: string): void {
	const gates = transportGates.get(transport);
	const gate = gates?.get(coin);
	if (!gates || !gate || gate.activeLeases > 0) return;
	gates.delete(coin);
	gate.closeBarrier = undefined;
	gate.closeError = undefined;
	gate.resolveAvailable?.();
	gate.resolveAvailable = undefined;
	gate.available = undefined;
}
