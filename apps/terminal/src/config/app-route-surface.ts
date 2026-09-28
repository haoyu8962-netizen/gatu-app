const TERMINAL_ROUTE_PREFIXES = ["/trade", "/perp", "/spot", "/builders-perp"] as const;

export type AppRouteSurface = "terminal" | "dashboard";

export function getAppRouteSurface(pathname: string): AppRouteSurface {
	const normalizedPathname = normalizePathname(pathname);
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

function normalizePathname(pathname: string): string {
	if (!pathname) return "/";
	return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}
