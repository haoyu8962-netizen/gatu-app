/** @vitest-environment jsdom */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CompactSubscriptionClient, HyperliquidContextValue } from "@sairn/hl-react";
import { HyperliquidContext, HyperliquidStoreContext } from "@sairn/hl-react/provider";
import { createHyperliquidStore, getStoreInternals, type HyperliquidStore } from "@sairn/hl-react/store";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountActivityFeedOwner } from "@/components/trade/account-activity-feed-owner";
import { useSubscription } from "@/lib/hyperliquid";

const ADDRESS_A = "0x1c57d2Efd99a4263540045d5fc19A77564e9abcB" as const;
const ADDRESS_B = "0x2222222222222222222222222222222222222222" as const;
const METHODS = ["userFills", "userFundings", "userHistoricalOrders", "userTwapHistory", "userTwapSliceFills"] as const;

type Listener = (event: unknown) => void;

interface SubscriptionHarness {
	client: CompactSubscriptionClient;
	listeners: Map<(typeof METHODS)[number], Listener>;
	methods: Record<(typeof METHODS)[number], ReturnType<typeof vi.fn>>;
	unsubscribes: Map<(typeof METHODS)[number], ReturnType<typeof vi.fn>>;
}

function createSubscriptionHarness(): SubscriptionHarness {
	const listeners = new Map<(typeof METHODS)[number], Listener>();
	const unsubscribes = new Map<(typeof METHODS)[number], ReturnType<typeof vi.fn>>();
	const methods = Object.fromEntries(
		METHODS.map((method) => [
			method,
			vi.fn(async (_params: unknown, listener: Listener) => {
				listeners.set(method, listener);
				const unsubscribe = vi.fn(async () => {});
				unsubscribes.set(method, unsubscribe);
				return { unsubscribe };
			}),
		]),
	) as SubscriptionHarness["methods"];

	return {
		client: methods as unknown as CompactSubscriptionClient,
		listeners,
		methods,
		unsubscribes,
	};
}

describe("AccountActivityFeedOwner", () => {
	let container: HTMLDivElement;
	let root: Root;
	let store: HyperliquidStore;
	let subscriptions: SubscriptionHarness;

	beforeEach(() => {
		store = createHyperliquidStore({ ssr: false, triggerReconnect: vi.fn() });
		subscriptions = createSubscriptionHarness();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	function renderOwner({
		clientKey,
		env = "Mainnet",
		showConsumer = false,
	}: {
		clientKey: string;
		env?: HyperliquidContextValue["env"];
		showConsumer?: boolean;
	}) {
		const context: HyperliquidContextValue = {
			info: {} as HyperliquidContextValue["info"],
			subscription: subscriptions.client,
			env,
			isTestnet: env === "Testnet",
			builderConfig: { b: "0x0000000000000000000000000000000000000000", f: 0 },
			clientKey,
			sessionMode: clientKey === "disconnected" ? "disconnected" : "wallet",
			exchangeLifecycle: { id: Symbol("account-activity-feed-owner-test"), active: true },
			exchangeSession: {
				id: Symbol("account-activity-feed-owner-session"),
				env,
				clientKey: clientKey.toLowerCase(),
				sessionMode: clientKey === "disconnected" ? "disconnected" : "wallet",
				active: true,
			},
			enforceLegalActions: false,
		};

		act(() => {
			root.render(
				<HyperliquidStoreContext.Provider value={store}>
					<HyperliquidContext.Provider value={context}>
						<AccountActivityFeedOwner />
						{showConsumer ? <UserFillsConsumer user={clientKey as `0x${string}`} /> : null}
					</HyperliquidContext.Provider>
				</HyperliquidStoreContext.Provider>,
			);
		});
	}

	it.each(["disconnected", "invalid-owner"])("does not acquire account streams for %s", async (clientKey) => {
		renderOwner({ clientKey });
		await act(async () => {});

		for (const method of METHODS) expect(subscriptions.methods[method]).not.toHaveBeenCalled();
		expect(getStoreInternals(store).subscriptionRuntime.size).toBe(0);
	});

	it("acquires all compact account streams with the exact active account", async () => {
		renderOwner({ clientKey: ADDRESS_A });
		await act(async () => {});

		expect(subscriptions.methods.userFills).toHaveBeenCalledWith(
			{ user: ADDRESS_A, aggregateByTime: true },
			expect.any(Function),
			expect.any(Object),
		);
		for (const method of METHODS.filter((method) => method !== "userFills")) {
			expect(subscriptions.methods[method]).toHaveBeenCalledWith(
				{ user: ADDRESS_A },
				expect.any(Function),
				expect.any(Object),
			);
		}
		expect(getStoreInternals(store).subscriptionRuntime.size).toBe(METHODS.length);
	});

	it("keeps the snapshot and subscription alive after the tab consumer unmounts", async () => {
		renderOwner({ clientKey: ADDRESS_A, showConsumer: true });
		await act(async () => {});

		const key = userSubscriptionKey("userFills", ADDRESS_A, true);
		const runtime = getStoreInternals(store).subscriptionRuntime;
		expect(runtime.get(key)?.refCount).toBe(2);

		act(() => {
			subscriptions.listeners.get("userFills")?.({
				user: ADDRESS_A,
				isSnapshot: true,
				fills: [{ coin: "BTC", tid: 1, time: 1 }],
			});
		});
		expect(store.getState().subscriptions[key]?.data).toMatchObject({ fills: [{ tid: 1 }] });

		renderOwner({ clientKey: ADDRESS_A, showConsumer: false });
		await act(async () => {});

		expect(runtime.get(key)?.refCount).toBe(1);
		expect(store.getState().subscriptions[key]?.data).toMatchObject({ fills: [{ tid: 1 }] });
		expect(subscriptions.unsubscribes.get("userFills")).not.toHaveBeenCalled();
	});

	it("rotates every stream when the active account changes", async () => {
		renderOwner({ clientKey: ADDRESS_A });
		await act(async () => {});
		const firstUnsubscribes = new Map(subscriptions.unsubscribes);

		renderOwner({ clientKey: ADDRESS_B });
		await act(async () => {});

		for (const method of METHODS) {
			expect(firstUnsubscribes.get(method)).toHaveBeenCalledOnce();
			expect(subscriptions.methods[method]).toHaveBeenCalledTimes(2);
		}
		const runtime = getStoreInternals(store).subscriptionRuntime;
		const oldKey = userSubscriptionKey("userFundings", ADDRESS_A);
		const newKey = userSubscriptionKey("userFundings", ADDRESS_B);
		expect(runtime.has(oldKey)).toBe(false);
		expect(runtime.get(newKey)?.refCount).toBe(1);
	});

	it("remounts owner-held streams when its environment identity key changes", async () => {
		renderOwner({ clientKey: ADDRESS_A, env: "Mainnet" });
		await act(async () => {});
		const firstUnsubscribes = new Map(subscriptions.unsubscribes);

		renderOwner({ clientKey: ADDRESS_A, env: "Testnet" });
		await act(async () => {});

		for (const method of METHODS) {
			expect(firstUnsubscribes.get(method)).toHaveBeenCalledOnce();
			expect(subscriptions.methods[method]).toHaveBeenCalledTimes(2);
		}
		expect(getStoreInternals(store).subscriptionRuntime.size).toBe(METHODS.length);
	});

	it("releases every stream on logout and ignores a late event from the previous owner", async () => {
		renderOwner({ clientKey: ADDRESS_A });
		await act(async () => {});
		const previousFillsListener = subscriptions.listeners.get("userFills");
		const key = userSubscriptionKey("userFills", ADDRESS_A, true);

		renderOwner({ clientKey: "disconnected" });
		await act(async () => {});

		expect(getStoreInternals(store).subscriptionRuntime.size).toBe(0);
		expect(store.getState().subscriptions).toEqual({});
		act(() => {
			previousFillsListener?.({
				user: ADDRESS_A,
				isSnapshot: true,
				fills: [{ coin: "BTC", tid: 2, time: 2 }],
			});
		});
		expect(store.getState().subscriptions[key]).toBeUndefined();
	});

	it("mounts the owner at both account-activity route boundaries", () => {
		const tradePage = readFileSync(resolve(process.cwd(), "src/components/trade/trade-terminal-page.tsx"), "utf8");
		const portfolioPage = readFileSync(resolve(process.cwd(), "src/components/portfolio/portfolio-page.tsx"), "utf8");

		expect(tradePage).toContain("<AccountActivityFeedOwner />");
		expect(portfolioPage).toContain("<AccountActivityFeedOwner />");
	});
});

function UserFillsConsumer({ user }: { user: `0x${string}` }) {
	useSubscription("userFills", { user, aggregateByTime: true });
	return null;
}

function userSubscriptionKey(method: (typeof METHODS)[number], user: `0x${string}`, aggregateByTime = false): string {
	return JSON.stringify([
		"hl",
		"subscription",
		method,
		aggregateByTime ? { aggregateByTime: true, user: user.toLowerCase() } : { user: user.toLowerCase() },
	]);
}
