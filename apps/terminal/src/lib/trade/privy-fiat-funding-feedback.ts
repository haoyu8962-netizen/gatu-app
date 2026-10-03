import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type {
	PrivyFiatFundingNetwork,
	PrivyFiatFundingOutcome,
	PrivyFiatFundingWalletKind,
} from "@/domain/trade/privy-fiat-funding";
import {
	STATUS_GLYPH_ERROR,
	STATUS_GLYPH_SUCCESS,
	STATUS_GLYPH_UNKNOWN,
	STATUS_GLYPH_WARNING,
	type StatusGlyphDefinition,
} from "@/lib/brand/status-glyph.gen";
import type { Translate } from "@/lib/translate";

/**
 * Besides the outcomes of a provider flow, two reasons why none started: `unavailable`, the
 * purchase window could not be loaded, and `wallet-changed`, the session could no longer pay out
 * to the wallet the purchase was requested for.
 */
export type PrivyFiatFundingNoticeKind =
	| Exclude<PrivyFiatFundingOutcome, "cancelled">
	| "unavailable"
	| "wallet-changed";

/**
 * What a card purchase attempt has to tell its owner. It is stored as semantics (the owner and
 * network that started the attempt, the result and the wallet kind) and translated when rendered.
 */
export interface PrivyFiatFundingNotice {
	readonly kind: PrivyFiatFundingNoticeKind;
	readonly network: PrivyFiatFundingNetwork;
	readonly ownerKey: string;
	readonly walletKind: PrivyFiatFundingWalletKind;
}

export type PrivyFiatFundingFeedbackTone = "error" | "success" | "uncertain" | "warning";

export interface PrivyFiatFundingFeedback {
	tone: PrivyFiatFundingFeedbackTone;
	title: string;
	descriptionLines: string[];
}

const TONE_BY_KIND: Record<PrivyFiatFundingNoticeKind, PrivyFiatFundingFeedbackTone> = {
	busy: "warning",
	confirmed: "success",
	failed: "error",
	submitted: "uncertain",
	unavailable: "error",
	unknown: "uncertain",
	"wallet-changed": "error",
};

const GLYPH_BY_TONE: Record<PrivyFiatFundingFeedbackTone, StatusGlyphDefinition> = {
	error: STATUS_GLYPH_ERROR,
	success: STATUS_GLYPH_SUCCESS,
	uncertain: STATUS_GLYPH_UNKNOWN,
	warning: STATUS_GLYPH_WARNING,
};

const gasNote = msg`Depositing it needs a little ETH on Arbitrum for network fees.`;
const sandboxNote = msg`This was a sandbox test: no card was charged and no USDC will arrive.`;

/**
 * A result that may follow a real charge stays on screen until its owner dismisses it, like the
 * other funds actions with an unknown status. The testnet flag runs the provider sandbox, which
 * moves no funds, so nothing there needs to be kept.
 */
export function isPersistentPrivyFiatFundingNotice(notice: PrivyFiatFundingNotice): boolean {
	return notice.network === "mainnet" && TONE_BY_KIND[notice.kind] === "uncertain";
}

export function getPrivyFiatFundingNoticeGlyph(notice: PrivyFiatFundingNotice): StatusGlyphDefinition {
	return GLYPH_BY_TONE[TONE_BY_KIND[notice.kind]];
}

/**
 * Card funding only reports what the provider flow told us: a confirmed or submitted purchase is
 * not USDC in the wallet, so no message claims arrival, and a sandbox purchase says that nothing
 * was charged or sent instead of pointing to a deposit that cannot follow.
 */
export function getPrivyFiatFundingFeedback(
	notice: PrivyFiatFundingNotice,
	translate: Translate,
): PrivyFiatFundingFeedback {
	const tone = TONE_BY_KIND[notice.kind];
	function lines(...descriptors: MessageDescriptor[]): string[] {
		if (notice.network === "testnet") return [translate(sandboxNote)];
		return descriptors.map((descriptor) => translate(descriptor));
	}
	const arrivalLines = (descriptor: MessageDescriptor) =>
		lines(descriptor, ...(notice.walletKind === "external" ? [gasNote] : []));

	switch (notice.kind) {
		case "confirmed":
			return {
				tone,
				title: translate(msg`Card purchase confirmed`),
				descriptionLines: arrivalLines(
					msg`USDC is on its way to your wallet on Arbitrum. Open Deposit once it arrives.`,
				),
			};
		case "submitted":
			return {
				tone,
				title: translate(msg`Card purchase submitted`),
				descriptionLines: arrivalLines(
					msg`The payment provider is still processing it. USDC arrives in your wallet on Arbitrum when it completes; then open Deposit.`,
				),
			};
		case "unknown":
			return {
				tone,
				title: translate(msg`Card purchase status unknown`),
				descriptionLines: arrivalLines(
					msg`If you paid, USDC arrives in your wallet on Arbitrum once the provider completes the purchase. Check the payment provider's email before trying again.`,
				),
			};
		case "failed":
			return {
				tone,
				title: translate(msg`Card purchase did not complete`),
				descriptionLines: lines(msg`If you were charged, check the payment provider's email before trying again.`),
			};
		case "busy":
			return {
				tone,
				title: translate(msg`An earlier card purchase is still open on this page. Reload the page, then try again.`),
				descriptionLines: [],
			};
		case "unavailable":
			return {
				tone,
				title: translate(msg`Card purchase could not open. Check your connection and try again.`),
				descriptionLines: [],
			};
		case "wallet-changed":
			return {
				tone,
				title: translate(
					msg`Your wallet session changed, so the card purchase did not open. Reconnect your wallet and try again.`,
				),
				descriptionLines: [],
			};
	}
}
