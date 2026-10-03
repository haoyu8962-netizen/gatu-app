import { toast } from "sonner";
import { FUNDS_OUTCOME_TOAST_DURATION_MS } from "@/config/time";
import {
	isPersistentPrivyFiatFundingNotice,
	type PrivyFiatFundingNotice,
} from "@/lib/trade/privy-fiat-funding-feedback";
import {
	createPrivyFiatFundingNoticePresentation,
	type PrivyFiatFundingNoticePresentation,
} from "@/lib/trade/privy-fiat-funding-notice-presentation";
import { PrivyFiatFundingNoticeCard } from "./privy-fiat-funding-notice-card";

/** Ends a presentation that its owner did not close: the content stops rendering before Sonner removes the toast. */
export function retractPrivyFiatFundingNotice(presentation: PrivyFiatFundingNoticePresentation): void {
	presentation.invalidate();
	toast.dismiss(presentation.toastId);
}

/**
 * Shows a card funding notice in the shared toast stack. The content checks the current identity
 * and the presentation each time it renders, so a toast that Sonner inserts after it was retracted
 * shows nothing and removes itself. `onClosed` runs once, only when the owner dismisses this
 * presentation or its time runs out: Sonner also reports a removal that the content or the host
 * asked for, and by then the presentation has already ended.
 *
 * A notice that closes on its own only counts its time while it is the front toast, the one a
 * collapsed stack shows; behind other toasts it waits. The content reports when that changes and
 * when another language changed its size, and publishing it again makes Sonner measure it again.
 * The duration passed to Sonner never changes while the notice counts, so Sonner keeps its own
 * record of the time that is left, including what it paused for a hover or a hidden page: a
 * language change can give a notice a fresh period but never a shorter one. The content reports
 * from an effect of the commit that inserted it, in which Sonner's Toaster has dropped its
 * subscription and not yet renewed it, so publishing again waits for a microtask.
 */
export function showPrivyFiatFundingNotice(
	notice: PrivyFiatFundingNotice,
	onClosed?: () => void,
): PrivyFiatFundingNoticePresentation {
	const presentation = createPrivyFiatFundingNoticePresentation(notice);
	const closesByItself = !isPersistentPrivyFiatFundingNotice(notice);
	let counting = false;
	let shownLocale: string | null = null;

	function close() {
		if (!presentation.getSnapshot()) return;
		retractPrivyFiatFundingNotice(presentation);
		onClosed?.();
	}

	function layOut(front: boolean, locale: string) {
		if (!presentation.getSnapshot()) return;
		const resized = shownLocale !== null && shownLocale !== locale;
		shownLocale = locale;
		if (counting === (front && closesByItself) && !resized) return;
		counting = front && closesByItself;
		queueMicrotask(() => {
			if (presentation.getSnapshot()) publish();
		});
	}

	function publish() {
		toast.custom(() => <PrivyFiatFundingNoticeCard presentation={presentation} onDismiss={close} onLayout={layOut} />, {
			id: presentation.toastId,
			duration: counting ? FUNDS_OUTCOME_TOAST_DURATION_MS : Number.POSITIVE_INFINITY,
			dismissible: true,
			onDismiss: close,
			onAutoClose: close,
			className: "w-[var(--width)]",
		});
	}

	publish();
	return presentation;
}
