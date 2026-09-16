// @vitest-environment jsdom

import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { dehydrate, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	type PersistedClient,
	PersistQueryClientProvider,
	persistQueryClientRestore,
} from "@tanstack/react-query-persist-client";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RQ_CACHE_BUSTER, STORAGE_KEYS } from "@/config/app";
import { seedPersistedMarketCatalog } from "@/lib/hyperliquid/markets/market-catalog-bootstrap";
import { getMarketCatalogQueryKeys } from "@/lib/hyperliquid/markets/market-catalog-query";
import {
	createQueryPersistenceCallbacks,
	createQueryPersistenceFlush,
	createQueryPersistenceOptions,
	shouldPersistQuery,
} from "@/lib/query-persistence";
import { QueryPersistenceFlush } from "@/providers/query-persistence-flush";

const keys = getMarketCatalogQueryKeys("Mainnet");
const clients: QueryClient[] = [];
const unmounts = new Set<() => void>();

function render(children: ReactNode) {
	const container = document.createElement("div");
	document.body.appendChild(container);
	const root = createRoot(container);
	act(() => root.render(children));
	function unmount() {
		act(() => root.unmount());
		container.remove();
		unmounts.delete(unmount);
	}
	unmounts.add(unmount);
	return { unmount };
}

function createClient() {
	const client = new QueryClient();
	clients.push(client);
	return client;
}

function fillCatalog(client: QueryClient) {
	client.setQueryData(keys[0], {
		tokens: [
			{
				name: "USDC",
				szDecimals: 2,
				weiDecimals: 6,
				index: 0,
				tokenId: "0x0",
				isCanonical: true,
				fullName: "USD Coin",
			},
		],
		universe: [],
	});
	client.setQueryData(keys[1], [null]);
	client.setQueryData(keys[2], [{ universe: [], marginTables: [], collateralToken: 0 }]);
	client.setQueryData(["info", "ignored"], "not persisted");
}

function setup() {
	const client = createClient();
	const persister = createSyncStoragePersister({
		storage: localStorage,
		key: STORAGE_KEYS.RQ_CACHE,
		throttleTime: 1000,
	});
	const callbacks = createQueryPersistenceCallbacks(client, persister);
	const view = render(
		<QueryClientProvider client={client}>
			<QueryPersistenceFlush />
		</QueryClientProvider>,
	);
	return { client, persister, callbacks, ...view };
}

beforeEach(() => {
	vi.useFakeTimers();
	localStorage.clear();
});

afterEach(() => {
	for (const unmount of unmounts) unmount();
	for (const client of clients.splice(0)) client.clear();
	vi.clearAllTimers();
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe("query persistence lifecycle flush", () => {
	it("does not overwrite good storage before restore success or after restore failure", async () => {
		const { callbacks } = setup();
		localStorage.setItem(STORAGE_KEYS.RQ_CACHE, "existing envelope");
		const write = vi.spyOn(Storage.prototype, "setItem");
		window.dispatchEvent(new Event("pagehide"));
		vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
		document.dispatchEvent(new Event("visibilitychange"));
		expect(write).not.toHaveBeenCalled();
		await callbacks.onError();
		window.dispatchEvent(new Event("pagehide"));
		expect(write).not.toHaveBeenCalled();
		expect(localStorage.getItem(STORAGE_KEYS.RQ_CACHE)).toBe("existing envelope");
	});

	it("flushes all three catalogs synchronously without waiting for the persister throttle and round-trips both restore paths", async () => {
		const { client, callbacks, persister } = setup();
		await callbacks.onSuccess();
		fillCatalog(client);
		expect(localStorage.getItem(STORAGE_KEYS.RQ_CACHE)).toBeNull();
		window.dispatchEvent(new Event("pagehide"));
		const first = localStorage.getItem(STORAGE_KEYS.RQ_CACHE);
		const envelope = JSON.parse(first ?? "null") as PersistedClient;
		expect(envelope).toEqual({
			buster: RQ_CACHE_BUSTER,
			timestamp: Date.now(),
			clientState: dehydrate(client, { shouldDehydrateQuery: shouldPersistQuery }),
		});
		expect(envelope.clientState.queries.map((query) => query.queryKey)).toEqual(keys);
		window.dispatchEvent(new Event("pagehide"));
		expect(localStorage.getItem(STORAGE_KEYS.RQ_CACHE)).toBe(first);

		const seeded = createClient();
		seedPersistedMarketCatalog(seeded, "Mainnet");
		const restored = createClient();
		await persistQueryClientRestore({ queryClient: restored, ...createQueryPersistenceOptions(persister) });
		for (const key of keys) {
			expect(seeded.getQueryData(key)).toEqual(client.getQueryData(key));
			expect(restored.getQueryData(key)).toEqual(client.getQueryData(key));
		}
	});

	it("writes only when hidden, removes both listeners on unmount, and scopes readiness to the client", async () => {
		const { client, callbacks, unmount } = setup();
		await callbacks.onSuccess();
		fillCatalog(client);
		const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
		const write = vi.spyOn(Storage.prototype, "setItem");
		document.dispatchEvent(new Event("visibilitychange"));
		expect(write).not.toHaveBeenCalled();
		visibility.mockReturnValue("hidden");
		document.dispatchEvent(new Event("visibilitychange"));
		expect(write).toHaveBeenCalledTimes(1);
		unmount();
		window.dispatchEvent(new Event("pagehide"));
		document.dispatchEvent(new Event("visibilitychange"));
		createQueryPersistenceFlush(createClient())();
		expect(write).toHaveBeenCalledTimes(1);
	});

	it("uses the real provider's successful restore callback to unlock the listener", async () => {
		const client = createClient();
		let finishRestore: (() => void) | undefined;
		const persister = {
			persistClient: vi.fn(),
			restoreClient: () =>
				new Promise<undefined>((resolve) => {
					finishRestore = () => resolve(undefined);
				}),
			removeClient: vi.fn(),
		};
		render(
			<PersistQueryClientProvider
				client={client}
				persistOptions={createQueryPersistenceOptions(persister)}
				{...createQueryPersistenceCallbacks(client, persister)}
			>
				<QueryPersistenceFlush />
			</PersistQueryClientProvider>,
		);
		fillCatalog(client);
		window.dispatchEvent(new Event("pagehide"));
		expect(localStorage.getItem(STORAGE_KEYS.RQ_CACHE)).toBeNull();
		await act(async () => {
			finishRestore?.();
		});
		window.dispatchEvent(new Event("pagehide"));
		expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.RQ_CACHE) ?? "null").clientState.queries).toHaveLength(3);
	});

	it("swallows storage failures", async () => {
		const { client, callbacks } = setup();
		await callbacks.onSuccess();
		fillCatalog(client);
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new Error("quota exceeded");
		});
		expect(createQueryPersistenceFlush(client)).not.toThrow();
	});
});
