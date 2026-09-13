import { API_PATH_PREFIX, CLIENT_ERROR_REPORT_API_PATH } from "@/config/api-paths";
import { DOCUMENT_ROUTE_PATHS } from "@/config/document-routes";

export const STATIC_SHELL_FILE = "_shell.html";
export const SERVER_FUNCTION_PATH_PREFIX = "/_serverFn/";
export const REFERRAL_JOIN_ROUTE_MARKER = '<meta name="gatu-route" content="referral-join"/>';

const SERVER_ONLY_PREFIXES = [API_PATH_PREFIX, "/mobile-agent-sync-ticket/"] as const;
const SERVER_ONLY_PATHS = new Set<string>([
	API_PATH_PREFIX.slice(0, -1),
	"/mobile-agent-sync-ticket",
	"/client-error-report",
	CLIENT_ERROR_REPORT_API_PATH,
]);
const DOCUMENT_PATHS = new Set<string>(DOCUMENT_ROUTE_PATHS);
const FILE_EXTENSION = /\.[A-Za-z0-9]{1,8}$/;

export type StaticPageDecision =
	| { kind: "pass" }
	| { kind: "gone" }
	| { kind: "not-found" }
	| { kind: "page"; candidates: readonly string[]; marker: string | null };

function decodePathname(rawPathname: string): string | null {
	try {
		return decodeURIComponent(rawPathname);
	} catch {
		return null;
	}
}

function hasUnsafeSegment(pathname: string): boolean {
	if (pathname.includes("\\") || pathname.includes("\0")) return true;
	return pathname.split("/").some((segment) => segment === "." || segment === "..");
}

function trimTrailingSlash(pathname: string): string {
	return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

/**
 * Decides how the runtime answers a navigation without rendering routes on the server:
 * server-only paths pass through to their handlers, document routes get their prerendered HTML,
 * every other application path gets the SPA shell, and paths that look like files never receive
 * HTML. The server-function transport is gone because the client no longer uses it.
 */
export function classifyStaticPageRequest(method: string, rawPathname: string): StaticPageDecision {
	if (method !== "GET" && method !== "HEAD") return { kind: "pass" };
	const decoded = decodePathname(rawPathname);
	if (decoded === null || !decoded.startsWith("/") || hasUnsafeSegment(decoded)) return { kind: "pass" };

	const pathname = trimTrailingSlash(decoded);
	if (pathname.startsWith(SERVER_FUNCTION_PATH_PREFIX)) return { kind: "gone" };
	if (SERVER_ONLY_PATHS.has(pathname) || SERVER_ONLY_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
		return { kind: "pass" };
	}
	if (FILE_EXTENSION.test(pathname)) return { kind: "not-found" };

	const candidates = DOCUMENT_PATHS.has(pathname)
		? [`${pathname.slice(1)}/index.html`, STATIC_SHELL_FILE]
		: [STATIC_SHELL_FILE];
	const marker = pathname === "/join" || pathname.startsWith("/join/") ? REFERRAL_JOIN_ROUTE_MARKER : null;
	return { kind: "page", candidates, marker };
}

/**
 * The deployment health check proves a release recognizes the referral deep link by looking for
 * the route marker in the HTML. The static shell is path-agnostic, so the runtime stamps the
 * marker into the shell it serves for `/join/*` paths.
 */
export function decorateStaticPage(html: string, marker: string | null): string {
	if (!marker) return html;
	const headTag = /<head\b[^>]*>/i.exec(html);
	if (!headTag) return html;
	const insertAt = headTag.index + headTag[0].length;
	return `${html.slice(0, insertAt)}${marker}${html.slice(insertAt)}`;
}
