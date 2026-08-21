// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDefaultAccountSnapshot } from "@/hooks/trade/use-default-account-snapshot";

const mocks = vi.hoisted(() => ({
	defaultBalances: vi.fn(() => ({ dex: "" })),
	selectedBalances: vi.fn(() => ({ dex: "xyz" })),
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({
		address: "0x0000000000000000000000000000000000000001",
		isConnected: true,
	}),
}));

vi.mock("@/hooks/trade/use-account-balances", () => ({
	useDefaultDexBalances: mocks.defaultBalances,
	useSelectedDexBalances: mocks.selectedBalances,
}));

vi.mock("@/hooks/trade/use-spot-token-usd-prices", () => ({
	useSpotTokenUsdPriceState: () => ({ prices: { USDH: "0.99" }, status: "success" }),
}));

vi.mock("@/lib/hyperliquid", () => ({
	useMarkets: () => ({
		builderPerp: [{ dex: "xyz", quoteToken: { index: 150, name: "USDH" } }],
		getToken: (name: string) => (name === "USDC" ? { index: 0, name } : undefined),
	}),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function SnapshotProbe() {
	const snapshot = useDefaultAccountSnapshot();
	return (
		<output>
			{JSON.stringify({
				address: snapshot.address,
				collaterals: snapshot.collaterals,
				dex: snapshot.defaultBalances.dex,
				isConnected: snapshot.isConnected,
				priceStatus: snapshot.tokenUsdPriceStatus,
				prices: snapshot.tokenUsdPrices,
			})}
		</output>
	);
}

describe("useDefaultAccountSnapshot", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		mocks.defaultBalances.mockClear();
		mocks.selectedBalances.mockClear();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("shares default-account sources without subscribing to the selected DEX", () => {
		act(() => root.render(<SnapshotProbe />));

		expect(JSON.parse(container.textContent ?? "{}")).toEqual({
			address: "0x0000000000000000000000000000000000000001",
			collaterals: [
				{ dex: "", tokenIndex: 0, tokenName: "USDC" },
				{ dex: "xyz", tokenIndex: 150, tokenName: "USDH" },
			],
			dex: "",
			isConnected: true,
			priceStatus: "success",
			prices: { USDH: "0.99" },
		});
		expect(mocks.defaultBalances).toHaveBeenCalledOnce();
		expect(mocks.selectedBalances).not.toHaveBeenCalled();
	});
});
