import { t } from "@lingui/core/macro";
import { isPositive, toBig } from "@/lib/trade/numbers";
import type { Side } from "@/lib/trade/types";
import { createValidator, type Validator } from "../types";

export interface TriggerContext {
	usesTriggerPrice: boolean;
	triggerPriceNum: number | null;
	markPx: number;
	side: Side;
	stopOrder: boolean;
	takeProfitOrder: boolean;
	positionSize: number | null;
	sizeValue: number;
	reduceOnly: boolean;
}

function isReduceOnlyTrigger(ctx: TriggerContext): boolean {
	return ctx.usesTriggerPrice && ctx.reduceOnly;
}

export const stopTriggerAboveMarkValidator: Validator<TriggerContext> = createValidator({
	id: "stop-trigger-above-mark",
	code: "TRG_001",
	category: "trigger",
	priority: 300,
	getMessage: () => t`Stop trigger must be above mark`,
	validate: (ctx) => {
		if (!ctx.usesTriggerPrice || !isPositive(ctx.triggerPriceNum) || ctx.markPx <= 0) return true;
		if (!ctx.stopOrder) return true;
		if (ctx.side !== "buy") return true;
		return ctx.triggerPriceNum > ctx.markPx;
	},
});

export const stopTriggerBelowMarkValidator: Validator<TriggerContext> = createValidator({
	id: "stop-trigger-below-mark",
	code: "TRG_002",
	category: "trigger",
	priority: 301,
	getMessage: () => t`Stop trigger must be below mark`,
	validate: (ctx) => {
		if (!ctx.usesTriggerPrice || !isPositive(ctx.triggerPriceNum) || ctx.markPx <= 0) return true;
		if (!ctx.stopOrder) return true;
		if (ctx.side !== "sell") return true;
		return ctx.triggerPriceNum < ctx.markPx;
	},
});

export const tpTriggerAboveMarkValidator: Validator<TriggerContext> = createValidator({
	id: "tp-trigger-above-mark",
	code: "TRG_003",
	category: "trigger",
	priority: 302,
	getMessage: () => t`Take profit trigger must be above mark`,
	validate: (ctx) => {
		if (!ctx.usesTriggerPrice || !isPositive(ctx.triggerPriceNum) || ctx.markPx <= 0) return true;
		if (!ctx.takeProfitOrder) return true;
		if (ctx.side !== "sell") return true;
		return ctx.triggerPriceNum > ctx.markPx;
	},
});

export const tpTriggerBelowMarkValidator: Validator<TriggerContext> = createValidator({
	id: "tp-trigger-below-mark",
	code: "TRG_004",
	category: "trigger",
	priority: 303,
	getMessage: () => t`Take profit trigger must be below mark`,
	validate: (ctx) => {
		if (!ctx.usesTriggerPrice || !isPositive(ctx.triggerPriceNum) || ctx.markPx <= 0) return true;
		if (!ctx.takeProfitOrder) return true;
		if (ctx.side !== "buy") return true;
		return ctx.triggerPriceNum < ctx.markPx;
	},
});

export const triggerPositionExistsValidator: Validator<TriggerContext> = createValidator({
	id: "trigger-position-exists",
	code: "TRG_005",
	category: "trigger",
	priority: 304,
	getMessage: () => t`Open a position before placing a trigger order`,
	validate: (ctx) => !isReduceOnlyTrigger(ctx) || ctx.positionSize === null || ctx.positionSize !== 0,
});

export const triggerPositionDirectionValidator: Validator<TriggerContext> = createValidator({
	id: "trigger-position-direction",
	code: "TRG_006",
	category: "trigger",
	priority: 305,
	getMessage: () => t`Trigger order must reduce your current position`,
	validate: (ctx) => {
		if (!isReduceOnlyTrigger(ctx) || ctx.positionSize === null || ctx.positionSize === 0) return true;
		return ctx.side === "sell" ? ctx.positionSize > 0 : ctx.positionSize < 0;
	},
});

export const triggerPositionSizeValidator: Validator<TriggerContext> = createValidator({
	id: "trigger-position-size",
	code: "TRG_007",
	category: "trigger",
	priority: 306,
	getMessage: () => t`Trigger size exceeds position size`,
	validate: (ctx) => {
		if (!isReduceOnlyTrigger(ctx) || ctx.positionSize === null || ctx.positionSize === 0) return true;
		const reducesPosition = ctx.side === "sell" ? ctx.positionSize > 0 : ctx.positionSize < 0;
		if (!reducesPosition) return true;
		const size = toBig(ctx.sizeValue);
		const positionSize = toBig(ctx.positionSize)?.abs();
		if (!size || !positionSize || size.lte(0)) return true;
		return size.lte(positionSize);
	},
});

export const triggerValidators: Validator<TriggerContext>[] = [
	stopTriggerAboveMarkValidator,
	stopTriggerBelowMarkValidator,
	tpTriggerAboveMarkValidator,
	tpTriggerBelowMarkValidator,
	triggerPositionExistsValidator,
	triggerPositionDirectionValidator,
	triggerPositionSizeValidator,
];
