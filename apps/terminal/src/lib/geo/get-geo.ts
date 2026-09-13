import { GEO_API_PATH } from "@/config/api-paths";
import type { GeoVerdict } from "@/config/geo";
import { geoVerdictSchema } from "@/lib/geo/geo-contracts";
import { GEO_REQUEST_INIT, takeGeoPrefetch } from "@/lib/geo/geo-prefetch";

const GEO_UNAVAILABLE_MESSAGE = "Geo restriction check unavailable";

export interface GetGeoInput {
	data: { override: string | null };
}

async function fetchGeoResponse(override: string | null): Promise<Response> {
	if (!override) {
		try {
			const prefetched = await takeGeoPrefetch();
			if (prefetched) return prefetched;
		} catch {}
	}
	const search = override ? `?${new URLSearchParams({ override })}` : "";
	return fetch(`${GEO_API_PATH}${search}`, GEO_REQUEST_INIT);
}

async function readErrorMessage(response: Response): Promise<string> {
	try {
		const body = (await response.json()) as { error?: unknown };
		return typeof body.error === "string" && body.error ? body.error : GEO_UNAVAILABLE_MESSAGE;
	} catch {
		return GEO_UNAVAILABLE_MESSAGE;
	}
}

/**
 * Resolves the visitor's jurisdiction through the same-origin geo endpoint, so the client IP and
 * the provider API key never reach the browser. Browsing is never blocked: callers only use
 * the verdict to decide whether trading and funds actions are allowed, and any failure here
 * fails closed for those actions.
 */
export async function getGeo({ data }: GetGeoInput): Promise<GeoVerdict> {
	const response = await fetchGeoResponse(data.override);
	if (!response.ok) throw new Error(await readErrorMessage(response));

	const parsed = geoVerdictSchema.safeParse(await response.json());
	if (!parsed.success) throw new Error(GEO_UNAVAILABLE_MESSAGE);
	return parsed.data;
}
