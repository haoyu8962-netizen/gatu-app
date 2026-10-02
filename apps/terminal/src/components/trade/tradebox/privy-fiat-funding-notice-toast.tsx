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
 */
export function showPrivyFiatFundingNotice(
	notice: PrivyFiatFundingNotice,
	onClosed?: () => void,
): PrivyFiatFundingNoticePresentation {
	const presentation = createPrivyFiatFundingNoticePresentation(notice);
	function close() {
		if (!presentation.getSnapshot()) return;
		retractPrivyFiatFundingNotice(presentation);
		onClosed?.();
	}
	toast.custom(() => <PrivyFiatFundingNoticeCard presentation={presentation} onDismiss={close} />, {
		id: presentation.toastId,
		duration: isPersistentPrivyFiatFundingNotice(notice) ? Number.POSITIVE_INFINITY : FUNDS_OUTCOME_TOAST_DURATION_MS,
		dismissible: true,
		onDismiss: close,
		onAutoClose: close,
		className: "w-[var(--width)]",
	});
	return presentation;
}
