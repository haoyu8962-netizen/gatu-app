/** @vitest-environment jsdom */

import type { MetaResponse, PerpDexsResponse, SpotMetaResponse } from "@nktkas/hyperliquid";
import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssetDisplay } from "@/components/trade/components/asset-display";
import { TokenSelectorDropdown } from "@/components/trade/components/token-selector-dropdown";
import { useMarkets } from "@/lib/hyperliquid/markets/use-markets";
import { createI18nRoot } from "./harness/react";

function spotToken(name: string, index: number) {
	return {
		name,
		szDecimals: 2,
		weiDecimals: 6,
		index,
		tokenId: `0x${index.toString(16).padStart(32, "0")}`,
		isCanonical: false,
		evmContract: null,
		fullName: null,
		deployerTradingFeeShare: "0",
	};
}

vi.mock("@/lib/hyperliquid/markets/use-markets", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/hyperliquid/markets/use-markets")>();
	const perpMeta = {
		universe: [{ name: "PUMP", szDecimals: 0, maxLeverage: 5 }],
		marginTables: [],
		collateralToken: 0,
	} as unknown as MetaResponse;
	const catalog = actual.createMarkets({
		env: "Mainnet",
		perpMeta,
		spotMeta: {
			tokens: [spotToken("USDC", 0), spotToken("PUMP", 26), spotToken("UPUMP", 299)],
			universe: [
				{ name: "@20", tokens: [26, 0], index: 20, isCanonical: false },
				{ name: "@188", tokens: [299, 0], index: 188, isCanonical: false },
			],
		} as SpotMetaResponse,
		allPerpMetas: [perpMeta],
		perpDexs: [null] as unknown as PerpDexsResponse,
		isLoading: false,
		error: null,
	});
	return { ...actual, useMarkets: () => catalog };
});

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("asset display of spot tokens", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	function renderName(element: React.ReactElement) {
		act(() => root.render(element));
		return container.textContent;
	}

	it("names a protocol token by its display name even when a perp has the same coin", () => {
		expect(renderName(<AssetDisplay coin="PUMP" isToken hideIcon />)).toBe("PUMP-26");
		expect(renderName(<AssetDisplay coin="UPUMP" isToken hideIcon />)).toBe("PUMP");
		expect(renderName(<AssetDisplay coin="USDC" isToken hideIcon />)).toBe("USDC");
	});

	it("keeps naming market coins by their market", () => {
		expect(renderName(<AssetDisplay coin="PUMP" hideIcon />)).toBe("PUMP");
		expect(renderName(<AssetDisplay coin="@20" hideIcon />)).toBe("PUMP-26/USDC");
		expect(renderName(<AssetDisplay coin="@188" hideIcon />)).toBe("PUMP/USDC");
	});

	it("draws a token's icon from its display name", () => {
		act(() => root.render(<AssetDisplay coin="UPUMP" isToken hideName />));
		expect(container.querySelector("img")?.getAttribute("src")).toMatch(/\/PUMP_spot\.svg$/);
	});

	it("names the selected token of the token dropdown as a token", () => {
		const tokens = useMarkets().tokens.filter((token) => token.name === "PUMP");
		expect(
			renderName(
				<TokenSelectorDropdown tokens={tokens} selectedToken="PUMP" onSelect={vi.fn()} getBalance={() => 0} />,
			),
		).toBe("PUMP-26");
	});
});
