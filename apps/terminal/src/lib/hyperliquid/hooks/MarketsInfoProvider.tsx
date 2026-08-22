import { useRouterState } from "@tanstack/react-router";
import { createContext, type ReactNode, useContext } from "react";
import { shouldSubscribeToMarketStats } from "../market-stats-subscription";
import { type UseMarketsInfoReturn, useMarketsInfoInternal } from "./useMarketsInfo";

const MarketsInfoContext = createContext<UseMarketsInfoReturn | null>(null);

interface MarketsInfoProviderProps {
	children: ReactNode;
}

export function MarketsInfoProvider({ children }: MarketsInfoProviderProps) {
	const pathname = useRouterState({ select: (state) => state.location.pathname });
	const marketsInfo = useMarketsInfoInternal({
		updateInterval: 5000,
		alwaysSubscribeAll: true,
		subscriptionsEnabled: shouldSubscribeToMarketStats(pathname),
	});

	return <MarketsInfoContext.Provider value={marketsInfo}>{children}</MarketsInfoContext.Provider>;
}

export function useMarketsInfoContext(): UseMarketsInfoReturn {
	const context = useContext(MarketsInfoContext);
	if (!context) {
		throw new Error("useMarketsInfoContext must be used within a MarketsInfoProvider");
	}
	return context;
}
