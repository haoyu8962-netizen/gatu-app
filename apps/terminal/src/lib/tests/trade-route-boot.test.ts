import { beforeEach, describe, expect, it, vi } from "vitest";

const startMarketCatalogBootstrap = vi.fn();
const preloadAppRuntimeOverlays = vi.fn();
const preloadTradeTerminalSurface = vi.fn();

vi.mock("@/lib/hyperliquid/markets/market-catalog-bootstrap", () => ({ startMarketCatalogBootstrap }));
vi.mock("@/components/app-runtime-overlays", () => ({ preloadAppRuntimeOverlays }));
vi.mock("@/components/trade/trade-terminal-page", () => ({ preloadTradeTerminalSurface }));

describe("bootTradeRoute", () => {
	beforeEach(() => {
		startMarketCatalogBootstrap.mockReset();
		preloadAppRuntimeOverlays.mockReset();
		preloadTradeTerminalSurface.mockReset();
	});

	it("starts the market catalog and resolves every lazy piece of the first terminal render", async () => {
		const { bootTradeRoute } = await import("@/lib/trade/trade-route-boot");
		const queryClient = {} as never;
		bootTradeRoute(queryClient);
		expect(startMarketCatalogBootstrap).toHaveBeenCalledWith(queryClient);
		expect(preloadAppRuntimeOverlays).toHaveBeenCalledTimes(1);
		await vi.waitFor(() => expect(preloadTradeTerminalSurface).toHaveBeenCalledTimes(1));
	});
});
