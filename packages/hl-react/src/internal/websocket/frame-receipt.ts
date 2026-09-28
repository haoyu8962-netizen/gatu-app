/**
 * When a frame was received, on both clocks: `receivedAt` is wall-clock time for display and for
 * consumers that compare it with `Date.now()`; `monotonicReceivedAt` is `performance.now()`, which a
 * system clock change cannot move, so staleness keeps counting after the clock is set back.
 */
export interface FrameReceipt {
	receivedAt: number;
	monotonicReceivedAt: number;
}

const receipts = new WeakMap<object, FrameReceipt>();

/**
 * Lets a transport that hands a consumer a frame it received earlier (the order book pool's replay)
 * carry the original receipt times to the store, so freshness is not re-granted at delivery.
 */
export function markFrameReceivedAt(frame: unknown, receivedAt: number, monotonicReceivedAt: number): void {
	if (typeof frame !== "object" || frame === null) return;
	receipts.set(frame, { receivedAt, monotonicReceivedAt });
}

export function takeFrameReceivedAt(frame: unknown): FrameReceipt | undefined {
	if (typeof frame !== "object" || frame === null) return undefined;
	const receipt = receipts.get(frame);
	if (receipt !== undefined) receipts.delete(frame);
	return receipt;
}

export function receiveFrameNow(): FrameReceipt {
	return { receivedAt: Date.now(), monotonicReceivedAt: performance.now() };
}
