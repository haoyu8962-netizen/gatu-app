import { beforeEach, describe, expect, it, vi } from "vitest";

const startGeoPrefetch = vi.fn();
const startSurfacePreloads = vi.fn();
vi.mock("@/lib/geo/geo-prefetch", () => ({ shouldPrefetchGeo: () => true, startGeoPrefetch }));
vi.mock("@/lib/preload/surface-preloads", () => ({ startSurfacePreloads }));

describe("startEarlyPrefetches", () => {
	beforeEach(() => {
		startGeoPrefetch.mockReset();
		startSurfacePreloads.mockReset();
	});

	it("appends the trade-only surface preloads on terminal routes only", async () => {
		const { startEarlyPrefetches } = await import("@/lib/bootstrap/early-prefetch");
		startEarlyPrefetches("/trade/HYPE");
		expect(startSurfacePreloads).toHaveBeenCalledTimes(1);
		startEarlyPrefetches("/portfolio");
		startEarlyPrefetches("/leaderboard");
		expect(startSurfacePreloads).toHaveBeenCalledTimes(1);
		expect(startGeoPrefetch).toHaveBeenCalledTimes(3);
	});
});
