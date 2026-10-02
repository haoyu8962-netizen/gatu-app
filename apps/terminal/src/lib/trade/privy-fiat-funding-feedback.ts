import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { PrivyFiatFundingOutcome, PrivyFiatFundingWalletKind } from "@/domain/trade/privy-fiat-funding";
import type { Translate } from "@/lib/translate";

export interface PrivyFiatFundingFeedback {
	tone: "error" | "success" | "uncertain" | "warning";
	title: string;
	description: string | null;
}

const gasNote = msg`Depositing it needs a little ETH on Arbitrum for network fees.`;

/**
 * Card funding only reports what the provider flow told us: a confirmed or submitted purchase is
 * not USDC in the wallet, so neither message claims arrival. Cancelling the flow is silent.
 */
export function getPrivyFiatFundingFeedback(
	outcome: PrivyFiatFundingOutcome,
	walletKind: PrivyFiatFundingWalletKind,
	translate: Translate,
): PrivyFiatFundingFeedback | null {
	const withGasNote = (descriptor: MessageDescriptor) =>
		walletKind === "external" ? `${translate(descriptor)} ${translate(gasNote)}` : translate(descriptor);

	switch (outcome) {
		case "confirmed":
			return {
				tone: "success",
				title: translate(msg`Card purchase confirmed`),
				description: withGasNote(msg`USDC is on its way to your wallet on Arbitrum. Open Deposit once it arrives.`),
			};
		case "submitted":
			return {
				tone: "uncertain",
				title: translate(msg`Card purchase submitted`),
				description: withGasNote(
					msg`The payment provider is still processing it. USDC arrives in your wallet on Arbitrum when it completes; then open Deposit.`,
				),
			};
		case "busy":
			return {
				tone: "warning",
				title: translate(msg`A card purchase is already open. Finish or close it first.`),
				description: null,
			};
		case "failed":
			return {
				tone: "error",
				title: translate(msg`Card purchase did not complete`),
				description: translate(msg`If you were charged, check the payment provider's email before trying again.`),
			};
		case "unavailable":
			return {
				tone: "error",
				title: translate(msg`Card purchase could not open. Check your connection and try again.`),
				description: null,
			};
		case "cancelled":
			return null;
	}
}
