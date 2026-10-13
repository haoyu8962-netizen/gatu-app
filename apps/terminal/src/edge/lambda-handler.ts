import {
	CLIENT_ERROR_REPORT_API_PATH,
	GEO_API_PATH,
	HEALTH_API_PATH,
	LEADERBOARD_API_PATH,
	REFERRAL_GEO_API_PATH,
} from "@/config/api-paths";
import { handleClientErrorReport } from "@/lib/error-reporting/server";
import { createGeoApiHandlers, type GeoApiHandlers } from "@/lib/geo/geo-api";
import { createLeaderboardApiHandler } from "@/lib/leaderboard/leaderboard-server";

/** Header the CloudFront viewer-request function fills with the public host the viewer used. */
export const FORWARDED_HOST_HEADER = "x-sairn-forwarded-host";
/** Header CloudFront adds when the origin request policy forwards it: `ip:port` or `[ipv6]:port`. */
export const VIEWER_ADDRESS_HEADER = "cloudfront-viewer-address";
/** Internal header the adapter sets from the trusted source; incoming values are always discarded. */
const CLIENT_IP_HEADER = "x-sairn-client-ip";
const LEGACY_CLIENT_ERROR_REPORT_PATH = "/client-error-report";
const NO_STORE_JSON = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } as const;

export interface LambdaFunctionUrlEvent {
	rawPath: string;
	rawQueryString?: string;
	headers?: Record<string, string | undefined>;
	requestContext: { domainName?: string; http: { method: string; sourceIp?: string } };
	body?: string;
	isBase64Encoded?: boolean;
}

export interface LambdaFunctionUrlResult {
	statusCode: number;
	headers: Record<string, string>;
	body: string;
	isBase64Encoded: boolean;
}

export interface LambdaEnvironment {
	development: boolean;
	ipdataApiKey: () => string | undefined;
	/** Public origin used when the forwarded host header is absent, e.g. `https://app.sairn.ai`. */
	publicOrigin: string | undefined;
	/** True only when CloudFront is the sole caller (origin access control on the function URL). */
	trustViewerAddress: boolean;
	fetch?: typeof globalThis.fetch;
	now?: () => number;
}

function readHeader(event: LambdaFunctionUrlEvent, name: string): string | undefined {
	const value = event.headers?.[name] ?? event.headers?.[name.toLowerCase()];
	return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

export function stripViewerAddressPort(value: string): string | undefined {
	const match = /^\[?([0-9A-Fa-f.:]+?)\]?(?::\d{1,5})?$/.exec(value.trim());
	return match?.[1];
}

export function resolveClientIp(event: LambdaFunctionUrlEvent, trustViewerAddress: boolean): string | undefined {
	if (trustViewerAddress) {
		const viewerAddress = readHeader(event, VIEWER_ADDRESS_HEADER);
		if (viewerAddress) return stripViewerAddressPort(viewerAddress);
	}
	return event.requestContext.http.sourceIp?.trim() || undefined;
}

export function resolveRequestOrigin(event: LambdaFunctionUrlEvent, publicOrigin: string | undefined): string {
	const forwardedHost = readHeader(event, FORWARDED_HOST_HEADER);
	if (forwardedHost && /^[a-z0-9.-]+(?::\d{1,5})?$/i.test(forwardedHost))
		return `https://${forwardedHost.toLowerCase()}`;
	if (publicOrigin) return publicOrigin.replace(/\/+$/, "");
	return `https://${event.requestContext.domainName ?? "localhost"}`;
}

export function toRequest(event: LambdaFunctionUrlEvent, environment: LambdaEnvironment): Request {
	const origin = resolveRequestOrigin(event, environment.publicOrigin);
	const query = event.rawQueryString ? `?${event.rawQueryString}` : "";
	const headers = new Headers();
	for (const [name, value] of Object.entries(event.headers ?? {})) {
		if (typeof value !== "string" || name.toLowerCase() === CLIENT_IP_HEADER) continue;
		headers.set(name, value);
	}
	const clientIp = resolveClientIp(event, environment.trustViewerAddress);
	if (clientIp) headers.set(CLIENT_IP_HEADER, clientIp);

	const method = event.requestContext.http.method.toUpperCase();
	const hasBody = method !== "GET" && method !== "HEAD" && typeof event.body === "string";
	const body = hasBody ? (event.isBase64Encoded ? Buffer.from(event.body ?? "", "base64") : event.body) : undefined;
	return new Request(`${origin}${event.rawPath}${query}`, { method, headers, body });
}

function isTextResponse(contentType: string): boolean {
	return /^(text\/|application\/(json|javascript|xml))/i.test(contentType) || contentType.includes("charset=");
}

export async function fromResponse(response: Response): Promise<LambdaFunctionUrlResult> {
	const headers: Record<string, string> = {};
	response.headers.forEach((value, name) => {
		headers[name] = value;
	});
	const contentType = response.headers.get("content-type") ?? "";
	if (isTextResponse(contentType) || contentType === "") {
		return { statusCode: response.status, headers, body: await response.text(), isBase64Encoded: false };
	}
	const bytes = Buffer.from(await response.arrayBuffer());
	return { statusCode: response.status, headers, body: bytes.toString("base64"), isBase64Encoded: true };
}

function jsonResponse(body: unknown, status: number, extraHeaders: Record<string, string> = {}): Response {
	return Response.json(body, { status, headers: { ...NO_STORE_JSON, ...extraHeaders } });
}

function trimTrailingSlash(pathname: string): string {
	return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

export function createApiRouter(environment: LambdaEnvironment): (request: Request) => Promise<Response> {
	const handleLeaderboardApiRequest = createLeaderboardApiHandler({ awaitStaleRefresh: true });
	let geoHandlers: GeoApiHandlers | undefined;
	function getGeoHandlers(): GeoApiHandlers {
		geoHandlers ??= createGeoApiHandlers({
			development: environment.development,
			ipdataApiKey: environment.ipdataApiKey,
			resolveClientIp: (request) => request.headers.get(CLIENT_IP_HEADER) ?? undefined,
			fetch: environment.fetch,
			now: environment.now,
		});
		return geoHandlers;
	}

	return async function route(request) {
		const pathname = trimTrailingSlash(new URL(request.url).pathname);
		if (pathname === HEALTH_API_PATH) {
			if (request.method !== "GET" && request.method !== "HEAD") {
				return jsonResponse({ error: "Method not allowed" }, 405, { allow: "GET" });
			}
			return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
		}
		if (pathname === GEO_API_PATH) return getGeoHandlers().geo(request);
		if (pathname === REFERRAL_GEO_API_PATH) return getGeoHandlers().referralActionGeo(request);
		if (pathname === CLIENT_ERROR_REPORT_API_PATH || pathname === LEGACY_CLIENT_ERROR_REPORT_PATH) {
			if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405, { allow: "POST" });
			return handleClientErrorReport(request, {
				resolveClientIp: (report) => report.headers.get(CLIENT_IP_HEADER) ?? undefined,
			});
		}
		if (pathname === LEADERBOARD_API_PATH) {
			if (request.method !== "GET" && request.method !== "HEAD") {
				return jsonResponse({ error: "Method not allowed" }, 405, { allow: "GET" });
			}
			return handleLeaderboardApiRequest(request);
		}
		return jsonResponse({ error: "Not found" }, 404);
	};
}

export function createLambdaHandler(environment: LambdaEnvironment) {
	const route = createApiRouter(environment);
	return async function handler(event: LambdaFunctionUrlEvent): Promise<LambdaFunctionUrlResult> {
		const request = toRequest(event, environment);
		try {
			return await fromResponse(await route(request));
		} catch (error) {
			console.error(JSON.stringify({ event: "api_handler_failure", path: event.rawPath, message: String(error) }));
			return fromResponse(jsonResponse({ error: "Internal error" }, 500));
		}
	};
}

export const handler = createLambdaHandler({
	development: false,
	ipdataApiKey: () => process.env.IPDATA_API_KEY,
	publicOrigin: process.env.SAIRN_PUBLIC_ORIGIN,
	trustViewerAddress: process.env.SAIRN_TRUST_VIEWER_ADDRESS !== "false",
});
