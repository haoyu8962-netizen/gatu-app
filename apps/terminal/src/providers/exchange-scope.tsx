import { useLocation } from "@tanstack/react-router";
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ExchangeScope } from "@/domain/market";
import { getTradeRouteMarketFromPath } from "@/lib/hyperliquid/market-route";

interface ExchangeScopeContext {
	scope: ExchangeScope;
	dex: string | undefined;
	marketName: string | undefined;
	routeScope: ExchangeScope;
	routeDex: string | undefined;
	routeMarketName: string | undefined;
	setScope: (scope: ExchangeScope, dex?: string, marketName?: string) => void;
}

interface ScopeState {
	scope: ExchangeScope;
	dex: string | undefined;
	marketName: string | undefined;
}

const ExchangeScopeCtx = createContext<ExchangeScopeContext>({
	scope: "all",
	dex: undefined,
	marketName: undefined,
	routeScope: "all",
	routeDex: undefined,
	routeMarketName: undefined,
	setScope: () => undefined,
});

function deriveScope(pathname: string): ScopeState {
	const tradeRouteMarket = getTradeRouteMarketFromPath(pathname);
	if (tradeRouteMarket) {
		return {
			scope: tradeRouteMarket.scope,
			dex: tradeRouteMarket.dex,
			marketName: tradeRouteMarket.name,
		};
	}

	const segments = pathname.split("/").filter(Boolean);
	const first = segments[0];

	if (first === "perp") return { scope: "perp", dex: undefined, marketName: undefined };
	if (first === "spot") return { scope: "spot", dex: undefined, marketName: undefined };
	if (first === "builders-perp") {
		return { scope: "builders-perp", dex: segments[1] || undefined, marketName: undefined };
	}

	return { scope: "all", dex: undefined, marketName: undefined };
}

function createRuntimeScope(routeScope: ScopeState): ScopeState {
	return {
		scope: routeScope.scope,
		dex: routeScope.dex,
		marketName: undefined,
	};
}

export function ExchangeScopeProvider({ children }: { children: React.ReactNode }) {
	const { pathname } = useLocation();
	const routeScope = useMemo(() => deriveScope(pathname), [pathname]);
	const [runtimeScope, setRuntimeScope] = useState(() => createRuntimeScope(routeScope));
	const previousPathnameRef = useRef(pathname);
	const setScope = useCallback((scope: ExchangeScope, dex?: string, marketName?: string) => {
		setRuntimeScope({ scope, dex, marketName });
	}, []);

	useEffect(() => {
		if (previousPathnameRef.current === pathname) return;
		previousPathnameRef.current = pathname;
		setRuntimeScope(createRuntimeScope(routeScope));
	}, [pathname, routeScope]);

	const value = useMemo(
		() => ({
			scope: runtimeScope.scope,
			dex: runtimeScope.dex,
			marketName: runtimeScope.marketName,
			routeScope: routeScope.scope,
			routeDex: routeScope.dex,
			routeMarketName: routeScope.marketName,
			setScope,
		}),
		[runtimeScope, routeScope, setScope],
	);

	return <ExchangeScopeCtx value={value}>{children}</ExchangeScopeCtx>;
}

export function useExchangeScope(): ExchangeScopeContext {
	return use(ExchangeScopeCtx);
}
