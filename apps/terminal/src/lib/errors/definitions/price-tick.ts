import { t } from "@lingui/core/macro";
import { getOffTickPriceExample } from "@/domain/trade/orders";
import type { Side } from "@/lib/trade/types";
import { createValidator, type Validator } from "../types";

export interface PriceTickContext {
	assetId: number | null;
	szDecimals: number;
	side: Side;
	usesLimitPrice: boolean;
	usesTriggerPrice: boolean;
	limitPriceInput: string;
	triggerPriceInput: string;
	formatDecimalString: (value: string) => string;
}

function getExample(ctx: PriceTickContext, value: string, side?: Side): string | null {
	if (ctx.assetId === null) return null;
	return getOffTickPriceExample(value, { assetId: ctx.assetId, szDecimals: ctx.szDecimals }, side);
}

function getTickMessage(ctx: PriceTickContext, example: string | null): string {
	const validPrice = ctx.formatDecimalString(example ?? "");
	return t`Price must be a multiple of the tick size, with at most 5 significant figures. E.g., ${validPrice}`;
}

export const limitPriceTickValidator: Validator<PriceTickContext> = createValidator({
	id: "limit-price-tick",
	code: "INP_006",
	category: "input",
	priority: 105,
	getMessage: (ctx) => getTickMessage(ctx, getExample(ctx, ctx.limitPriceInput, ctx.side)),
	validate: (ctx) => !ctx.usesLimitPrice || getExample(ctx, ctx.limitPriceInput, ctx.side) === null,
});

export const triggerPriceTickValidator: Validator<PriceTickContext> = createValidator({
	id: "trigger-price-tick",
	code: "INP_007",
	category: "input",
	priority: 106,
	getMessage: (ctx) => getTickMessage(ctx, getExample(ctx, ctx.triggerPriceInput)),
	validate: (ctx) => !ctx.usesTriggerPrice || getExample(ctx, ctx.triggerPriceInput) === null,
});
