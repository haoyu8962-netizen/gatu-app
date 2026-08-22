import { createContext, type ReactNode, useContext } from "react";
import type { ExchangeMethod } from "./types/clients";

const PORTFOLIO_MARGIN_ACTIVATION_DISABLED_MESSAGE = "Portfolio margin activation is temporarily unavailable";

interface ExchangePolicy {
	portfolioMarginActivationEnabled: boolean;
}

const ExchangePolicyContext = createContext<ExchangePolicy>({
	portfolioMarginActivationEnabled: false,
});

export interface HyperliquidExchangePolicyProviderProps {
	children: ReactNode;
	portfolioMarginActivationEnabled?: boolean;
}

export function HyperliquidExchangePolicyProvider({
	children,
	portfolioMarginActivationEnabled = false,
}: HyperliquidExchangePolicyProviderProps) {
	return (
		<ExchangePolicyContext.Provider
			value={{
				portfolioMarginActivationEnabled: portfolioMarginActivationEnabled === true,
			}}
		>
			{children}
		</ExchangePolicyContext.Provider>
	);
}

export function usePortfolioMarginActivationPolicy(): boolean {
	return useContext(ExchangePolicyContext).portfolioMarginActivationEnabled;
}

function getParams(params: unknown): Record<string, unknown> | null {
	if (!params || typeof params !== "object") return null;
	return params as Record<string, unknown>;
}

export function isPortfolioMarginActivation(method: ExchangeMethod, params: unknown): boolean {
	const fields = getParams(params);

	switch (method) {
		case "userSetAbstraction":
			return fields?.abstraction === "portfolioMargin";
		case "userPortfolioMargin":
			return fields?.enabled === true;
		case "agentSetAbstraction":
			return fields?.abstraction === "p";
		default:
			return false;
	}
}

export function assertExchangeMutationAllowed(
	method: ExchangeMethod,
	params: unknown,
	portfolioMarginActivationEnabled = false,
): void {
	if (portfolioMarginActivationEnabled !== true && isPortfolioMarginActivation(method, params)) {
		throw new Error(PORTFOLIO_MARGIN_ACTIVATION_DISABLED_MESSAGE);
	}
}
