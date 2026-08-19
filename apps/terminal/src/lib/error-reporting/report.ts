import { L2_BOOK_STREAM_ERROR_CODES, type L2BookStreamErrorCode } from "@gatu/hl-react/subscriptions/l2";

export const CLIENT_ERROR_REPORT_ENDPOINT = "/client-error-report";
export const CLIENT_ERROR_REPORT_MAX_BYTES = 4096;
export const CLIENT_ERROR_REPORT_MAX_FRAMES = 5;

export const CLIENT_ERROR_KINDS = [
	"react_boundary",
	"router_boundary",
	"react_uncaught",
	"react_recoverable",
	"orderbook_l2_fallback",
	"window_error",
	"unhandled_rejection",
] as const;

export const CLIENT_ERROR_CATEGORIES = [
	"chunk_load",
	"hydration",
	"network",
	"permission",
	"storage",
	"runtime",
] as const;

export const CLIENT_ERROR_ROUTES = [
	"root",
	"trade",
	"spot",
	"perp",
	"portfolio",
	"builders-perp",
	"mobile-agent-sync",
	"docs",
	"legal",
	"support",
	"other",
] as const;

export const CLIENT_ERROR_NAMES = [
	"AggregateError",
	"DOMException",
	"Error",
	"EvalError",
	"NetworkError",
	"NonError",
	"NotAllowedError",
	"QuotaExceededError",
	"RangeError",
	"ReferenceError",
	"SecurityError",
	"SyntaxError",
	"TypeError",
	"URIError",
] as const;

export type ClientErrorKind = (typeof CLIENT_ERROR_KINDS)[number];
export type ClientErrorCategory = (typeof CLIENT_ERROR_CATEGORIES)[number];
export type ClientErrorRoute = (typeof CLIENT_ERROR_ROUTES)[number];
export type ClientErrorName = (typeof CLIENT_ERROR_NAMES)[number];

export interface ClientErrorReport {
	schema: 1;
	kind: ClientErrorKind;
	fallbackReason?: L2BookStreamErrorCode;
	category: ClientErrorCategory;
	errorName: ClientErrorName;
	route: ClientErrorRoute;
	frames: string[];
	componentFrames: string[];
}

interface CreateClientErrorReportBaseOptions {
	pathname: string;
	origin: string;
	componentStack?: string;
}

export type CreateClientErrorReportOptions = CreateClientErrorReportBaseOptions &
	(
		| {
				kind: "orderbook_l2_fallback";
				fallbackReason: L2BookStreamErrorCode;
		  }
		| {
				kind: Exclude<ClientErrorKind, "orderbook_l2_fallback">;
				fallbackReason?: never;
		  }
	);

const CLIENT_ERROR_KIND_SET = new Set<string>(CLIENT_ERROR_KINDS);
const L2_FALLBACK_REASON_SET = new Set<string>(L2_BOOK_STREAM_ERROR_CODES);
const CLIENT_ERROR_CATEGORY_SET = new Set<string>(CLIENT_ERROR_CATEGORIES);
const CLIENT_ERROR_ROUTE_SET = new Set<string>(CLIENT_ERROR_ROUTES);
const CLIENT_ERROR_NAME_SET = new Set<string>(CLIENT_ERROR_NAMES);
const REPORT_KEYS = new Set([
	"schema",
	"kind",
	"fallbackReason",
	"category",
	"errorName",
	"route",
	"frames",
	"componentFrames",
]);
const SAFE_FRAME_PATTERN = /^(?:asset|source):[1-9][0-9]{0,6}:[0-9]{1,5}$/;
const ASSET_SOURCE_PATTERN = /^\/assets\/[A-Za-z0-9._~-]{1,180}\.(?:js|mjs)$/;
const DEVELOPMENT_SOURCE_PATTERN = /^\/src\/[A-Za-z0-9_./@~-]{1,220}\.(?:js|jsx|ts|tsx)$/;
const STACK_LOCATION_PATTERN = /(https?:\/\/[^\s)]+?|\/(?:assets|src)\/[^\s)]+?):([1-9][0-9]{0,6}):([0-9]{1,5})/g;

export function createClientErrorReport(error: unknown, options: CreateClientErrorReportOptions): ClientErrorReport {
	const details = readErrorDetails(error);

	return {
		schema: 1,
		kind: options.kind,
		...(options.kind === "orderbook_l2_fallback" ? { fallbackReason: options.fallbackReason } : {}),
		category: classifyError(details.name, details.message),
		errorName: normalizeErrorName(details.name),
		route: classifyRoute(options.pathname),
		frames: extractSafeFrames(details.stack, options.origin),
		componentFrames: extractSafeFrames(options.componentStack, options.origin),
	};
}

export function parseClientErrorReport(value: unknown): ClientErrorReport | null {
	if (!isRecord(value) || Object.keys(value).some((key) => !REPORT_KEYS.has(key))) return null;
	if (value.schema !== 1) return null;
	if (!isEnumValue(value.kind, CLIENT_ERROR_KIND_SET)) return null;
	if (value.kind === "orderbook_l2_fallback") {
		if (!isEnumValue(value.fallbackReason, L2_FALLBACK_REASON_SET)) return null;
	} else if (value.fallbackReason !== undefined) {
		return null;
	}
	if (!isEnumValue(value.category, CLIENT_ERROR_CATEGORY_SET)) return null;
	if (!isEnumValue(value.errorName, CLIENT_ERROR_NAME_SET)) return null;
	if (!isEnumValue(value.route, CLIENT_ERROR_ROUTE_SET)) return null;
	if (!isSafeFrameArray(value.frames) || !isSafeFrameArray(value.componentFrames)) return null;

	return {
		schema: 1,
		kind: value.kind as ClientErrorKind,
		...(value.kind === "orderbook_l2_fallback"
			? { fallbackReason: value.fallbackReason as L2BookStreamErrorCode }
			: {}),
		category: value.category as ClientErrorCategory,
		errorName: value.errorName as ClientErrorName,
		route: value.route as ClientErrorRoute,
		frames: [...value.frames],
		componentFrames: [...value.componentFrames],
	};
}

function readErrorDetails(error: unknown): { name: string; message: string; stack?: string } {
	if (!(error instanceof Error)) {
		return {
			name: "NonError",
			message: typeof error === "string" ? error.slice(0, 2048) : "",
		};
	}

	try {
		return {
			name: error.name,
			message: error.message.slice(0, 2048),
			stack: typeof error.stack === "string" ? error.stack.slice(0, 20_000) : undefined,
		};
	} catch {
		return { name: "Error", message: "" };
	}
}

function normalizeErrorName(name: string): ClientErrorName {
	return CLIENT_ERROR_NAME_SET.has(name) ? (name as ClientErrorName) : "Error";
}

function classifyError(name: string, message: string): ClientErrorCategory {
	const description = `${name}\n${message}`.toLowerCase();

	if (
		description.includes("chunkloaderror") ||
		description.includes("loading chunk") ||
		description.includes("dynamically imported module")
	) {
		return "chunk_load";
	}
	if (description.includes("hydration") || description.includes("hydrating")) return "hydration";
	if (
		name === "NetworkError" ||
		description.includes("failed to fetch") ||
		description.includes("network request failed")
	) {
		return "network";
	}
	if (name === "NotAllowedError" || name === "SecurityError") return "permission";
	if (name === "QuotaExceededError") return "storage";
	return "runtime";
}

function classifyRoute(pathname: string): ClientErrorRoute {
	if (pathname === "/") return "root";
	if (pathname === "/trade" || pathname.startsWith("/trade/")) return "trade";
	if (pathname === "/spot" || pathname.startsWith("/spot/")) return "spot";
	if (pathname === "/perp" || pathname.startsWith("/perp/")) return "perp";
	if (pathname === "/portfolio" || pathname.startsWith("/portfolio/")) return "portfolio";
	if (pathname === "/builders-perp" || pathname.startsWith("/builders-perp/")) return "builders-perp";
	if (pathname === "/mobile-agent-sync" || pathname === "/mobile-agent-sync/") return "mobile-agent-sync";
	if (pathname === "/docs" || pathname.startsWith("/docs/")) return "docs";
	if (pathname === "/privacy" || pathname === "/risk" || pathname === "/terms") return "legal";
	if (pathname === "/support") return "support";
	return "other";
}

function extractSafeFrames(stack: string | undefined, origin: string): string[] {
	if (!stack) return [];

	const frames: string[] = [];
	for (const match of stack.matchAll(STACK_LOCATION_PATTERN)) {
		const [, source, line, column] = match;
		if (!source || !line || !column) continue;

		try {
			const url = new URL(source, origin);
			if (url.origin !== origin) continue;

			const sourceKind = ASSET_SOURCE_PATTERN.test(url.pathname)
				? "asset"
				: DEVELOPMENT_SOURCE_PATTERN.test(url.pathname)
					? "source"
					: null;
			if (!sourceKind) continue;

			const frame = `${sourceKind}:${line}:${column}`;
			if (frames.includes(frame)) continue;
			frames.push(frame);
			if (frames.length === CLIENT_ERROR_REPORT_MAX_FRAMES) break;
		} catch {}
	}
	return frames;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEnumValue(value: unknown, values: Set<string>): value is string {
	return typeof value === "string" && values.has(value);
}

function isSafeFrameArray(value: unknown): value is string[] {
	return (
		Array.isArray(value) &&
		value.length <= CLIENT_ERROR_REPORT_MAX_FRAMES &&
		value.every((frame) => typeof frame === "string" && SAFE_FRAME_PATTERN.test(frame))
	);
}
