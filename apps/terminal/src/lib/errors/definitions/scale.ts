import { t } from "@lingui/core/macro";
import { SCALE_LEVELS_MAX, SCALE_LEVELS_MIN, SCALE_SKEW_MAX, SCALE_SKEW_MIN } from "@/config/trade";
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
	scaleSkewNum: number | null;
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
		return isScaleLevelsInRange(ctx.scaleLevelsNum);
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

export const scaleSkewRangeValidator: Validator<ScaleContext> = createValidator({
	id: "scale-skew-range",
	code: "SCL_007",
	category: "scale",
	priority: 406,
	getMessage: () => t`Scale skew must be ${SCALE_SKEW_MIN}-${SCALE_SKEW_MAX}`,
	validate: (ctx) => {
		if (!ctx.scaleOrder) return true;
		return isScaleSkewInRange(ctx.scaleSkewNum);
	},
});

export const scaleSkewAllocationValidator: Validator<ScaleContext> = createValidator({
	id: "scale-skew-allocation",
	code: "SCL_008",
	category: "scale",
	priority: 407,
	getMessage: () => t`Size skew is too aggressive for the total size`,
	validate: (ctx) => !hasScalePlanIssue(ctx, "insufficient-size-for-skew"),
});

function isScaleLevelsInRange(levels: number | null): boolean {
	return levels !== null && Number.isSafeInteger(levels) && levels >= SCALE_LEVELS_MIN && levels <= SCALE_LEVELS_MAX;
}

function isScaleSkewInRange(skew: number | null): boolean {
	return skew !== null && Number.isFinite(skew) && skew >= SCALE_SKEW_MIN && skew <= SCALE_SKEW_MAX;
}

function hasScalePlanIssue(context: ScaleContext, issue: ScaleOrderPlanIssue): boolean {
	if (!context.scaleOrder || context.assetId === null) return false;
	if (!isPositive(context.scaleStartPriceNum) || !isPositive(context.scaleEndPriceNum)) return false;
	if (!isScaleLevelsInRange(context.scaleLevelsNum) || !isScaleSkewInRange(context.scaleSkewNum)) return false;

	const plan = createScaleOrderLevelPlan({
		assetId: context.assetId,
		sizeValue: context.sizeValue,
		szDecimals: context.szDecimals,
		scaleStartPriceInput: context.scaleStartPriceNum,
		scaleEndPriceInput: context.scaleEndPriceNum,
		scaleLevelsNum: context.scaleLevelsNum,
		scaleSkew: context.scaleSkewNum,
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
	scaleSkewRangeValidator,
	scaleSkewAllocationValidator,
];
