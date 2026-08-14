/** @vitest-environment jsdom */

import { act, StrictMode, useEffect, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	MobileMarketBarProvider,
	selectMobileMarketPrice,
	useMobileMarketBarSnapshot,
} from "@/components/trade/mobile/mobile-market-bar-provider";

const mocks = vi.hoisted(() => ({
	allMidsPrice: "100.25" as string | undefined,
	allMidsStale: false,
	allMidsStatus: "active" as "active" | "idle",
	bboMidPx: "100.5" as string | undefined,
	bboSnapshot: { revision: 0 } as object | undefined,
	bboSubscriptions: 0,
	bboUnsubscriptions: 0,
	env: "Mainnet",
	reconnectListener: undefined as (() => void) | undefined,
	market: {
		kind: "perp",
		name: "BTC",
		pairName: "BTC-USDC",
		markPx: "100.0",
		midPx: "100.25",
		oraclePx: "99.9",
		prevDayPx: "99.0",
		dayNtlVlm: "1000000",
		openInterest: "100",
		funding: "0.0001",
		szDecimals: 5,
	},
	perpCtx: {
		markPx: "100.0",
		midPx: "100.25" as string | null,
		oraclePx: "99.9",
		prevDayPx: "99.0",
		dayNtlVlm: "1000000",
		openInterest: "100",
		funding: "0.0001",
	},
	spotCtx: {
		markPx: "0.14",
		midPx: "0.209265" as string | null,
		prevDayPx: "0.20",
		dayNtlVlm: "1000000",
		circulatingSupply: "10000000",
	},
}));

vi.mock("@/hooks/trade/use-orderbook-mid-price", () => ({
	useOrderbookMidPrice: (coin: string | undefined) => {
		useEffect(() => {
			if (!coin) return;
			mocks.bboSubscriptions += 1;
			return () => {
				mocks.bboUnsubscriptions += 1;
			};
		}, [coin]);
		return {
			midPx: coin ? mocks.bboMidPx : undefined,
			isStale: false,
			snapshot: coin ? mocks.bboSnapshot : undefined,
			status: coin ? "active" : "idle",
		};
	},
}));

vi.mock("@/lib/hyperliquid", () => ({
	getMarketApiCoin: (market: { name?: string } | undefined) => market?.name ?? "",
	getSpotMarketApiCoin: (market: { name?: string } | undefined) => market?.name ?? "",
	subscribeWsReconnect: (listener: () => void) => {
		mocks.reconnectListener = listener;
		return () => {
			if (mocks.reconnectListener === listener) mocks.reconnectListener = undefined;
		};
	},
	useHyperliquid: () => ({ env: mocks.env, isTestnet: mocks.env === "Testnet" }),
	useSelectedMarketInfo: () => ({ data: mocks.market }),
	useSubscription: (method: string, _params: unknown, options: { enabled?: boolean } = {}) => {
		if (options.enabled === false) {
			return { data: undefined, isStale: false, status: "idle" };
		}
		if (method === "allMids") {
			return {
				data: { mids: { [mocks.market.name]: mocks.allMidsPrice } },
				isStale: mocks.allMidsStale,
				status: mocks.allMidsStatus,
			};
		}
		if (method === "activeAssetCtx") {
			return { data: { ctx: mocks.perpCtx }, isStale: false, status: "active" };
		}
		if (method === "activeSpotAssetCtx") {
			return { data: { ctx: mocks.spotCtx }, isStale: false, status: "active" };
		}
		return { data: undefined, isStale: false, status: "idle" };
	},
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function PriceProbe({ pane }: { pane: string }) {
	const { displayPrice, priceFlash, priceSource } = useMobileMarketBarSnapshot();
	const initialSequenceRef = useRef(priceFlash.sequence);
	const visibleDirection = priceFlash.sequence > initialSequenceRef.current ? priceFlash.direction : null;
	return (
		<output data-pane={pane} data-source={priceSource ?? "none"} data-direction={visibleDirection ?? "none"}>
			{displayPrice ?? "—"}
		</output>
	);
}

type MobilePane = "markets" | "trade" | "account";

function Harness({ pane, revision }: { pane: MobilePane; revision: number }) {
	return (
		<MobileMarketBarProvider enabled={pane !== "account"}>
			{pane !== "account" && <PriceProbe key={pane} pane={pane} />}
			<span data-revision={revision} hidden />
		</MobileMarketBarProvider>
	);
}

describe("MobileMarketBarProvider", () => {
	let container: HTMLDivElement;
	let renderRevision: number;
	let root: Root;

	beforeEach(() => {
		mocks.allMidsPrice = "100.25";
		mocks.allMidsStale = false;
		mocks.allMidsStatus = "active";
		mocks.bboMidPx = "100.5";
		mocks.bboSnapshot = { revision: 0 };
		mocks.bboSubscriptions = 0;
		mocks.bboUnsubscriptions = 0;
		mocks.env = "Mainnet";
		mocks.reconnectListener = undefined;
		renderRevision = 0;
		Object.assign(mocks.market, {
			kind: "perp",
			name: "BTC",
			pairName: "BTC-USDC",
			markPx: "100.0",
			midPx: "100.25",
		});
		Object.assign(mocks.perpCtx, { markPx: "100.0", midPx: "100.25" });
		Object.assign(mocks.spotCtx, { markPx: "0.14", midPx: "0.209265" });
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	function render(pane: MobilePane) {
		renderRevision += 1;
		act(() => root.render(<Harness pane={pane} revision={renderRevision} />));
		return container.querySelector<HTMLOutputElement>("output");
	}

	it("keeps one BBO subscription and one price snapshot across tab handoff", () => {
		let price = render("markets");
		expect(price?.textContent).toBe("100.5");
		expect(price?.dataset.source).toBe("bbo");
		expect(price?.dataset.direction).toBe("none");
		expect(mocks.bboSubscriptions).toBe(1);
		expect(mocks.bboUnsubscriptions).toBe(0);

		price = render("trade");
		expect(price?.textContent).toBe("100.5");
		expect(price?.dataset.direction).toBe("none");
		expect(mocks.bboSubscriptions).toBe(1);
		expect(mocks.bboUnsubscriptions).toBe(0);
	});

	it("releases market streams on Account and establishes a fresh no-flash baseline on return", () => {
		let price = render("markets");
		expect(price?.textContent).toBe("100.5");
		expect(mocks.bboSubscriptions).toBe(1);
		expect(mocks.bboUnsubscriptions).toBe(0);

		price = render("account");
		expect(price).toBeNull();
		expect(mocks.bboSubscriptions).toBe(1);
		expect(mocks.bboUnsubscriptions).toBe(1);
		expect(mocks.reconnectListener).toBeUndefined();

		mocks.bboMidPx = "101.0";
		mocks.bboSnapshot = { revision: 1 };
		price = render("trade");
		expect(price?.textContent).toBe("101.0");
		expect(price?.dataset.direction).toBe("none");
		expect(mocks.bboSubscriptions).toBe(2);
		expect(mocks.bboUnsubscriptions).toBe(1);
		expect(mocks.reconnectListener).toBeTypeOf("function");
	});

	it("balances the stable subscription lifecycle under Strict Mode", () => {
		act(() =>
			root.render(
				<StrictMode>
					<Harness pane="markets" revision={1} />
				</StrictMode>,
			),
		);
		expect(mocks.bboSubscriptions).toBeGreaterThan(0);
		expect(mocks.bboUnsubscriptions).toBe(mocks.bboSubscriptions - 1);

		act(() => root.unmount());
		expect(mocks.bboUnsubscriptions).toBe(mocks.bboSubscriptions);
		root = createRoot(container);
	});

	it("animates only consecutive ticks from the same identity and source", () => {
		let price = render("markets");
		expect(price?.dataset.direction).toBe("none");

		mocks.bboMidPx = "101.0";
		mocks.bboSnapshot = { revision: 1 };
		price = render("markets");
		expect(price?.dataset.direction).toBe("up");

		mocks.bboMidPx = undefined;
		mocks.allMidsPrice = "101.5";
		price = render("markets");
		expect(price?.dataset.source).toBe("allMids");
		expect(price?.dataset.direction).toBe("none");

		mocks.allMidsPrice = "101.25";
		price = render("markets");
		expect(price?.dataset.direction).toBe("down");

		mocks.bboMidPx = "2000";
		mocks.bboSnapshot = { revision: 2 };
		mocks.market.name = "ETH";
		price = render("markets");
		expect(price?.textContent).toBe("2000");
		expect(price?.dataset.direction).toBe("none");

		mocks.env = "Testnet";
		mocks.bboMidPx = "2001";
		mocks.bboSnapshot = { revision: 3 };
		price = render("markets");
		expect(price?.dataset.direction).toBe("none");
	});

	it("starts a new animation baseline after a websocket reconnect", () => {
		let price = render("markets");
		expect(price?.dataset.direction).toBe("none");

		mocks.bboMidPx = "101.0";
		mocks.bboSnapshot = { revision: 1 };
		price = render("markets");
		expect(price?.dataset.direction).toBe("up");

		act(() => mocks.reconnectListener?.());
		price = container.querySelector<HTMLOutputElement>("output");
		expect(price?.textContent).toBe("101.0");
		expect(price?.dataset.direction).toBe("none");

		mocks.bboMidPx = "101.5";
		mocks.bboSnapshot = { revision: 2 };
		price = render("markets");
		expect(price?.dataset.direction).toBe("none");

		mocks.bboMidPx = "102.0";
		mocks.bboSnapshot = { revision: 3 };
		price = render("markets");
		expect(price?.dataset.direction).toBe("up");
	});

	it("does not use stale allMids data ahead of a fresh asset context mid", () => {
		mocks.bboMidPx = undefined;
		mocks.allMidsPrice = "101.0";
		mocks.allMidsStale = true;
		mocks.perpCtx.midPx = "100.25";

		const price = render("markets");
		expect(price?.textContent).toBe("100.25");
		expect(price?.dataset.source).toBe("assetCtxMid");
		expect(price?.dataset.direction).toBe("none");
	});

	it("fails closed instead of presenting mark price as an unlabeled mid", () => {
		mocks.bboMidPx = undefined;
		mocks.allMidsPrice = undefined;
		mocks.perpCtx.midPx = null;
		mocks.perpCtx.markPx = "177.06";
		mocks.market.markPx = "177.06";

		const price = render("markets");
		expect(price?.textContent).toBe("—");
		expect(price?.dataset.source).toBe("none");
		expect(price?.dataset.direction).toBe("none");
	});

	it("uses a fresh spot context mid and never substitutes its different mark price", () => {
		mocks.bboMidPx = undefined;
		mocks.allMidsPrice = undefined;
		Object.assign(mocks.market, {
			kind: "spot",
			name: "@1",
			pairName: "PURR-USDC",
			markPx: "0.14",
			midPx: "0.209265",
		});
		mocks.spotCtx.midPx = "0.209265";
		mocks.spotCtx.markPx = "0.14";

		let price = render("markets");
		expect(price?.textContent).toBe("0.209265");
		expect(price?.dataset.source).toBe("assetCtxMid");
		expect(price?.dataset.direction).toBe("none");

		mocks.spotCtx.midPx = null;
		price = render("markets");
		expect(price?.textContent).toBe("—");
		expect(price?.dataset.source).toBe("none");
		expect(price?.dataset.direction).toBe("none");
	});
});

describe("selectMobileMarketPrice", () => {
	it("keeps BBO, allMids, and asset context mid as distinct ordered sources", () => {
		expect(selectMobileMarketPrice({ bboMidPx: "10.5", allMidsPrice: "10.4", assetCtxMidPx: "10.3" })).toEqual({
			source: "bbo",
			value: "10.5",
		});
		expect(selectMobileMarketPrice({ bboMidPx: undefined, allMidsPrice: "10.4", assetCtxMidPx: "10.3" })).toEqual({
			source: "allMids",
			value: "10.4",
		});
		expect(
			selectMobileMarketPrice({ bboMidPx: undefined, allMidsPrice: undefined, assetCtxMidPx: "0.209265" }),
		).toEqual({ source: "assetCtxMid", value: "0.209265" });
	});

	it("returns no price when only a semantically different mark value exists", () => {
		expect(selectMobileMarketPrice({ bboMidPx: undefined, allMidsPrice: undefined, assetCtxMidPx: null })).toEqual({
			source: null,
			value: undefined,
		});
	});

	it("skips malformed or non-positive prices and fails closed when no valid mid remains", () => {
		expect(selectMobileMarketPrice({ bboMidPx: "0", allMidsPrice: "10.4", assetCtxMidPx: "10.3" })).toEqual({
			source: "allMids",
			value: "10.4",
		});
		expect(selectMobileMarketPrice({ bboMidPx: "-1", allMidsPrice: "NaN", assetCtxMidPx: 0 })).toEqual({
			source: null,
			value: undefined,
		});
	});
});
