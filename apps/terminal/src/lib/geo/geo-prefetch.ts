import { GEO_API_PATH } from "@/config/api-paths";

/** Shared by the prefetch and `getGeo`, so the early response is reusable by the later request. */
export const GEO_REQUEST_INIT: RequestInit = {
	headers: { accept: "application/json" },
	cache: "no-store",
	credentials: "omit",
	mode: "same-origin",
};

let pendingGeoResponse: Promise<Response> | undefined;

/**
 * Starts the jurisdiction lookup from the bootstrap entry, before the wallet runtime chunks
 * arrive, so the verdict is usually ready by the time the terminal mounts. Only the first call
 * per page load sends a request; `takeGeoPrefetch` hands the response to exactly one consumer.
 */
export function startGeoPrefetch(fetchImpl: typeof fetch = fetch): void {
	if (pendingGeoResponse) return;
	pendingGeoResponse = fetchImpl(GEO_API_PATH, GEO_REQUEST_INIT);
	pendingGeoResponse.catch(() => {});
}

export function takeGeoPrefetch(): Promise<Response> | undefined {
	const pending = pendingGeoResponse;
	pendingGeoResponse = undefined;
	return pending;
}
