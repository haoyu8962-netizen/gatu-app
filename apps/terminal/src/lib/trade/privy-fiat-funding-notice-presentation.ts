import type { PrivyFiatFundingNotice } from "@/lib/trade/privy-fiat-funding-feedback";

/**
 * One appearance of a card funding notice in the toast stack (docs/trading-notifications.md).
 * It ends when its owner closes it, when the host withdraws it or when its content finds another
 * identity on screen. Ending it is irreversible: a notice that is shown again gets a new
 * presentation and a new Sonner id, so a late callback or insertion of the old one cannot touch it.
 */
export interface PrivyFiatFundingNoticePresentation {
	readonly notice: PrivyFiatFundingNotice;
	readonly toastId: string;
	getSnapshot: () => boolean;
	subscribe: (listener: () => void) => () => void;
	invalidate: () => void;
}

let presentationSequence = 0;

export function createPrivyFiatFundingNoticePresentation(
	notice: PrivyFiatFundingNotice,
): PrivyFiatFundingNoticePresentation {
	let active = true;
	const listeners = new Set<() => void>();
	return {
		notice,
		toastId: `privy-fiat-funding:${++presentationSequence}`,
		getSnapshot: () => active,
		subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		invalidate() {
			if (!active) return;
			active = false;
			for (const listener of listeners) listener();
		},
	};
}
