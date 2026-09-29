import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import Big from "big.js";
import type { Address } from "viem";
import {
	ARBITRUM_CCTP_DOMAIN,
	CCTP_AUTOMATIC_FORWARDING_DATA,
	CCTP_MINIMUM_FEE_MULTIPLIER,
	CCTP_WITHDRAWAL_GAS_LIMIT,
	LEGACY_MINIMUM_WITHDRAWAL_USDC,
	LEGACY_WITHDRAWAL_FEE_USDC,
} from "@/config/cctp";
import { fundsActionFeedbackCause } from "@/lib/trade/funds-action-feedback";

export type WithdrawalRoute = "arbitrum-cctp" | "arbitrum-legacy";
export type WithdrawalSourceDex = "" | "spot";

export interface WithdrawalValidation {
	valid: boolean;
	error: string | null;
}

interface WithdrawalValidationInput {
	amount: string;
	available: string;
	route: WithdrawalRoute;
	routeFee: string | null;
	activationFee: string;
}

interface CctpWithdrawalInput {
	amount: string;
	destination: Address;
	sourceDex: WithdrawalSourceDex;
}

export interface CctpWithdrawalParameters {
	token: "USDC";
	amount: string;
	sourceDex: WithdrawalSourceDex;
	destinationRecipient: Address;
	addressEncoding: "hex";
	destinationChainId: typeof ARBITRUM_CCTP_DOMAIN;
	gasLimit: typeof CCTP_WITHDRAWAL_GAS_LIMIT;
	data: typeof CCTP_AUTOMATIC_FORWARDING_DATA;
}

function toUnsignedBig(value: string): Big | null {
	try {
		const parsed = new Big(value);
		return parsed.gte(0) ? parsed : null;
	} catch {
		return null;
	}
}

export function getWithdrawalRouteFee(route: WithdrawalRoute, cctpFee: string | null): string | null {
	return route === "arbitrum-legacy" ? LEGACY_WITHDRAWAL_FEE_USDC : cctpFee;
}

export function assertWithdrawalRouteFeeMatchesReview(
	reviewedFee: string,
	currentFee: string | null | undefined,
): void {
	const reviewed = toUnsignedBig(reviewedFee);
	const current = currentFee == null ? null : toUnsignedBig(currentFee);
	if (!reviewed || !current) throw fundsActionFeedbackCause("withdrawal-fee-unavailable");
	if (!current.eq(reviewed)) throw fundsActionFeedbackCause("withdrawal-fee-changed");
}

export function getMinimumWithdrawal(route: WithdrawalRoute, routeFee: string | null): string | null {
	if (route === "arbitrum-legacy") return LEGACY_MINIMUM_WITHDRAWAL_USDC;
	if (routeFee === null) return null;
	const fee = toUnsignedBig(routeFee);
	return fee ? fee.times(CCTP_MINIMUM_FEE_MULTIPLIER).toFixed() : null;
}

export function getMaximumWithdrawal(available: string, activationFee: string): string {
	const availableAmount = toUnsignedBig(available);
	const activation = toUnsignedBig(activationFee);
	if (!availableAmount || !activation) return "0";
	const maximum = availableAmount.minus(activation);
	return maximum.gt(0) ? maximum.toFixed() : "0";
}

export function getWithdrawalNetReceived(amount: string, routeFee: string | null): string | null {
	const withdrawalAmount = toUnsignedBig(amount);
	const fee = routeFee === null ? null : toUnsignedBig(routeFee);
	if (!withdrawalAmount || !fee || withdrawalAmount.lte(0)) return null;
	const received = withdrawalAmount.minus(fee);
	return received.gt(0) ? received.toFixed() : "0";
}

export function isPositiveDecimal(value: string): boolean {
	return toUnsignedBig(value)?.gt(0) ?? false;
}

export function isWithdrawalRoute(value: string | null): value is WithdrawalRoute {
	return value === "arbitrum-cctp" || value === "arbitrum-legacy";
}

export function getWithdrawalSourceDex(usesSpotStateForPerps: boolean): WithdrawalSourceDex {
	return usesSpotStateForPerps ? "spot" : "";
}

export function validateWithdrawal(
	{ amount, available, route, routeFee, activationFee }: WithdrawalValidationInput,
	translate: (message: MessageDescriptor) => string,
): WithdrawalValidation {
	if (!amount || amount === "0") return { valid: false, error: null };
	const withdrawalAmount = toUnsignedBig(amount);
	if (!withdrawalAmount || withdrawalAmount.lte(0)) return { valid: false, error: translate(msg`Invalid amount`) };

	const minimum = getMinimumWithdrawal(route, routeFee);
	if (minimum === null) return { valid: false, error: null };
	if (withdrawalAmount.lt(minimum)) {
		return { valid: false, error: translate(msg`Minimum withdrawal is $${minimum}`) };
	}

	const availableAmount = toUnsignedBig(available);
	const activation = toUnsignedBig(activationFee);
	if (!availableAmount || !activation)
		return { valid: false, error: translate(msg`Unable to verify available balance`) };
	if (withdrawalAmount.plus(activation).gt(availableAmount)) {
		return { valid: false, error: translate(msg`Insufficient balance`) };
	}

	return { valid: true, error: null };
}

export function buildCctpWithdrawalParameters({
	amount,
	destination,
	sourceDex,
}: CctpWithdrawalInput): CctpWithdrawalParameters {
	return {
		token: "USDC",
		amount,
		sourceDex,
		destinationRecipient: destination,
		addressEncoding: "hex",
		destinationChainId: ARBITRUM_CCTP_DOMAIN,
		gasLimit: CCTP_WITHDRAWAL_GAS_LIMIT,
		data: CCTP_AUTOMATIC_FORWARDING_DATA,
	};
}
