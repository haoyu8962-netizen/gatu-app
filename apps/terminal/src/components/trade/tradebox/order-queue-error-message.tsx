import { useLingui } from "@lingui/react/macro";
import { formatOrderReconciliationError } from "@/lib/trade/order-reconciliation-feedback";
import { formatOrderSubmissionFeedback } from "@/lib/trade/order-submission-feedback";
import { formatPositionSubmitFeedback } from "@/lib/trade/position-submit-feedback";
import { formatSpotSwapFeedback } from "@/lib/trade/spot-swap-feedback";
import type { OrderQueueItem } from "@/stores/use-order-queue-store";

interface Props {
	error: NonNullable<OrderQueueItem["error"]>;
}

export function OrderQueueErrorMessage({ error }: Props) {
	const { t } = useLingui();
	if (typeof error === "string") return error;
	if (!("kind" in error)) return t(error);
	if (error.kind === "spot-swap") return formatSpotSwapFeedback(error, (descriptor) => t(descriptor));
	if (error.kind === "order-reconciliation")
		return formatOrderReconciliationError(error.code, (descriptor) => t(descriptor));
	if (error.kind === "order-submission") return formatOrderSubmissionFeedback(error, (descriptor) => t(descriptor));
	return formatPositionSubmitFeedback(error, (descriptor) => t(descriptor));
}
