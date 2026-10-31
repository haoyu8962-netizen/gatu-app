import { t } from "@lingui/core/macro";
import { TWAP_MIN_NOTIONAL_USD, TWAP_MINUTES_MAX, TWAP_MINUTES_MIN } from "@/config/trade";
import { isPositive, toBig } from "@/lib/trade/numbers";
import type { Side } from "@/lib/trade/types";
import { createValidator, type Validator } from "../types";

export interface TwapContext {
	twapOrder: boolean;
	twapMinutesNum: number | null;
	twapTriggerPriceNum: number | null;
	twapStopPriceNum: number | null;
	orderValue: number;
	side: Side;
	markPx: number;
}

export const twapMinutesRangeValidator: Validator<TwapContext> = createValidator({
	id: "twap-minutes-range",
	code: "TWAP_001",
	category: "twap",
	priority: 50,
	getMessage: () => t`TWAP minutes must be ${TWAP_MINUTES_MIN}-${TWAP_MINUTES_MAX}`,
	validate: (ctx) => {
		if (!ctx.twapOrder) return true;
		const minutes = ctx.twapMinutesNum;
		return (
			minutes !== null && Number.isSafeInteger(minutes) && minutes >= TWAP_MINUTES_MIN && minutes <= TWAP_MINUTES_MAX
		);
	},
});

export const twapMinNotionalValidator: Validator<TwapContext> = createValidator({
	id: "twap-min-notional",
	code: "TWAP_002",
	category: "twap",
	priority: 51,
	getMessage: () => t`TWAP order value must be at least $${TWAP_MIN_NOTIONAL_USD}.`,
	validate: (ctx) => {
		if (!ctx.twapOrder) return true;
		const orderValue = toBig(ctx.orderValue);
		if (!orderValue?.gt(0)) return true;
		return orderValue.gte(TWAP_MIN_NOTIONAL_USD);
	},
});

export const twapTriggerPricePositiveValidator: Validator<TwapContext> = createValidator({
	id: "twap-trigger-price-positive",
	code: "TWAP_003",
	category: "twap",
	priority: 52,
	getMessage: () => t`Enter a valid trigger price`,
	validate: (ctx) => {
		if (!ctx.twapOrder || ctx.twapTriggerPriceNum === null) return true;
		return isPositive(ctx.twapTriggerPriceNum);
	},
});

export const twapStopPricePositiveValidator: Validator<TwapContext> = createValidator({
	id: "twap-stop-price-positive",
	code: "TWAP_004",
	category: "twap",
	priority: 53,
	getMessage: (ctx) => (ctx.side === "buy" ? t`Enter a valid max price` : t`Enter a valid min price`),
	validate: (ctx) => {
		if (!ctx.twapOrder || ctx.twapStopPriceNum === null) return true;
		return isPositive(ctx.twapStopPriceNum);
	},
});

export const twapTriggerDiffersFromMarkValidator: Validator<TwapContext> = createValidator({
	id: "twap-trigger-differs-from-mark",
	code: "TWAP_005",
	category: "twap",
	priority: 54,
	getMessage: () => t`Trigger price must differ from mark`,
	validate: (ctx) => {
		if (!ctx.twapOrder || !isPositive(ctx.twapTriggerPriceNum) || ctx.markPx <= 0) return true;
		return ctx.twapTriggerPriceNum !== ctx.markPx;
	},
});

export const twapStopDirectionValidator: Validator<TwapContext> = createValidator({
	id: "twap-stop-direction",
	code: "TWAP_006",
	category: "twap",
	priority: 55,
	getMessage: (ctx) => (ctx.side === "buy" ? t`Max price must be above mark` : t`Min price must be below mark`),
	validate: (ctx) => {
		if (!ctx.twapOrder || !isPositive(ctx.twapStopPriceNum) || ctx.markPx <= 0) return true;
		if (isPositive(ctx.twapTriggerPriceNum)) return true;
		if (ctx.side === "buy") return ctx.twapStopPriceNum > ctx.markPx;
		return ctx.twapStopPriceNum < ctx.markPx;
	},
});

export const twapStopBeyondTriggerValidator: Validator<TwapContext> = createValidator({
	id: "twap-stop-beyond-trigger",
	code: "TWAP_007",
	category: "twap",
	priority: 56,
	getMessage: (ctx) =>
		ctx.side === "buy" ? t`Max price must be above trigger price` : t`Min price must be below trigger price`,
	validate: (ctx) => {
		if (!ctx.twapOrder || !isPositive(ctx.twapTriggerPriceNum) || !isPositive(ctx.twapStopPriceNum)) return true;
		if (ctx.side === "buy") return ctx.twapStopPriceNum > ctx.twapTriggerPriceNum;
		return ctx.twapStopPriceNum < ctx.twapTriggerPriceNum;
	},
});

export const twapValidators: Validator<TwapContext>[] = [
	twapMinutesRangeValidator,
	twapMinNotionalValidator,
	twapTriggerPricePositiveValidator,
	twapStopPricePositiveValidator,
	twapTriggerDiffersFromMarkValidator,
	twapStopDirectionValidator,
	twapStopBeyondTriggerValidator,
];
