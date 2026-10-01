import {
	API_PATH_PREFIX,
	CLIENT_ERROR_REPORT_API_PATH,
	GEO_API_PATH,
	LEADERBOARD_API_PATH,
	REFERRAL_GEO_API_PATH,
} from "@/config/api-paths";

export const STATIC_SHELL_FILE = "_shell.html";
export const SERVER_FUNCTION_PATH_PREFIX = "/_serverFn/";
export const REFERRAL_JOIN_ROUTE_MARKER = '<meta name="sairn-route" content="referral-join"/>';
export const LEGACY_CLIENT_ERROR_REPORT_PATH = "/client-error-report";
export const RETIRED_MOBILE_SYNC_TICKET_PATH = "/mobile-agent-sync-ticket";

const NAVIGATION_API_PATHS = new Set<string>([GEO_API_PATH, LEADERBOARD_API_PATH]);
const POST_ONLY_SERVER_PATHS = new Set<string>([
	REFERRAL_GEO_API_PATH,
	CLIENT_ERROR_REPORT_API_PATH,
	LEGACY_CLIENT_ERROR_REPORT_PATH,
]);
const FILE_EXTENSION = /\.[A-Za-z0-9]{1,16}$/;

export type StaticPageDecision =
	| { kind: "pass" }
	| { kind: "gone" }
	| { kind: "not-found" }
	| { kind: "method-not-allowed"; allow: string }
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

function classifyServerPath(pathname: string): StaticPageDecision | null {
	if (pathname.startsWith(SERVER_FUNCTION_PATH_PREFIX)) return { kind: "gone" };
	if (NAVIGATION_API_PATHS.has(pathname)) return { kind: "pass" };
	if (pathname === RETIRED_MOBILE_SYNC_TICKET_PATH || pathname.startsWith(`${RETIRED_MOBILE_SYNC_TICKET_PATH}/`)) {
		return { kind: "not-found" };
	}
	if (POST_ONLY_SERVER_PATHS.has(pathname)) {
		return { kind: "method-not-allowed", allow: "POST" };
	}
	if (pathname === API_PATH_PREFIX.slice(0, -1) || pathname.startsWith(API_PATH_PREFIX)) return { kind: "not-found" };
	return null;
}

/**
 * Decides how the runtime answers a navigation without rendering routes on the server: every
 * application path gets the SPA shell, and server paths never fall through to page rendering.
 * GET-able API routes pass to their handlers, POST-only endpoints answer 405, unknown `/api/*`
 * paths answer 404, file-like paths never receive HTML, and the server-function transport is gone
 * because the client no longer uses it.
 */
export function classifyStaticPageRequest(method: string, rawPathname: string): StaticPageDecision {
	if (method !== "GET" && method !== "HEAD") return { kind: "pass" };
	const decoded = decodePathname(rawPathname);
	if (decoded === null || !decoded.startsWith("/") || hasUnsafeSegment(decoded)) return { kind: "pass" };

	const pathname = trimTrailingSlash(decoded);
	const serverDecision = classifyServerPath(pathname);
	if (serverDecision) return serverDecision;
	if (FILE_EXTENSION.test(pathname)) return { kind: "not-found" };

	const marker = pathname === "/join" || pathname.startsWith("/join/") ? REFERRAL_JOIN_ROUTE_MARKER : null;
	return { kind: "page", candidates: [STATIC_SHELL_FILE], marker };
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
