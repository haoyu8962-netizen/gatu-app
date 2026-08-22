import { infoKey, infoKeys, infoPersistedKey } from "@gatu/hl-react";
import { QueryClient } from "@tanstack/react-query";
import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client";
import { describe, expect, it } from "vitest";
import { RQ_CACHE_BUSTER } from "@/config/app";
import { createQueryPersistenceCallbacks, shouldPersistQuery } from "@/lib/query-persistence";

describe("query persistence", () => {
	it("invalidates caches written before successful-only dehydration", () => {
		expect(RQ_CACHE_BUSTER).toBe("v3");
	});

	it("isolates persisted Info data by Hyperliquid environment", () => {
		const queryClient = new QueryClient();
		const mainnetOrdinaryKey = infoKey("spotMeta", undefined, "Mainnet");
		const testnetOrdinaryKey = infoKeys.method("spotMeta", undefined, "Testnet");
		const mainnetKey = infoPersistedKey("spotMeta", undefined, "Mainnet");
		const testnetKey = infoPersistedKey("spotMeta", undefined, "Testnet");
		queryClient.setQueryData(mainnetOrdinaryKey, { universe: [{ name: "MAIN" }] });
		queryClient.setQueryData(mainnetKey, { universe: [{ name: "MAIN" }] });

		expect(mainnetOrdinaryKey).not.toEqual(testnetOrdinaryKey);
		expect(queryClient.getQueryData(testnetOrdinaryKey)).toBeUndefined();
		expect(mainnetKey).not.toEqual(testnetKey);
		expect(queryClient.getQueryData(testnetKey)).toBeUndefined();
	});

	it("persists only successful queries with the persisted prefix", () => {
		const queryClient = new QueryClient();
		queryClient.setQueryData(["persisted", "userFees"], { dailyUserVlm: [] });
		queryClient.setQueryData(["info", "userFees"], { dailyUserVlm: [] });

		const persistedQuery = queryClient.getQueryCache().find({ queryKey: ["persisted", "userFees"] });
		const ordinaryQuery = queryClient.getQueryCache().find({ queryKey: ["info", "userFees"] });

		expect(persistedQuery && shouldPersistQuery(persistedQuery)).toBe(true);
		expect(ordinaryQuery && shouldPersistQuery(ordinaryQuery)).toBe(false);
	});

	it("does not dehydrate an in-flight persisted query", async () => {
		const queryClient = new QueryClient();
		let resolveQuery: ((value: string) => void) | undefined;
		const pendingResult = new Promise<string>((resolve) => {
			resolveQuery = resolve;
		});
		const request = queryClient.fetchQuery({
			queryKey: ["persisted", "userFees"],
			queryFn: () => pendingResult,
		});

		const pendingQuery = queryClient.getQueryCache().find({ queryKey: ["persisted", "userFees"] });
		expect(pendingQuery?.state.status).toBe("pending");
		expect(pendingQuery && shouldPersistQuery(pendingQuery)).toBe(false);

		resolveQuery?.("done");
		await expect(request).resolves.toBe("done");
	});

	it("saves queries that completed before the persistence provider subscribed", async () => {
		const queryClient = new QueryClient();
		const catalogKey = infoPersistedKey("spotMeta", undefined, "Mainnet");
		queryClient.setQueryData(catalogKey, { tokens: [], universe: [] });
		let persistedClient: PersistedClient | undefined;
		const persister = {
			persistClient: (client) => {
				persistedClient = client;
			},
			restoreClient: () => undefined,
			removeClient: () => undefined,
		} satisfies Persister;

		const callbacks = createQueryPersistenceCallbacks(queryClient, persister);
		await callbacks.onSuccess();

		expect(persistedClient).toMatchObject({
			buster: RQ_CACHE_BUSTER,
			clientState: {
				queries: [{ queryKey: catalogKey, state: { status: "success" } }],
			},
		});
	});
});
