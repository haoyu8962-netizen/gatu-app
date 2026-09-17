import { DOCUMENT_ROUTE_PATHS as DOCUMENT_ROUTE_PATH_LIST } from "@/config/document-routes";

const DOCUMENT_ROUTE_PATHS = new Set<string>(DOCUMENT_ROUTE_PATH_LIST);
const TERMINAL_ROUTE_PREFIXES = ["/trade", "/perp", "/spot", "/builders-perp"] as const;

export type AppRouteSurface = "document" | "terminal" | "dashboard";

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
