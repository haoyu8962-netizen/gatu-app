import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const startMarketCatalogBootstrap = vi.fn();
const preloadAppRuntimeOverlays = vi.fn<() => Promise<void>>();
const preloadTradeTerminalSurface = vi.fn<() => Promise<void>>();
const bootOrderbook = vi.fn();

vi.mock("@/lib/hyperliquid/markets/market-catalog-bootstrap", () => ({ startMarketCatalogBootstrap }));
vi.mock("@/components/app-runtime-overlays", () => ({ preloadAppRuntimeOverlays }));
vi.mock("@/components/trade/preload-trade-terminal-surface", () => ({ preloadTradeTerminalSurface }));
vi.mock("@/lib/trade/orderbook-boot", () => ({ bootOrderbook }));

function controlled() {
	let resolve: () => void = () => {};
	let reject: (error: unknown) => void = () => {};
	const promise = new Promise<void>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

async function settled(promise: Promise<void>): Promise<boolean> {
	let done = false;
	promise.then(
		() => {
			done = true;
		},
		() => {
			done = true;
		},
	);
	await new Promise((resolveTick) => setTimeout(resolveTick, 0));
	return done;
}

describe("bootTradeRoute", () => {
	beforeEach(() => {
		startMarketCatalogBootstrap.mockReset();
		preloadAppRuntimeOverlays.mockReset().mockResolvedValue(undefined);
		preloadTradeTerminalSurface.mockReset().mockResolvedValue(undefined);
		bootOrderbook.mockReset();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("starts the catalog and the order book synchronously and settles after every first-render lazy resolves", async () => {
		const overlays = controlled();
		const surface = controlled();
		preloadAppRuntimeOverlays.mockReturnValue(overlays.promise);
		preloadTradeTerminalSurface.mockReturnValue(surface.promise);
		const { bootTradeRoute } = await import("@/lib/trade/trade-route-boot");
		const queryClient = {} as never;
		const reveal = bootTradeRoute(queryClient, "/trade/HYPE");
		expect(startMarketCatalogBootstrap).toHaveBeenCalledWith(queryClient);
		expect(bootOrderbook).toHaveBeenCalledWith("/trade/HYPE");
		expect(preloadAppRuntimeOverlays).toHaveBeenCalledTimes(1);
		await vi.waitFor(() => expect(preloadTradeTerminalSurface).toHaveBeenCalledTimes(1));
		overlays.resolve();
		await Promise.resolve();
		expect(await settled(reveal)).toBe(false);
		surface.resolve();
		await expect(reveal).resolves.toBeUndefined();
	});

	it("reveals anyway when a preload fails", async () => {
		preloadTradeTerminalSurface.mockRejectedValue(new Error("chunk missing"));
		const { bootTradeRoute } = await import("@/lib/trade/trade-route-boot");
		await expect(bootTradeRoute({} as never, "/trade/HYPE")).resolves.toBeUndefined();
	});

	it("reveals at the budget when a preload never settles", async () => {
		vi.useFakeTimers();
		preloadTradeTerminalSurface.mockReturnValue(new Promise<void>(() => {}));
		const { bootTradeRoute, TRADE_ROUTE_REVEAL_BUDGET_MS } = await import("@/lib/trade/trade-route-boot");
		const reveal = bootTradeRoute({} as never, "/trade/HYPE");
		let revealed = false;
		reveal.then(() => {
			revealed = true;
		});
		await vi.advanceTimersByTimeAsync(TRADE_ROUTE_REVEAL_BUDGET_MS - 1);
		expect(revealed).toBe(false);
		await vi.advanceTimersByTimeAsync(1);
		await expect(reveal).resolves.toBeUndefined();
	});
});
