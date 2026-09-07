import { createContext, type ReactNode, use } from "react";

const ClientRuntimeContext = createContext(false);
const DOCUMENT_ROUTE_PATHS = new Set(["/cookies", "/docs", "/privacy", "/risk", "/support", "/terms"]);
const TERMINAL_ROUTE_PREFIXES = ["/trade", "/perp", "/spot", "/builders-perp"] as const;

export type AppRouteSurface = "document" | "terminal" | "dashboard";

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

export function getAppRouteSurface(pathname: string): AppRouteSurface {
	const normalizedPathname = normalizePathname(pathname);
	if (DOCUMENT_ROUTE_PATHS.has(normalizedPathname)) return "document";
	if (
		normalizedPathname === "/" ||
		TERMINAL_ROUTE_PREFIXES.some(
			(prefix) => normalizedPathname === prefix || normalizedPathname.startsWith(`${prefix}/`),
		)
	) {
		return "terminal";
	}
	return "dashboard";
}

export function isDocumentRoutePath(pathname: string) {
	return getAppRouteSurface(pathname) === "document";
}

function normalizePathname(pathname: string): string {
	if (!pathname) return "/";
	return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}
