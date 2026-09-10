import { t } from "@lingui/core/macro";
import { useState } from "react";
import { toast } from "sonner";
import type { OrderConfirmationDraft } from "@/domain/trade/order-confirmation";
import { getSkipOrderConfirmation, useGlobalSettingsActions } from "@/stores/use-global-settings-store";

export interface PendingOrderConfirmation<T> {
	input: T;
	draft: OrderConfirmationDraft;
}

export interface UseOrderConfirmationOptions<T> {
	execute: (input: T) => Promise<void>;
	canExecute: (input: T) => boolean;
}

export interface UseOrderConfirmationResult<T> {
	pending: PendingOrderConfirmation<T> | null;
	isConfirming: boolean;
	dontShowAgain: boolean;
	setDontShowAgain: (next: boolean) => void;
	requestSubmit: (input: T, draft: OrderConfirmationDraft) => Promise<void>;
	confirm: () => Promise<void>;
	cancel: () => void;
}

/**
 * The single interception point between an order-entry surface and its submitter.
 * A saved preference skips presentation only. The review window is an unbounded human pause,
 * so `canExecute` re-asserts the request-path gates (region, connection, availability, validation,
 * live mark price) before the order is replayed, and the surface re-derives its live execution
 * price at confirm time so the exchange guard still compares two prices from the same instant.
 */
export function useOrderConfirmation<T>({
	execute,
	canExecute,
}: UseOrderConfirmationOptions<T>): UseOrderConfirmationResult<T> {
	const { setSkipOrderConfirmation } = useGlobalSettingsActions();
	const [pending, setPending] = useState<PendingOrderConfirmation<T> | null>(null);
	const [dontShowAgain, setDontShowAgain] = useState(false);
	const [isConfirming, setIsConfirming] = useState(false);

	async function requestSubmit(input: T, draft: OrderConfirmationDraft) {
		if (!canExecute(input)) {
			rejectChangedOrder();
			return;
		}
		if (getSkipOrderConfirmation()) {
			await execute(input);
			return;
		}
		setDontShowAgain(false);
		setPending({ input, draft });
	}

	async function confirm() {
		if (!pending || isConfirming) return;
		if (!canExecute(pending.input)) {
			rejectChangedOrder();
			return;
		}
		if (dontShowAgain) setSkipOrderConfirmation(true);
		setIsConfirming(true);
		try {
			await execute(pending.input);
		} finally {
			setIsConfirming(false);
			setDontShowAgain(false);
			setPending(null);
		}
	}

	function cancel() {
		if (isConfirming) return;
		setDontShowAgain(false);
		setPending(null);
	}

	function rejectChangedOrder() {
		setDontShowAgain(false);
		setPending(null);
		toast.error(t`Order conditions changed before it was confirmed. Review the order and submit it again.`);
	}

	return { pending, isConfirming, dontShowAgain, setDontShowAgain, requestSubmit, confirm, cancel };
}
