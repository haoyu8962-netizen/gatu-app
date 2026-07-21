import { t } from "@lingui/core/macro";
import { SCALE_LEVELS_MAX, SCALE_LEVELS_MIN } from "@/config/trade";
import { createScaleOrderLevelPlan, type ScaleOrderPlanIssue } from "@/domain/trade/orders";
import { isPositive } from "@/lib/trade/numbers";
import { createValidator, type Validator } from "../types";

export interface ScaleContext {
	assetId: number | null;
	szDecimals: number;
	scaleOrder: boolean;
	scaleStartPriceNum: number | null;
	scaleEndPriceNum: number | null;
	scaleLevelsNum: number | null;
	sizeValue: number;
}

export const enterPriceRangeValidator: Validator<ScaleContext> = createValidator({
	id: "enter-price-range",
	code: "SCL_001",
	category: "scale",
	priority: 400,
	getMessage: () => t`Enter price range`,
	validate: (ctx) => {
		if (!ctx.scaleOrder) return true;
		return isPositive(ctx.scaleStartPriceNum) && isPositive(ctx.scaleEndPriceNum);
	},
});

export const scaleLevelsRangeValidator: Validator<ScaleContext> = createValidator({
	id: "scale-levels-range",
	code: "SCL_002",
	category: "scale",
	priority: 401,
	getMessage: () => t`Scale levels must be ${SCALE_LEVELS_MIN}-${SCALE_LEVELS_MAX}`,
	validate: (ctx) => {
		if (!ctx.scaleOrder) return true;
		const levels = ctx.scaleLevelsNum;
		return levels !== null && Number.isSafeInteger(levels) && levels >= SCALE_LEVELS_MIN && levels <= SCALE_LEVELS_MAX;
	},
});

export const scaleStartEndDifferValidator: Validator<ScaleContext> = createValidator({
	id: "scale-start-end-differ",
	code: "SCL_003",
	category: "scale",
	priority: 402,
	getMessage: () => t`Start and end must differ`,
	validate: (ctx) => {
		if (!ctx.scaleOrder) return true;
		if (!isPositive(ctx.scaleStartPriceNum) || !isPositive(ctx.scaleEndPriceNum)) return true;
		return ctx.scaleStartPriceNum !== ctx.scaleEndPriceNum;
	},
});

export const scaleLevelMinNotionalValidator: Validator<ScaleContext> = createValidator({
	id: "scale-level-min-notional",
	code: "SCL_004",
	category: "scale",
	priority: 403,
	getMessage: () => t`Scale level below min notional`,
	validate: (ctx) => {
		return !hasScalePlanIssue(ctx, "min-notional");
	},
});

export const scaleSizeAllocationValidator: Validator<ScaleContext> = createValidator({
	id: "scale-size-allocation",
	code: "SCL_005",
	category: "scale",
	priority: 404,
	getMessage: () => t`Scale size is too small for the selected number of orders`,
	validate: (ctx) => !hasScalePlanIssue(ctx, "insufficient-size"),
});

export const scalePricePrecisionValidator: Validator<ScaleContext> = createValidator({
	id: "scale-price-precision",
	code: "SCL_006",
	category: "scale",
	priority: 405,
	getMessage: () => t`Scale prices must resolve to distinct ticks`,
	validate: (ctx) => !hasScalePlanIssue(ctx, "duplicate-price"),
});

function hasScalePlanIssue(context: ScaleContext, issue: ScaleOrderPlanIssue): boolean {
	if (!context.scaleOrder || context.assetId === null) return false;
	if (!isPositive(context.scaleStartPriceNum) || !isPositive(context.scaleEndPriceNum)) return false;
	if (
		context.scaleLevelsNum === null ||
		!Number.isSafeInteger(context.scaleLevelsNum) ||
		context.scaleLevelsNum < SCALE_LEVELS_MIN ||
		context.scaleLevelsNum > SCALE_LEVELS_MAX
	) {
		return false;
	}

	const plan = createScaleOrderLevelPlan({
		assetId: context.assetId,
		sizeValue: context.sizeValue,
		szDecimals: context.szDecimals,
		scaleStartPriceInput: context.scaleStartPriceNum,
		scaleEndPriceInput: context.scaleEndPriceNum,
		scaleLevelsNum: context.scaleLevelsNum,
	});
	return plan.issues.includes(issue);
}

export const scaleValidators: Validator<ScaleContext>[] = [
	enterPriceRangeValidator,
	scaleLevelsRangeValidator,
	scaleStartEndDifferValidator,
	scaleSizeAllocationValidator,
	scalePricePrecisionValidator,
	scaleLevelMinNotionalValidator,
];
