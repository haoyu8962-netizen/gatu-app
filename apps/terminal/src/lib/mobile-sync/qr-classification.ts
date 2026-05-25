import { MOBILE_SYNC_FRAGMENT_KEY } from "./sync-core";

export type QrClassification =
	| { type: "walletconnect"; uri: string }
	| { type: "phoneAccessLink"; url: string }
	| { type: "unsupported"; value: string };

export type QrFeedbackThrottleState = {
	atMs: number;
	message: string;
};

export function classifyQrValue(value: string): QrClassification {
	const trimmed = value.trim();

	if (trimmed.startsWith("wc:")) {
		return { type: "walletconnect", uri: trimmed };
	}

	if (isPhoneAccessLink(trimmed)) {
		return { type: "phoneAccessLink", url: trimmed };
	}

	return { type: "unsupported", value: trimmed };
}

export function shouldShowQrFeedback(
	lastFeedback: QrFeedbackThrottleState | null,
	message: string,
	nowMs: number,
	throttleMs: number,
): boolean {
	return lastFeedback?.message !== message || nowMs - lastFeedback.atMs >= throttleMs;
}

function isPhoneAccessLink(value: string): boolean {
	if (!value.includes(`#${MOBILE_SYNC_FRAGMENT_KEY}=`)) return false;

	try {
		const url = new URL(value);
		return new URLSearchParams(url.hash.slice(1)).has(MOBILE_SYNC_FRAGMENT_KEY);
	} catch {
		return false;
	}
}
