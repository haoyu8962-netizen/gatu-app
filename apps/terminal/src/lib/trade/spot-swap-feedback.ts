import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { DEFAULT_SWAP_SLIPPAGE_BPS } from "@/domain/trade/swap";
import type { ActionFailure } from "@/lib/errors/action-error";
import { getOrderSubmissionFeedback, type OrderSubmissionFeedback } from "./order-submission-feedback";
import { classifyTradingActionError } from "./trading-action-failure";

export interface SpotSwapFeedback {
	kind: "spot-swap";
	code: "no-liquidity" | "failed";
}

export function getSpotSwapFeedback(cause: unknown): SpotSwapFeedback | OrderSubmissionFeedback | ActionFailure {
	const submissionFeedback = getOrderSubmissionFeedback(cause);
	if (submissionFeedback) return submissionFeedback;
	if (cause instanceof Error && cause.message.toLowerCase().includes("could not immediately match")) {
		return { kind: "spot-swap", code: "no-liquidity" };
	}
	return classifyTradingActionError(cause) ?? { kind: "spot-swap", code: "failed" };
}

export function formatSpotSwapFeedback(
	feedback: SpotSwapFeedback,
	translate: (descriptor: MessageDescriptor) => string,
): string {
	if (feedback.code === "failed") return translate(msg`Swap failed`);
	const slippagePercent = DEFAULT_SWAP_SLIPPAGE_BPS / 100;
	return translate(msg`No liquidity was available within the ${slippagePercent}% slippage limit.`);
}
