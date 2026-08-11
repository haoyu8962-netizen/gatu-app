export type SupportedAccountAbstraction = "disabled" | "unifiedAccount" | "portfolioMargin";

export function isSupportedAccountAbstraction(value: unknown): value is SupportedAccountAbstraction {
	return value === "disabled" || value === "unifiedAccount" || value === "portfolioMargin";
}
