// @vitest-environment jsdom

import type { ISubscription, SubscriptionOptions as SdkSubscriptionOptions } from "@nktkas/hyperliquid";
import type { CompactSubscriptionClient } from "@sairn/hl-react";
import { HyperliquidContext, type HyperliquidContextValue, HyperliquidStoreContext } from "@sairn/hl-react/provider";
import { createHyperliquidStore, type HyperliquidStore } from "@sairn/hl-react/store";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMarketsInfoInternal } from "@/lib/hyperliquid/hooks/useMarketsInfo";

vi.mock("@sairn/hl-react", async (importOriginal) => ({
	...(await importOriginal<typeof import("@sairn/hl-react")>()),
	canUseL2Decompression: () => true,
}));

vi.mock("@/lib/hyperliquid/markets/use-markets", () => ({
	useMarkets: () => ({
		builderPerp: [],
		error: null,
		isLoading: false,
		perp: [
			{
				assetId: 0,
				ctxIndex: 0,
				iconUrl: undefined,
				kind: "perp",
				maxLeverage: 50,
				name: "BTC",
				pairName: "BTC-USDC",
				routeName: "BTC",
				shortName: "BTC",
				szDecimals: 5,
			},
		],
		spot: [],
	}),
}));

vi.mock("@/providers/exchange-scope", () => ({
	useExchangeScope: () => ({ scope: "perp" }),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const BTC_CTX = {
	funding: "0.0000125",
	openInterest: "12",
	prevDayPx: "90000",
	dayNtlVlm: "1000000",
	oraclePx: "99990",
	markPx: "100000",
	midPx: "100001",
	dayBaseVlm: "10",
};

type Listener = (event: unknown) => void;

interface Channel {
	listeners: Listener[];
	options: SdkSubscriptionOptions[];
	subscribe: ReturnType<typeof vi.fn>;
}

function createChannel(): Channel {
	const channel: Channel = {
		listeners: [],
		options: [],
		subscribe: vi.fn(async (listener: Listener, options?: SdkSubscriptionOptions): Promise<ISubscription> => {
			channel.listeners.push(listener);
			channel.options.push(options ?? {});
			return { unsubscribe: async () => {} };
		}),
	};
	return channel;
}

describe("market rows when the fast price stream fails", () => {
	let container: HTMLDivElement;
	let root: Root;
	let store: HyperliquidStore;
	let pac: Channel;
	let fast: Channel;
	let captured: ReturnType<typeof useMarketsInfoInternal>;

	beforeEach(() => {
		vi.useFakeTimers({ now: 1_000_000 });
		vi.spyOn(Math, "random").mockReturnValue(0);
		Object.defineProperty(document, "hidden", { value: false, configurable: true });
		container = document.createElement("div");
		root = createRoot(container);
		store = createHyperliquidStore({ ssr: false, triggerReconnect: vi.fn() });
		pac = createChannel();
		fast = createChannel();
	});

	afterEach(() => {
		act(() => root.unmount());
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	function Wrapper({ children }: { children: ReactNode }) {
		const subscription = {
			pac: pac.subscribe,
			sac: createChannel().subscribe,
			allDexsAssetCtxs: createChannel().subscribe,
			spotAssetCtxs: createChannel().subscribe,
			fastAssetCtxs: fast.subscribe,
		} as unknown as CompactSubscriptionClient;
		const value: HyperliquidContextValue = {
			info: {} as HyperliquidContextValue["info"],
			subscription,
			env: "Mainnet",
			isTestnet: false,
			builderConfig: { b: "0x0000000000000000000000000000000000000000", f: 0 },
			clientKey: "disconnected",
			sessionMode: "wallet",
			exchangeLifecycle: { id: Symbol("markets-info-test"), active: true },
			exchangeSession: {
				id: Symbol("markets-info-session"),
				env: "Mainnet",
				clientKey: "disconnected",
				sessionMode: "wallet",
				active: true,
			},
			enforceLegalActions: false,
		};
		return (
			<HyperliquidStoreContext.Provider value={store}>
				<HyperliquidContext.Provider value={value}>{children}</HyperliquidContext.Provider>
			</HyperliquidStoreContext.Provider>
		);
	}

	function Probe() {
		captured = useMarketsInfoInternal({ alwaysSubscribeAll: true, subscriptionKeepAliveMs: 10_000 });
		return null;
	}

	async function emit(channel: Channel, event: unknown) {
		await act(async () => {
			channel.listeners.at(-1)?.(event);
			await vi.advanceTimersByTimeAsync(5_000);
		});
	}

	it("resubscribes the context channel once with the ten-second threshold and prices the row from it", async () => {
		act(() => root.render(<Wrapper>{<Probe />}</Wrapper>));
		await act(() => vi.advanceTimersByTimeAsync(0));
		expect(pac.subscribe).toHaveBeenCalledOnce();
		expect(fast.subscribe).toHaveBeenCalledOnce();

		await emit(pac, [["", [BTC_CTX]]]);
		await emit(fast, { BTC: { markPx: "100010", midPx: "100011" } });
		expect(captured.getMarketByName("BTC")).toMatchObject({ markPx: "100010", markPriceStatus: "success" });

		await act(async () => {
			fast.options[0]?.onError?.(new Error("bad frame"));
			await vi.advanceTimersByTimeAsync(0);
		});

		expect(pac.subscribe).toHaveBeenCalledTimes(2);
		expect(captured.getMarketByName("BTC")?.markPriceStatus).not.toBe("success");

		await emit(pac, [["", [{ ...BTC_CTX, markPx: "100020" }]]]);
		expect(captured.getMarketByName("BTC")).toMatchObject({ markPx: "100020", markPriceStatus: "success" });

		for (let tick = 0; tick < 6; tick += 1) await emit(pac, [["", [{ ...BTC_CTX, markPx: "100030" }]]]);
		expect(captured.getMarketByName("BTC")).toMatchObject({ markPx: "100030", markPriceStatus: "success" });
		expect(pac.subscribe).toHaveBeenCalledTimes(2);
		expect(fast.subscribe).toHaveBeenCalledOnce();
	});
});
