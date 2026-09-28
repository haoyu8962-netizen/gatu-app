import { t } from "@lingui/core/macro";
import { createValidator, type Validator } from "../types";

export interface OpenInterestCapContext {
	openInterestCapped: boolean;
	usesLimitPrice: boolean;
}

export const limitOrderOpenInterestCapValidator: Validator<OpenInterestCapContext> = createValidator({
	id: "limit-order-open-interest-cap",
	code: "OIC_001",
	category: "restriction",
	priority: 45,
	getMessage: () =>
		t`The limit order would be canceled after resting because open interest is capped. Use market orders to close positions.`,
	validate: (ctx) => !(ctx.openInterestCapped && ctx.usesLimitPrice),
});
