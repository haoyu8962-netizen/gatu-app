// @vitest-environment jsdom

import type { PerpAnnotationResponse, PerpConciseAnnotationsResponse, TokenDetailsResponse } from "@nktkas/hyperliquid";
import { act, createElement, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UnifiedMarketInfo } from "@/lib/hyperliquid";
import { createI18nRoot } from "./harness/react";

const HYPE_TOKEN_ID = "0x0d01dc56dcaaca66ad901c959b4011ec";
const SOLANA_TOKEN_ID = "0x49b67c39f5566535de22b29b0e51e685";
const USDC_TOKEN_ID = "0x6d1e7cde53ba9467b783cb7c530ce054";

const testState = vi.hoisted(() => ({
	annotation: undefined as PerpAnnotationResponse | undefined,
	annotationError: false,
	annotationPending: true,
	annotationRefetch: vi.fn(),
	conciseAnnotations: undefined as PerpConciseAnnotationsResponse | undefined,
	conciseError: false,
	concisePending: true,
	conciseRefetch: vi.fn(),
	tokenDetails: undefined as TokenDetailsResponse | undefined,
	tokenDetailsError: false,
	tokenDetailsPending: true,
	tokenDetailsRefetch: vi.fn(),
	isMobile: false,
	useInfo: vi.fn(),
}));

vi.mock("@/hooks/use-mobile", () => ({
	useIsMobile: () => testState.isMobile,
}));

vi.mock("@/lib/hyperliquid", () => ({
	getExplorerTokenUrl: (tokenId: string) => `/explorer/token/${tokenId}`,
	useInfo: (method: string, params: unknown, options: unknown) => {
		testState.useInfo(method, params, options);
		if (method === "perpConciseAnnotations") {
			return {
				data: testState.conciseAnnotations,
				isError: testState.conciseError,
				isPending: testState.concisePending,
				refetch: testState.conciseRefetch,
			};
		}
		if (method === "tokenDetails") {
			return {
				data: testState.tokenDetails,
				isError: testState.tokenDetailsError,
				isPending: testState.tokenDetailsPending,
				refetch: testState.tokenDetailsRefetch,
			};
		}
		return {
			data: testState.annotation,
			isError: testState.annotationError,
			isPending: testState.annotationPending,
			refetch: testState.annotationRefetch,
		};
	},
}));

vi.mock("@/components/trade/components/asset-display", () => ({
	AssetDisplay: ({ coin }: { coin: string }) => createElement("span", { "data-coin": coin }),
}));

vi.mock("@gatu/ui", () => ({
	AdaptiveModal: ({
		children,
		className,
		open,
		onOpenChange: _onOpenChange,
		presentation,
	}: {
		children: ReactNode;
		className?: string;
		open: boolean;
		onOpenChange: (open: boolean) => void;
		presentation: string;
	}) =>
		open ? createElement("div", { className, "data-presentation": presentation, role: "dialog" }, children) : null,
	Button: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) =>
		createElement("button", { onClick, type: "button" }, children),
	ModalContent: ({ children, className }: { children: ReactNode; className?: string }) =>
		createElement("div", { className, "data-slot": "content" }, children),
	ModalDescription: ({ children, className }: { children: ReactNode; className?: string }) =>
		createElement("p", { className }, children),
	ModalHeader: ({ children, className }: { children: ReactNode; className?: string }) =>
		createElement("header", { className }, children),
	ModalTitle: ({ children, className }: { children: ReactNode; className?: string }) =>
		createElement("h2", { className }, children),
	Tooltip: ({ children, content }: { children: ReactNode; content: ReactNode }) =>
		createElement(
			"span",
			{ "data-tooltip": "asset-information" },
			children,
			createElement("span", { "data-tooltip-content": true }, content),
		),
}));

const BUILDER_MARKET = {
	kind: "builderPerp",
	name: "xyz:BOT",
	pairName: "BOT-USDC",
	iconUrl: "/coins/BOT.svg",
	dex: "xyz",
} as UnifiedMarketInfo;

const HYPE_PERP_MARKET = {
	kind: "perp",
	name: "HYPE",
	shortName: "HYPE",
	pairName: "HYPE-USDC",
	iconUrl: "/coins/HYPE.svg",
} as UnifiedMarketInfo;

const AAVE_PERP_MARKET = {
	kind: "perp",
	name: "AAVE",
	shortName: "AAVE",
	pairName: "AAVE-USDC",
	iconUrl: "/coins/AAVE.svg",
} as UnifiedMarketInfo;

const SPOT_MARKET = {
	kind: "spot",
	name: "@107",
	pairName: "HYPE-USDC",
	iconUrl: "/coins/HYPE.svg",
	tokensInfo: [
		{
			displayName: "HYPE",
			fullName: "Hyperliquid",
			tokenId: HYPE_TOKEN_ID,
		},
		{
			displayName: "USDC",
			fullName: null,
			tokenId: USDC_TOKEN_ID,
		},
	],
} as unknown as UnifiedMarketInfo;

const UNIT_SOL_SPOT_MARKET = {
	kind: "spot",
	name: "@150",
	pairName: "SOL-USDC",
	iconUrl: "/coins/SOL.svg",
	tokensInfo: [
		{
			displayName: "SOL",
			fullName: "Unit Solana",
			tokenId: SOLANA_TOKEN_ID,
		},
		{
			displayName: "USDC",
			fullName: null,
			tokenId: USDC_TOKEN_ID,
		},
	],
} as unknown as UnifiedMarketInfo;

const GENERIC_SPOT_MARKET = {
	kind: "spot",
	name: "@999",
	pairName: "APU-USDC",
	iconUrl: "/coins/APU.svg",
	tokensInfo: [
		{
			displayName: "APU",
			fullName: null,
			tokenId: "0x11111111111111111111111111111111",
		},
		{
			displayName: "USDC",
			fullName: null,
			tokenId: USDC_TOKEN_ID,
		},
	],
} as unknown as UnifiedMarketInfo;

describe("MarketAssetInfo", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		testState.annotation = undefined;
		testState.annotationError = false;
		testState.annotationPending = true;
		testState.annotationRefetch.mockReset();
		testState.conciseAnnotations = undefined;
		testState.conciseError = false;
		testState.concisePending = true;
		testState.conciseRefetch.mockReset();
		testState.tokenDetails = undefined;
		testState.tokenDetailsError = false;
		testState.tokenDetailsPending = true;
		testState.tokenDetailsRefetch.mockReset();
		testState.isMobile = false;
		testState.useInfo.mockReset();
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.clearAllMocks();
	});

	async function renderAssetInfo(market: UnifiedMarketInfo = BUILDER_MARKET) {
		const { MarketAssetInfo } = await import("@/components/trade/components/market-asset-info");
		act(() => root.render(createElement(MarketAssetInfo, { market })));
		return MarketAssetInfo;
	}

	function openDialog() {
		const trigger = container.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]');
		if (!trigger) throw new Error("Asset information trigger not found");
		act(() => trigger.click());
	}

	function findInfoCall(method: string) {
		return testState.useInfo.mock.calls.filter(([calledMethod]) => calledMethod === method).at(-1);
	}

	it("requests the canonical HIP-3 coin only after concise metadata confirms an annotation", async () => {
		testState.conciseAnnotations = [["xyz:BOT", { category: "stocks", displayName: "BOT" }]];
		testState.concisePending = false;
		await renderAssetInfo();

		expect(findInfoCall("perpAnnotation")).toEqual([
			"perpAnnotation",
			{ coin: "xyz:BOT" },
			expect.objectContaining({ enabled: false }),
		]);

		openDialog();

		expect(findInfoCall("perpAnnotation")).toEqual([
			"perpAnnotation",
			{ coin: "xyz:BOT" },
			expect.objectContaining({ enabled: true }),
		]);
		expect(container.querySelector('[role="dialog"]')?.getAttribute("data-presentation")).toBe("modal");
		expect(container.textContent).toContain("Loading asset information...");
	});

	it("renders deployer content as plain text and labels it as unverified", async () => {
		testState.conciseAnnotations = [["xyz:BOT", { category: "stocks" }]];
		testState.concisePending = false;
		const MarketAssetInfo = await renderAssetInfo();
		openDialog();
		testState.annotation = {
			category: "stocks",
			description: "BOT details <img src=x onerror=alert(1)>",
			displayName: "BOT",
			keywords: ["robot"],
		};
		testState.annotationPending = false;

		act(() => root.render(createElement(MarketAssetInfo, { market: BUILDER_MARKET })));

		expect(container.textContent).toContain("BOT details <img src=x onerror=alert(1)>");
		expect(container.querySelector("img")).toBeNull();
		expect(container.textContent).toContain("Treat it as unverified information.");
		expect(container.querySelector("h2")?.textContent).toBe("BOT-USDC");
	});

	it("degrades to a neutral notice when a confirmed annotation resolves to null", async () => {
		testState.conciseAnnotations = [["xyz:BOT", { category: "stocks" }]];
		testState.concisePending = false;
		testState.annotation = null;
		testState.annotationPending = false;
		await renderAssetInfo();
		openDialog();

		expect(container.textContent).toContain("No description has been provided for this market.");
		expect(container.querySelector('[role="alert"]')).toBeNull();
		expect([...container.querySelectorAll("button")].find((button) => button.textContent === "Retry")).toBeUndefined();
	});

	it("keeps the HIP-3 entry available and retries the concise list when it fails to load", async () => {
		testState.conciseError = true;
		testState.concisePending = false;
		await renderAssetInfo();

		expect(container.querySelector('button[aria-haspopup="dialog"]')).not.toBeNull();

		openDialog();

		expect(container.querySelector('[role="alert"]')?.textContent).toContain("Asset information could not be loaded.");

		const retryButton = [...container.querySelectorAll("button")].find((button) => button.textContent === "Retry");
		if (!retryButton) throw new Error("Retry button not found");
		act(() => retryButton.click());
		expect(testState.conciseRefetch).toHaveBeenCalledOnce();
		expect(testState.annotationRefetch).not.toHaveBeenCalled();
	});

	it("does not expose an empty dialog when a HIP-3 market has no annotation", async () => {
		testState.conciseAnnotations = [];
		testState.concisePending = false;
		await renderAssetInfo();

		expect(container.querySelector('button[aria-haspopup="dialog"]')).toBeNull();
		expect(container.querySelector('[data-coin="xyz:BOT"]')).not.toBeNull();
		expect(findInfoCall("perpAnnotation")).toEqual([
			"perpAnnotation",
			{ coin: "xyz:BOT" },
			expect.objectContaining({ enabled: false }),
		]);
	});

	it("uses local native-perp descriptions without requesting unavailable API annotations", async () => {
		await renderAssetInfo(HYPE_PERP_MARKET);

		expect(container.querySelector('[data-tooltip="asset-information"] button')).not.toBeNull();
		expect(container.querySelector("[data-tooltip-content]")?.textContent).toBe(
			"Click to learn more about this asset.",
		);
		expect(container.querySelector('[data-tooltip="asset-information"] button svg')).toBeNull();

		openDialog();

		expect(container.textContent).toContain("HYPE is the native token of Hyperliquid.");
		expect(container.textContent).not.toContain("No asset description is available");
		expect(findInfoCall("perpConciseAnnotations")).toEqual([
			"perpConciseAnnotations",
			undefined,
			expect.objectContaining({ enabled: false }),
		]);
		expect(findInfoCall("perpAnnotation")).toEqual([
			"perpAnnotation",
			{ coin: "" },
			expect.objectContaining({ enabled: false }),
		]);
	});

	it("provides a factual market fallback for native perps without local copy", async () => {
		testState.conciseAnnotations = [];
		testState.concisePending = false;
		await renderAssetInfo(AAVE_PERP_MARKET);
		openDialog();

		expect(container.textContent).toContain("AAVE is listed as a native Hyperliquid perpetual market.");
		expect(container.textContent).not.toContain("No asset description is available");
	});

	it("uses project-owned copy and a provider notice for Unit spot assets", async () => {
		await renderAssetInfo(UNIT_SOL_SPOT_MARKET);
		openDialog();

		expect(container.textContent).toContain(
			"Solana is a blockchain for smart contracts and decentralized applications designed for high-throughput execution.",
		);
		expect(container.textContent).toContain(
			"This spot asset is enabled independently by Unit, a third-party provider.",
		);
		expect(container.textContent).toContain("Unit Solana");
	});

	it("keeps every valid spot pair covered by a localized market fallback", async () => {
		await renderAssetInfo(GENERIC_SPOT_MARKET);
		openDialog();

		expect(container.textContent).toContain("This spot market trades APU against USDC on Hyperliquid.");
	});

	it("loads official tokenDetails for spot markets and renders structured metadata", async () => {
		const MarketAssetInfo = await renderAssetInfo(SPOT_MARKET);
		openDialog();

		expect(findInfoCall("tokenDetails")).toEqual([
			"tokenDetails",
			{ tokenId: HYPE_TOKEN_ID },
			expect.objectContaining({ enabled: true }),
		]);
		expect(container.textContent).toContain("HYPE is the native token of Hyperliquid.");
		expect(container.textContent).toContain("Hyperliquid");
		expect(container.textContent).toContain("Loading token metadata...");

		testState.tokenDetails = {
			name: "HYPE",
			maxSupply: "1000000000.0",
			totalSupply: "999076508.099842906",
			circulatingSupply: "298690514.6369722486",
			szDecimals: 2,
			weiDecimals: 8,
			midPx: "64.0",
			markPx: "64.0",
			prevDayPx: "63.0",
			genesis: null,
			deployer: null,
			deployGas: null,
			deployTime: "2024-11-29T06:45:52.532",
			seededUsdc: "0.0",
			nonCirculatingUserBalances: [],
			futureEmissions: "0.0",
		};
		testState.tokenDetailsPending = false;

		act(() => root.render(createElement(MarketAssetInfo, { market: SPOT_MARKET })));

		expect(container.textContent).toContain("Circulating supply");
		expect(container.textContent).toContain("298,690,514.637 HYPE");
		expect(container.textContent).toContain("Maximum supply");
		expect(container.querySelector(`a[href="/explorer/token/${HYPE_TOKEN_ID}"]`)).not.toBeNull();
	});

	it("uses a mobile drawer and exposes the correct retry action for HIP-3 failures", async () => {
		testState.isMobile = true;
		testState.conciseAnnotations = [["xyz:BOT", { category: "stocks" }]];
		testState.concisePending = false;
		testState.annotationError = true;
		testState.annotationPending = false;
		await renderAssetInfo();
		openDialog();

		expect(container.querySelector('[role="dialog"]')?.getAttribute("data-presentation")).toBe("drawer");
		expect(container.querySelector('[role="alert"]')?.textContent).toContain("Asset information could not be loaded.");

		const retryButton = [...container.querySelectorAll("button")].find((button) => button.textContent === "Retry");
		if (!retryButton) throw new Error("Retry button not found");
		act(() => retryButton.click());
		expect(testState.annotationRefetch).toHaveBeenCalledOnce();
		expect(testState.conciseRefetch).not.toHaveBeenCalled();
		expect(testState.tokenDetailsRefetch).not.toHaveBeenCalled();
	});
});
