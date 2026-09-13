import { getRequestIP } from "@tanstack/react-start/server";
import { createGeoApiHandlers, type GeoApiHandlers } from "@/lib/geo/geo-api";

let handlers: GeoApiHandlers | undefined;

/**
 * Nitro adapter for the portable geo handlers. The client IP comes from the trusted proxy
 * chain (`X-Forwarded-For` as rewritten by Caddy), and the IPdata key stays in server
 * environment variables. Created lazily so the route module never touches `process` when it
 * is evaluated outside the server.
 */
export function getGeoApiHandlers(): GeoApiHandlers {
	handlers ??= createGeoApiHandlers({
		development: import.meta.env.DEV && process.env.NODE_ENV === "development",
		ipdataApiKey: () => process.env.IPDATA_API_KEY,
		resolveClientIp: () => getRequestIP({ xForwardedFor: true }),
	});
	return handlers;
}
