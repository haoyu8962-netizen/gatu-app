const receipts = new WeakMap<object, number>();

/**
 * Lets a transport that hands a consumer a frame it received earlier (the order book pool's replay)
 * carry the original wall-clock receipt time to the store, so freshness is not re-granted at delivery.
 */
export function markFrameReceivedAt(frame: unknown, receivedAt: number): void {
	if (typeof frame !== "object" || frame === null) return;
	receipts.set(frame, receivedAt);
}

export function takeFrameReceivedAt(frame: unknown): number | undefined {
	if (typeof frame !== "object" || frame === null) return undefined;
	const receivedAt = receipts.get(frame);
	if (receivedAt !== undefined) receipts.delete(frame);
	return receivedAt;
}
