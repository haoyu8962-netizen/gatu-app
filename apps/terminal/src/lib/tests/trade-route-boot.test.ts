import { beforeEach, describe, expect, it, vi } from "vitest";

const startMarketCatalogBootstrap = vi.fn();
const preloadAppRuntimeOverlays = vi.fn();
const preloadTradeTerminalSurface = vi.fn();
const bootOrderbook = vi.fn();

vi.mock("@/lib/hyperliquid/markets/market-catalog-bootstrap", () => ({ startMarketCatalogBootstrap }));
vi.mock("@/components/app-runtime-overlays", () => ({ preloadAppRuntimeOverlays }));
vi.mock("@/components/trade/trade-terminal-page", () => ({ preloadTradeTerminalSurface }));
vi.mock("@/lib/trade/orderbook-boot", () => ({ bootOrderbook }));

describe("bootTradeRoute", () => {
	beforeEach(() => {
		startMarketCatalogBootstrap.mockReset();
		preloadAppRuntimeOverlays.mockReset();
		preloadTradeTerminalSurface.mockReset();
		bootOrderbook.mockReset();
	});

	it("starts the catalog and the order book, and resolves every lazy piece of the first render", async () => {
		const { bootTradeRoute } = await import("@/lib/trade/trade-route-boot");
		const queryClient = {} as never;
		bootTradeRoute(queryClient, "/trade/HYPE");
		expect(startMarketCatalogBootstrap).toHaveBeenCalledWith(queryClient);
		expect(bootOrderbook).toHaveBeenCalledWith("/trade/HYPE");
		expect(preloadAppRuntimeOverlays).toHaveBeenCalledTimes(1);
		await vi.waitFor(() => expect(preloadTradeTerminalSurface).toHaveBeenCalledTimes(1));
	});
});
