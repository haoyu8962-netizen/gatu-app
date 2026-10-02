import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { PrivyFiatFundingOutcome, PrivyFiatFundingWalletKind } from "@/domain/trade/privy-fiat-funding";
import type { Translate } from "@/lib/translate";

export interface PrivyFiatFundingFeedback {
	tone: "error" | "success" | "uncertain" | "warning";
	title: string;
	descriptionLines: string[];
	persistent: boolean;
}

const gasNote = msg`Depositing it needs a little ETH on Arbitrum for network fees.`;

/**
 * Card funding only reports what the provider flow told us: a confirmed or submitted purchase is
 * not USDC in the wallet, so no message claims arrival. Results that may follow a charge stay on
 * screen until dismissed, like the other funds actions with an unknown status. Cancelling is silent.
 */
export function getPrivyFiatFundingFeedback(
	outcome: PrivyFiatFundingOutcome,
	walletKind: PrivyFiatFundingWalletKind,
	translate: Translate,
): PrivyFiatFundingFeedback | null {
	const lines = (...descriptors: MessageDescriptor[]) =>
		[...descriptors, ...(walletKind === "external" ? [gasNote] : [])].map((descriptor) => translate(descriptor));

	switch (outcome) {
		case "confirmed":
			return {
				tone: "success",
				title: translate(msg`Card purchase confirmed`),
				descriptionLines: lines(msg`USDC is on its way to your wallet on Arbitrum. Open Deposit once it arrives.`),
				persistent: false,
			};
		case "submitted":
			return {
				tone: "uncertain",
				title: translate(msg`Card purchase submitted`),
				descriptionLines: lines(
					msg`The payment provider is still processing it. USDC arrives in your wallet on Arbitrum when it completes; then open Deposit.`,
				),
				persistent: true,
			};
		case "unknown":
			return {
				tone: "uncertain",
				title: translate(msg`Card purchase status unknown`),
				descriptionLines: lines(
					msg`If you paid, USDC arrives in your wallet on Arbitrum once the provider completes the purchase. Check the payment provider's email before trying again.`,
				),
				persistent: true,
			};
		case "busy":
			return {
				tone: "warning",
				title: translate(msg`A card purchase is already open. Finish or close it first.`),
				descriptionLines: [],
				persistent: false,
			};
		case "failed":
			return {
				tone: "error",
				title: translate(msg`Card purchase did not complete`),
				descriptionLines: [
					translate(msg`If you were charged, check the payment provider's email before trying again.`),
				],
				persistent: false,
			};
		case "cancelled":
			return null;
	}
}
