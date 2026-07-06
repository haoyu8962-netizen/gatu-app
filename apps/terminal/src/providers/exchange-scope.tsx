import { useLocation } from "@tanstack/react-router";
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ExchangeScope } from "@/domain/market";
import { useIsMobile } from "@/hooks/use-mobile";

interface ExchangeScopeContext {
	scope: ExchangeScope;
	dex: string | undefined;
	routeScope: ExchangeScope;
	routeDex: string | undefined;
	setMobileScope: (scope: ExchangeScope, dex?: string) => void;
}

interface ScopeState {
	scope: ExchangeScope;
	dex: string | undefined;
}

const ExchangeScopeCtx = createContext<ExchangeScopeContext>({
	scope: "all",
	dex: undefined,
	routeScope: "all",
	routeDex: undefined,
	setMobileScope: () => undefined,
});

function deriveScope(pathname: string): ScopeState {
	const segments = pathname.split("/").filter(Boolean);
	const first = segments[0];

	if (first === "perp") return { scope: "perp", dex: undefined };
	if (first === "spot") return { scope: "spot", dex: undefined };
	if (first === "builders-perp") {
		return { scope: "builders-perp", dex: segments[1] || undefined };
	}

	return { scope: "all", dex: undefined };
}

export function ExchangeScopeProvider({ children }: { children: React.ReactNode }) {
	const { pathname } = useLocation();
	const isMobile = useIsMobile();
	const routeScope = useMemo(() => deriveScope(pathname), [pathname]);
	const [mobileScope, setMobileScopeState] = useState(routeScope);
	const previousPathnameRef = useRef(pathname);
	const setMobileScope = useCallback((scope: ExchangeScope, dex?: string) => {
		setMobileScopeState({ scope, dex });
	}, []);

	useEffect(() => {
		if (previousPathnameRef.current === pathname) return;
		previousPathnameRef.current = pathname;
		setMobileScopeState(routeScope);
	}, [pathname, routeScope]);

	const activeScope = isMobile ? mobileScope : routeScope;
	const value = useMemo(
		() => ({
			scope: activeScope.scope,
			dex: activeScope.dex,
			routeScope: routeScope.scope,
			routeDex: routeScope.dex,
			setMobileScope,
		}),
		[activeScope, routeScope, setMobileScope],
	);

	return <ExchangeScopeCtx value={value}>{children}</ExchangeScopeCtx>;
}

export function useExchangeScope(): ExchangeScopeContext {
	return use(ExchangeScopeCtx);
}
