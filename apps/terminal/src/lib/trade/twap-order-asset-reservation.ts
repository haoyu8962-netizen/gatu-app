import {
	TWAP_RECONCILIATION_CONFIRMATION_WINDOW_MS,
	TWAP_RECONCILIATION_MAX_AGE_MS,
	type TwapIntent,
} from "@/domain/trade/twap";
import {
	clearOrderAssetReservations,
	type OrderAssetLockIdentity,
	type OrderAssetLockLease,
	type OrderAssetReservationIntent,
	releaseOrderAssetReservations,
	reserveOrderAssets,
	runWithOrderAssetLocks,
} from "@/lib/trade/order-asset-lock";

const ACTIVE_TWAP_RESERVATION_PREFIX = "active-twap";

export function getTwapOrderAssetReservationIntent(intent: TwapIntent): OrderAssetReservationIntent {
	return {
		intentKey: [
			"twap",
			intent.assetId,
			intent.coin,
			intent.side,
			intent.size,
			intent.minutes,
			intent.reduceOnly ? "reduce" : "increase",
			intent.randomize ? "random" : "linear",
		].join(":"),
		exclusiveAssetLock: false,
		isRiskReducing: intent.reduceOnly,
	};
}

export function getActiveTwapReservationId(twapId: number): string {
	if (!Number.isSafeInteger(twapId) || twapId < 0) throw new Error("Invalid active TWAP ID");
	return `${ACTIVE_TWAP_RESERVATION_PREFIX}:${twapId}`;
}

export function promoteTwapReservationToActive(
	lease: OrderAssetLockLease,
	input: {
		intent: TwapIntent;
		pendingSubmissionId: string;
		twapId: number;
		startedAt: number;
	},
): boolean {
	const now = Date.now();
	const activeSubmissionId = getActiveTwapReservationId(input.twapId);
	const reserved = reserveOrderAssets(lease, {
		...getTwapOrderAssetReservationIntent(input.intent),
		submissionId: activeSubmissionId,
		createdAt: normalizeStartedAt(input.startedAt, now),
		expiresAt: getActiveTwapReservationExpiry(input.startedAt, input.intent.minutes, now),
	});
	if (!reserved) return false;
	clearOrderAssetReservations(lease, input.pendingSubmissionId);
	return true;
}

export async function reconcileTwapOrderAssetReservation(input: {
	identity: OrderAssetLockIdentity;
	intent: TwapIntent;
	pendingSubmissionId: string;
	active?: { twapId: number; startedAt: number };
}): Promise<boolean> {
	if (!input.active) {
		return releaseOrderAssetReservations(input.identity, input.pendingSubmissionId);
	}
	const active = input.active;

	try {
		const result = await runWithOrderAssetLocks(input.identity, async (lease) =>
			promoteTwapReservationToActive(lease, {
				intent: input.intent,
				pendingSubmissionId: input.pendingSubmissionId,
				twapId: active.twapId,
				startedAt: active.startedAt,
			}),
		);
		return result.supported && result.value;
	} catch {
		return false;
	}
}

export async function releaseActiveTwapOrderAssetReservation(
	identity: OrderAssetLockIdentity,
	twapId: number,
): Promise<boolean> {
	return releaseOrderAssetReservations(identity, getActiveTwapReservationId(twapId));
}

function getActiveTwapReservationExpiry(startedAt: number, minutes: number, now: number): number {
	const normalizedStartedAt = normalizeStartedAt(startedAt, now);
	const durationMs =
		Number.isSafeInteger(minutes) && minutes > 0
			? Math.min(minutes * 60_000, TWAP_RECONCILIATION_MAX_AGE_MS)
			: TWAP_RECONCILIATION_MAX_AGE_MS;
	const estimatedExpiry = normalizedStartedAt + durationMs + TWAP_RECONCILIATION_CONFIRMATION_WINDOW_MS;
	const minimumExpiry = now + TWAP_RECONCILIATION_CONFIRMATION_WINDOW_MS;
	const maximumExpiry = now + TWAP_RECONCILIATION_MAX_AGE_MS + TWAP_RECONCILIATION_CONFIRMATION_WINDOW_MS;
	return Math.min(Math.max(estimatedExpiry, minimumExpiry), maximumExpiry);
}

function normalizeStartedAt(startedAt: number, now: number): number {
	if (!Number.isSafeInteger(startedAt) || startedAt < 0) return now;
	return Math.min(startedAt, now + TWAP_RECONCILIATION_CONFIRMATION_WINDOW_MS);
}
