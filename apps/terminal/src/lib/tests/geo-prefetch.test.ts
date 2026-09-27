import { afterEach, describe, expect, it, vi } from "vitest";
import { GEO_API_PATH } from "@/config/api-paths";
import { GEO_REQUEST_INIT, startGeoPrefetch, takeGeoPrefetch } from "@/lib/geo/geo-prefetch";
import { getGeo } from "@/lib/geo/get-geo";

const VERDICT = { country: "GB", tradeRestricted: false, proxy: false };

describe("geo prefetch", () => {
	afterEach(() => {
		takeGeoPrefetch();
		vi.unstubAllGlobals();
	});

	it("sends one request and hands the response to exactly one consumer", async () => {
		const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(VERDICT));
		startGeoPrefetch(fetchMock);
		startGeoPrefetch(fetchMock);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock).toHaveBeenCalledWith(GEO_API_PATH, GEO_REQUEST_INIT);
		const pending = takeGeoPrefetch();
		expect(pending).toBeInstanceOf(Promise);
		expect(takeGeoPrefetch()).toBeUndefined();
		await expect(pending).resolves.toBeInstanceOf(Response);
	});

	it("lets getGeo reuse the prefetched response instead of fetching again", async () => {
		const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(Response.json(VERDICT)));
		vi.stubGlobal("fetch", fetchMock);
		startGeoPrefetch(fetchMock);
		await expect(getGeo({ data: { override: null } })).resolves.toEqual(VERDICT);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		await expect(getGeo({ data: { override: null } })).resolves.toEqual(VERDICT);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("falls back to a fresh request when the prefetch failed or an override is requested", async () => {
		const fetchMock = vi
			.fn<typeof fetch>(() => Promise.resolve(Response.json(VERDICT)))
			.mockRejectedValueOnce(new Error("offline"));
		vi.stubGlobal("fetch", fetchMock);
		startGeoPrefetch(fetchMock);
		await expect(getGeo({ data: { override: null } })).resolves.toEqual(VERDICT);
		expect(fetchMock).toHaveBeenCalledTimes(2);

		startGeoPrefetch(fetchMock);
		await expect(getGeo({ data: { override: "GB" } })).resolves.toEqual(VERDICT);
		expect(String(fetchMock.mock.calls.at(-1)?.[0])).toBe(`${GEO_API_PATH}?override=GB`);
		expect(takeGeoPrefetch()).toBeInstanceOf(Promise);
	});
});
