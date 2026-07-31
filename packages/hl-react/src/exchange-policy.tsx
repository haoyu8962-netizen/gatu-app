import { createContext, type ReactNode, useContext } from "react";
import type { ExchangeMethod } from "./types/clients";

const PORTFOLIO_MARGIN_ACTIVATION_DISABLED_MESSAGE = "Portfolio margin activation is temporarily unavailable";
const ISOLATED_RISK_INCREASE_DISABLED_MESSAGE = "Isolated risk-increasing actions are temporarily unavailable";

interface ExchangePolicy {
	portfolioMarginActivationEnabled: boolean;
	isolatedRiskIncreaseEnabled: boolean;
}

const ExchangePolicyContext = createContext<ExchangePolicy>({
	portfolioMarginActivationEnabled: false,
	isolatedRiskIncreaseEnabled: false,
});

export interface HyperliquidExchangePolicyProviderProps {
	children: ReactNode;
	portfolioMarginActivationEnabled?: boolean;
	isolatedRiskIncreaseEnabled?: boolean;
}

export function HyperliquidExchangePolicyProvider({
	children,
	portfolioMarginActivationEnabled = false,
	isolatedRiskIncreaseEnabled = false,
}: HyperliquidExchangePolicyProviderProps) {
	return (
		<ExchangePolicyContext.Provider
			value={{
				portfolioMarginActivationEnabled: portfolioMarginActivationEnabled === true,
				isolatedRiskIncreaseEnabled: isolatedRiskIncreaseEnabled === true,
			}}
		>
			{children}
		</ExchangePolicyContext.Provider>
	);
}

export function usePortfolioMarginActivationPolicy(): boolean {
	return useContext(ExchangePolicyContext).portfolioMarginActivationEnabled;
}

export function useIsolatedRiskIncreasePolicy(): boolean {
	return useContext(ExchangePolicyContext).isolatedRiskIncreaseEnabled;
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

export function isIsolatedRiskIncreaseMutation(method: ExchangeMethod, params: unknown): boolean {
	const fields = getParams(params);

	switch (method) {
		case "updateLeverage":
			return fields?.isCross === false;
		case "updateIsolatedMargin":
			return typeof fields?.ntli === "number" && fields.ntli < 0;
		default:
			return false;
	}
}

export function assertExchangeMutationAllowed(
	method: ExchangeMethod,
	params: unknown,
	portfolioMarginActivationEnabled = false,
	isolatedRiskIncreaseEnabled = false,
): void {
	if (portfolioMarginActivationEnabled !== true && isPortfolioMarginActivation(method, params)) {
		throw new Error(PORTFOLIO_MARGIN_ACTIVATION_DISABLED_MESSAGE);
	}
	if (isolatedRiskIncreaseEnabled !== true && isIsolatedRiskIncreaseMutation(method, params)) {
		throw new Error(ISOLATED_RISK_INCREASE_DISABLED_MESSAGE);
	}
}
