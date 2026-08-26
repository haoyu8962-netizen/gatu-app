// @vitest-environment jsdom

import { useSubscription } from "@gatu/hl-react/hooks/useSubscription";
import { HyperliquidContext, type HyperliquidContextValue, HyperliquidStoreContext } from "@gatu/hl-react/provider";
import { createHyperliquidStore, type HyperliquidStore } from "@gatu/hl-react/store";
import type {
	FastAssetCtxsWsEvent,
	ISubscription,
	SubscriptionOptions as SdkSubscriptionOptions,
	SubscriptionClient,
} from "@nktkas/hyperliquid";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Listener = (event: FastAssetCtxsWsEvent) => void;

describe("fastAssetCtxs subscription", () => {
	let container: HTMLDivElement;
	let root: Root;
	let store: HyperliquidStore;
	let listeners: Listener[];
	let failureOptions: SdkSubscriptionOptions[];
	let disconnectListeners: Set<() => void>;
	let unsubscribe: () => Promise<void>;
	let subscription: SubscriptionClient;
	let captured: ReturnType<typeof useSubscription<"fastAssetCtxs">>;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(1_000);
		vi.spyOn(Math, "random").mockReturnValue(0);
		Object.defineProperty(document, "hidden", { value: false, configurable: true });
		container = document.createElement("div");
		root = createRoot(container);
		disconnectListeners = new Set();
		store = createHyperliquidStore({
			ssr: false,
			triggerReconnect: vi.fn(),
			subscribeDisconnect: (listener) => {
				disconnectListeners.add(listener);
				return () => disconnectListeners.delete(listener);
			},
		});
		listeners = [];
		failureOptions = [];
		unsubscribe = vi.fn(async () => {});
		subscription = {
			fastAssetCtxs: vi.fn(async (listener: Listener, options?: SdkSubscriptionOptions): Promise<ISubscription> => {
				listeners.push(listener);
				failureOptions.push(options ?? {});
				return { unsubscribe };
			}),
		} as unknown as SubscriptionClient;
	});

	afterEach(() => {
		act(() => root.unmount());
		vi.restoreAllMocks();
		vi.useRealTimers();
		Object.defineProperty(document, "hidden", { value: false, configurable: true });
	});

	function Wrapper({ children }: { children: ReactNode }) {
		const value: HyperliquidContextValue = {
			info: {} as HyperliquidContextValue["info"],
			subscription,
			env: "Mainnet",
			isTestnet: false,
			builderConfig: { b: "0x0000000000000000000000000000000000000000", f: 0 },
			agentName: "test",
			clientKey: "disconnected",
			sessionMode: "wallet",
			exchangeLifecycle: { id: Symbol("fast-asset-ctxs-test"), active: true },
			enforceLegalActions: false,
		};

		return (
			<HyperliquidStoreContext.Provider value={store}>
				<HyperliquidContext.Provider value={value}>{children}</HyperliquidContext.Provider>
			</HyperliquidStoreContext.Provider>
		);
	}

	function Consumer({ refreshKey }: { refreshKey?: string }) {
		captured = useSubscription("fastAssetCtxs", undefined, { refreshKey });
		return null;
	}

	async function renderConsumer(refreshKey?: string) {
		act(() => root.render(<Wrapper>{<Consumer refreshKey={refreshKey} />}</Wrapper>));
		await act(() => vi.advanceTimersByTimeAsync(0));
	}

	it("publishes a merged full snapshot with a render-reactive receipt time", async () => {
		await renderConsumer();

		act(() => listeners[0]?.({ BTC: { markPx: "100000", midPx: "100001" } }));
		expect(captured.lastMessageAt).toBe(1_000);

		vi.setSystemTime(2_000);
		act(() => listeners[0]?.({ BTC: { markPx: "100100" }, HYPE: { markPx: "40" } }));

		expect(captured.data).toEqual({
			BTC: { markPx: "100100", midPx: "100001" },
			HYPE: { markPx: "40" },
		});
		expect(captured.lastMessageAt).toBe(2_000);
		expect(captured.isStale).toBe(false);
	});

	it("retains the actual receipt time when the hidden-page buffer is flushed", async () => {
		await renderConsumer();
		act(() => listeners[0]?.({ BTC: { markPx: "100000" } }));

		Object.defineProperty(document, "hidden", { value: true, configurable: true });
		document.dispatchEvent(new Event("visibilitychange"));
		vi.setSystemTime(2_000);
		act(() => listeners[0]?.({ BTC: { markPx: "100100" } }));
		expect(captured.data).toEqual({ BTC: { markPx: "100000" } });

		vi.setSystemTime(5_000);
		Object.defineProperty(document, "hidden", { value: false, configurable: true });
		act(() => document.dispatchEvent(new Event("visibilitychange")));

		expect(captured.data).toEqual({ BTC: { markPx: "100100" } });
		expect(captured.lastMessageAt).toBe(2_000);
		expect(captured.isStale).toBe(false);
	});

	it("resets a reused SDK listener to the reconnect snapshot baseline", async () => {
		await renderConsumer();
		act(() => listeners[0]?.({ ETH: { markPx: "3000", midPx: "3001" } }));

		act(() => {
			for (const notifyDisconnect of [...disconnectListeners]) notifyDisconnect();
		});
		expect(captured.isStale).toBe(true);

		vi.setSystemTime(2_000);
		act(() => listeners[0]?.({ BTC: { markPx: "100000", midPx: "100001" } }));

		expect(captured.data).toEqual({ BTC: { markPx: "100000", midPx: "100001" } });
		expect(captured.lastMessageAt).toBe(2_000);
		expect(captured.isStale).toBe(false);
	});

	it("detaches the reconnect reset listener when the subscription is released", async () => {
		await renderConsumer();
		expect(disconnectListeners).toHaveLength(2);

		await act(async () => captured.unsubscribe?.());

		expect(disconnectListeners).toHaveLength(0);
		expect(unsubscribe).toHaveBeenCalledOnce();
	});

	it("starts error recovery and refresh-key generations from a new full snapshot", async () => {
		await renderConsumer("first");
		act(() => listeners[0]?.({ ETH: { markPx: "3000", midPx: "3001" } }));

		act(() => failureOptions[0]?.onError?.(new Error("stream disconnected")));
		expect(captured.status).toBe("error");
		expect(captured.isStale).toBe(true);
		expect(disconnectListeners).toHaveLength(1);

		act(() => listeners[0]?.({ ETH: { markPx: "9999" } }));
		await act(() => vi.advanceTimersByTimeAsync(250));
		expect(listeners).toHaveLength(2);
		expect(disconnectListeners).toHaveLength(2);

		act(() => listeners[1]?.({ BTC: { markPx: "100000", midPx: "100001" } }));
		expect(captured.data).toEqual({ BTC: { markPx: "100000", midPx: "100001" } });
		expect(captured.isStale).toBe(false);

		await renderConsumer("second");
		expect(listeners).toHaveLength(3);
		act(() => listeners[2]?.({ HYPE: { markPx: "40", midPx: "40.01" } }));

		expect(captured.data).toEqual({ HYPE: { markPx: "40", midPx: "40.01" } });
	});
});
