import { MOBILE_SYNC_FRAGMENT_KEY, MOBILE_SYNC_ROUTE_PATH } from "./sync-core";

export type QrClassification =
	| { type: "walletconnect"; uri: string }
	| { type: "phoneAccessLink"; url: string }
	| { type: "unsupported" };

export type QrFeedbackThrottleState = {
	atMs: number;
	message: string;
};

export function classifyQrValue(value: string, expectedOrigin?: string): QrClassification {
	const trimmed = value.trim();

	if (trimmed.startsWith("wc:")) {
		return { type: "walletconnect", uri: trimmed };
	}

	if (isPhoneAccessLink(trimmed, expectedOrigin)) {
		return { type: "phoneAccessLink", url: trimmed };
	}

	return { type: "unsupported" };
}

export function shouldShowQrFeedback(
	lastFeedback: QrFeedbackThrottleState | null,
	message: string,
	nowMs: number,
	throttleMs: number,
): boolean {
	return lastFeedback?.message !== message || nowMs - lastFeedback.atMs >= throttleMs;
}

function isPhoneAccessLink(value: string, expectedOrigin?: string): boolean {
	if (!value.includes(`#${MOBILE_SYNC_FRAGMENT_KEY}=`)) return false;

	try {
		const url = new URL(value);
		if (url.protocol !== "https:" && url.protocol !== "http:") return false;
		if (url.pathname !== MOBILE_SYNC_ROUTE_PATH) return false;
		if (expectedOrigin && url.origin !== new URL(expectedOrigin).origin) return false;

		return new URLSearchParams(url.hash.slice(1)).has(MOBILE_SYNC_FRAGMENT_KEY);
	} catch {
		return false;
	}
}
