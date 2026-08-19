import { t } from "@lingui/core/macro";
import { formatPriceForOrder } from "@/domain/trade/orders";
import { isPositive } from "@/lib/trade/numbers";
import { validateSlPrice, validateTpPrice } from "@/lib/trade/tpsl";
import type { Side } from "@/lib/trade/types";
import { createValidator, type Validator } from "../types";

export interface TpSlContext {
	assetId: number | null;
	szDecimals: number;
	tpSlEnabled: boolean;
	canUseTpSl: boolean;
	tpSlReturnInvalid: boolean;
	tpPriceNum: number | null;
	slPriceNum: number | null;
	price: number;
	side: Side;
}

function normalizePrice(ctx: TpSlContext, value: number): string | number {
	if (ctx.assetId === null) return value;
	return formatPriceForOrder(value, { assetId: ctx.assetId, szDecimals: ctx.szDecimals });
}

export const tpSlReturnValidator: Validator<TpSlContext> = createValidator({
	id: "tpsl-return-invalid",
	code: "TPSL_004",
	category: "tpsl",
	priority: 199,
	getMessage: () => t`Invalid amount`,
	validate: (ctx) => !ctx.tpSlEnabled || !ctx.canUseTpSl || !ctx.tpSlReturnInvalid,
});

export const enterTpSlPriceValidator: Validator<TpSlContext> = createValidator({
	id: "enter-tpsl-price",
	code: "TPSL_001",
	category: "tpsl",
	priority: 200,
	getMessage: () => t`Enter TP or SL price`,
	validate: (ctx) => {
		if (!ctx.tpSlEnabled || !ctx.canUseTpSl) return true;
		if (ctx.tpSlReturnInvalid) return true;
		const hasTp = isPositive(ctx.tpPriceNum);
		const hasSl = isPositive(ctx.slPriceNum);
		return hasTp || hasSl;
	},
});

export const tpPriceValidator: Validator<TpSlContext> = createValidator({
	id: "tp-price-invalid",
	code: "TPSL_002",
	category: "tpsl",
	priority: 201,
	getMessage: (ctx) => (ctx.side === "buy" ? t`TP must be above entry` : t`TP must be below entry`),
	validate: (ctx) => {
		if (!ctx.tpSlEnabled || !ctx.canUseTpSl) return true;
		const hasTp = isPositive(ctx.tpPriceNum);
		if (!hasTp) return true;
		return validateTpPrice(normalizePrice(ctx, ctx.price), normalizePrice(ctx, ctx.tpPriceNum ?? 0), ctx.side);
	},
});

export const slPriceValidator: Validator<TpSlContext> = createValidator({
	id: "sl-price-invalid",
	code: "TPSL_003",
	category: "tpsl",
	priority: 202,
	getMessage: (ctx) => (ctx.side === "buy" ? t`SL must be below entry` : t`SL must be above entry`),
	validate: (ctx) => {
		if (!ctx.tpSlEnabled || !ctx.canUseTpSl) return true;
		const hasSl = isPositive(ctx.slPriceNum);
		if (!hasSl) return true;
		return validateSlPrice(normalizePrice(ctx, ctx.price), normalizePrice(ctx, ctx.slPriceNum ?? 0), ctx.side);
	},
});

export const tpSlValidators: Validator<TpSlContext>[] = [
	tpSlReturnValidator,
	enterTpSlPriceValidator,
	tpPriceValidator,
	slPriceValidator,
];
