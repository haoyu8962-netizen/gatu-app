import { createContext, type ReactNode, use } from "react";

const ClientRuntimeContext = createContext(false);
const DOCUMENT_ROUTE_PATHS = new Set(["/cookies", "/docs", "/privacy", "/risk", "/support", "/terms"]);

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

export function isDocumentRoutePath(pathname: string) {
	const normalizedPathname = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
	return DOCUMENT_ROUTE_PATHS.has(normalizedPathname);
}
