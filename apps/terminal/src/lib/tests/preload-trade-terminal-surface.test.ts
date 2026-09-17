// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const lazies = vi.hoisted(() => ({
	names: [] as string[],
	resolvers: new Map<string, () => void>(),
}));
const preloadDesktopTerminalSurface = vi.fn<() => Promise<void>>();
const preloadGlobalModals = vi.fn<() => Promise<void>>();
const preloadTopNav = vi.fn<() => Promise<void>>();
const preloadMainWorkspacePanels = vi.fn<() => Promise<void>>();

vi.mock("@/lib/lazy", () => ({
	createLazyComponent: (_importer: unknown, name: string) => ({
		preload: () =>
			new Promise<void>((resolveLazy) => {
				lazies.names.push(name);
				lazies.resolvers.set(name, resolveLazy);
			}),
	}),
	preloadLazyComponents: (components: ReadonlyArray<{ preload?: () => Promise<void> }>) =>
		Promise.all(components.map((component) => component.preload?.())).then(() => undefined),
}));
vi.mock("@/components/trade/trade-terminal-page", () => ({ preloadGlobalModals }));
vi.mock("@/components/trade/header/top-nav", () => ({ preloadTopNav, TopNav: () => null }));
vi.mock("@/components/trade/layout/main-workspace", () => ({ preloadMainWorkspacePanels, MainWorkspace: () => null }));
vi.mock("@/stores/use-global-settings-store", () => ({ useIsTestnet: () => false }));
vi.mock("@/components/trade/geo/geo-restriction-banner", () => ({ GeoRestrictionBanner: () => null }));
vi.mock("@/components/trade/testnet-banner", () => ({ TestnetBanner: () => null }));
vi.mock("@/components/trade/layout/desktop-terminal-frame-view", () => ({ DesktopTerminalFrameView: () => null }));

function controlled() {
	let release: () => void = () => {};
	const promise = new Promise<void>((resolveControlled) => {
		release = resolveControlled;
	});
	return { promise, release };
}

async function settled(promise: Promise<unknown>): Promise<boolean> {
	const marker = Symbol("pending");
	return (await Promise.race([promise.then(() => true), Promise.resolve(marker)])) === true;
}

const tradeDir = resolve(__dirname, "../../components/trade");
const source = (path: string) => readFileSync(resolve(tradeDir, path), "utf8");

describe("first-render preload set (ADR 0012)", () => {
	beforeEach(() => {
		lazies.names.length = 0;
		lazies.resolvers.clear();
		preloadGlobalModals.mockReset().mockResolvedValue(undefined);
		preloadTopNav.mockReset().mockResolvedValue(undefined);
		preloadMainWorkspacePanels.mockReset().mockResolvedValue(undefined);
	});

	it("settles the desktop surface only after the footer, navigation pieces and workspace panels resolve", async () => {
		const nav = controlled();
		const panels = controlled();
		preloadTopNav.mockReturnValue(nav.promise);
		preloadMainWorkspacePanels.mockReturnValue(panels.promise);
		const { preloadDesktopTerminalSurface: preloadSurface } = await import(
			"@/components/trade/layout/desktop-terminal-surface"
		);
		const done = preloadSurface();
		expect(lazies.names).toEqual(["FooterBar"]);
		lazies.resolvers.get("FooterBar")?.();
		nav.release();
		await Promise.resolve();
		expect(await settled(done)).toBe(false);
		panels.release();
		await expect(done).resolves.toBeUndefined();
	});

	it("waits for global modals and the desktop surface on desktop, and only modals on mobile", async () => {
		const modals = controlled();
		const surface = controlled();
		preloadGlobalModals.mockReturnValue(modals.promise);
		vi.doMock("@/components/trade/layout/desktop-terminal-surface", () => ({
			preloadDesktopTerminalSurface: preloadDesktopTerminalSurface.mockReturnValue(surface.promise),
		}));
		const { preloadTradeTerminalSurface } = await import("@/components/trade/preload-trade-terminal-surface");
		const done = preloadTradeTerminalSurface();
		modals.release();
		await Promise.resolve();
		expect(await settled(done)).toBe(false);
		surface.release();
		await expect(done).resolves.toBeUndefined();
		expect(preloadDesktopTerminalSurface).toHaveBeenCalledTimes(1);

		Object.defineProperty(window, "matchMedia", {
			configurable: true,
			value: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }),
		});
		try {
			preloadGlobalModals.mockResolvedValue(undefined);
			await expect(preloadTradeTerminalSurface()).resolves.toBeUndefined();
			expect(preloadDesktopTerminalSurface).toHaveBeenCalledTimes(1);
		} finally {
			Reflect.deleteProperty(window, "matchMedia");
		}
	});

	it("preloads the runtime overlays that render with the first frame", async () => {
		const { preloadAppRuntimeOverlays } = await import("@/components/app-runtime-overlays");
		const done = preloadAppRuntimeOverlays();
		expect(lazies.names).toEqual(["Toaster", "FundsActionRecoveryHost"]);
		for (const release of lazies.resolvers.values()) release();
		await expect(done).resolves.toBeUndefined();
	});

	it("pins every first-render lazy to its owner's preload set", () => {
		expect(source("layout/main-workspace.tsx")).toContain(
			"preloadLazyComponents([AccountPanel, ChartPanel, OrderbookPanel, PositionsPanel, TradePanel])",
		);
		expect(source("layout/main-workspace.tsx")).toMatch(
			/Promise\.all\(\[[\s\S]*preloadChartPanel\(\)[\s\S]*preloadPositionsPanel\(\)[\s\S]*\]\)/,
		);
		expect(source("chart/chart-panel.tsx")).toContain("preloadLazyComponents([TradingViewChart])");
		expect(source("positions/positions-panel.tsx")).toContain("preloadLazyComponents([PositionsTab])");
		expect(source("header/top-nav.tsx")).toContain("preloadLazyComponents([UserMenu])");
		expect(source("trade-terminal-page.tsx")).toContain("preloadLazyComponents([GlobalModals])");
	});
});
