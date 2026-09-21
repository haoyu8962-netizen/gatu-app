import { t } from "@lingui/core/macro";
import { toBig } from "@/lib/trade/numbers";
import type { Side } from "@/lib/trade/types";
import { createValidator, type Validator } from "../types";

export interface ReduceOnlyContext {
	side: Side;
	positionSize: number | string | null;
	sizeValue: number;
	sizeForOrder?: string;
	reduceOnly: boolean;
}
function isReduceOnlyOrder(ctx: ReduceOnlyContext): boolean {
	return ctx.reduceOnly;
}
// Retain TRG_005..007 identifiers for presentation consumers; these now cover all primary perp orders.
export const reduceOnlyPositionExistsValidator: Validator<ReduceOnlyContext> = createValidator({
	id: "trigger-position-exists",
	code: "TRG_005",
	category: "trigger",
	priority: 304,
	getMessage: () => t`Reduce Only requires an open position`,
	validate: (ctx) => !isReduceOnlyOrder(ctx) || !!toBig(ctx.positionSize)?.abs().gt(0),
});

export const reduceOnlyPositionDirectionValidator: Validator<ReduceOnlyContext> = createValidator({
	id: "trigger-position-direction",
	code: "TRG_006",
	category: "trigger",
	priority: 305,
	getMessage: () => t`Order must reduce your current position`,
	validate: (ctx) => {
		if (!isReduceOnlyOrder(ctx) || !toBig(ctx.positionSize)?.abs().gt(0)) return true;
		return ctx.side === "sell" ? !!toBig(ctx.positionSize)?.gt(0) : !!toBig(ctx.positionSize)?.lt(0);
	},
});

export const reduceOnlyPositionSizeValidator: Validator<ReduceOnlyContext> = createValidator({
	id: "trigger-position-size",
	code: "TRG_007",
	category: "trigger",
	priority: 306,
	getMessage: () => t`Reduce Only size exceeds position size`,
	validate: (ctx) => {
		if (!isReduceOnlyOrder(ctx) || !toBig(ctx.positionSize)?.abs().gt(0)) return true;
		const reducesPosition = ctx.side === "sell" ? !!toBig(ctx.positionSize)?.gt(0) : !!toBig(ctx.positionSize)?.lt(0);
		if (!reducesPosition) return true;
		const size = toBig(ctx.sizeForOrder ?? ctx.sizeValue);
		const positionSize = toBig(ctx.positionSize)?.abs();
		if (!size || !positionSize || size.lte(0)) return true;
		return size.lte(positionSize);
	},
});
