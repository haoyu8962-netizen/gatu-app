import { createContext, type ReactNode, use } from "react";

export { type AppRouteSurface, getAppRouteSurface, isDocumentRoutePath } from "@/config/app-route-surface";

const ClientRuntimeContext = createContext(false);

interface Props {
	children: ReactNode;
	ready?: boolean;
}

export function ClientRuntimeProvider({ children, ready = true }: Props) {
	return <ClientRuntimeContext value={ready}>{children}</ClientRuntimeContext>;
}

export function useClientRuntimeReady() {
	return use(ClientRuntimeContext);
}

export function getPresentedRoutePathname(state: {
	matches: ReadonlyArray<{ pathname: string }>;
	location: { pathname: string };
}): string {
	return state.matches.at(-1)?.pathname ?? state.location.pathname;
}
