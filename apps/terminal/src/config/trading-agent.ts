import { APP_NAME } from "./app";

const MAX_AGENT_NAME_LENGTH = 16;

export function resolveTradingAgentName(configuredName: string | undefined, isDevelopment: boolean): string {
	const fallbackName = isDevelopment ? `${APP_NAME}-dev` : APP_NAME;
	const agentName = configuredName?.trim() || fallbackName;

	if (agentName.length > MAX_AGENT_NAME_LENGTH) {
		throw new Error(`Hyperliquid Agent name must not exceed ${MAX_AGENT_NAME_LENGTH} characters.`);
	}

	return agentName;
}

export const TRADING_AGENT_NAME = resolveTradingAgentName(
	import.meta.env.VITE_HYPERLIQUID_AGENT_NAME,
	import.meta.env.DEV,
);
