export type SupportedAccountAbstraction = "disabled" | "unifiedAccount" | "portfolioMargin";
export type AccountModeAvailability = "supported" | "unresolved" | "unsupported";

export function isSupportedAccountAbstraction(value: unknown): value is SupportedAccountAbstraction {
	return value === "disabled" || value === "unifiedAccount" || value === "portfolioMargin";
}

export function getAccountModeAvailability(value: unknown): AccountModeAvailability {
	if (isSupportedAccountAbstraction(value)) return "supported";
	if (value === "default" || value === "dexAbstraction") return "unsupported";
	return "unresolved";
}
