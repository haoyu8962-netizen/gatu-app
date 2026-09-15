import { describe, expect, it, vi } from "vitest";
import { createClientRootLoader } from "@/providers/client-root-loader";

type ClientRootModule = Parameters<typeof createClientRootLoader>[0] extends () => Promise<infer M> ? M : never;

function Provider() {
	return null;
}

describe("createClientRootLoader", () => {
	it("publishes the loaded provider as a new snapshot and shares one import", async () => {
		const importer = vi.fn(async () => ({ ClientRootProvider: Provider }) as unknown as ClientRootModule);
		const loader = createClientRootLoader(importer);
		const listener = vi.fn();
		loader.subscribe(listener);
		const before = loader.getState();
		expect(before).toBe(loader.getServerState());
		await Promise.all([loader.load(), loader.load()]);
		expect(importer).toHaveBeenCalledTimes(1);
		expect(listener).toHaveBeenCalledTimes(1);
		expect(loader.getState()).not.toBe(before);
		expect(loader.getState()).toMatchObject({ Provider, error: undefined });
	});

	it("publishes a failed load as a new snapshot carrying the error, so the gate re-renders and throws", async () => {
		const error = new Error("chunk failed");
		const loader = createClientRootLoader(() => Promise.reject(error));
		const listener = vi.fn();
		loader.subscribe(listener);
		const before = loader.getState();
		await expect(loader.load()).rejects.toBe(error);
		expect(listener).toHaveBeenCalledTimes(1);
		expect(loader.getState()).not.toBe(before);
		expect(loader.getState()).toEqual({ Provider: null, error });
		expect(loader.getServerState()).toEqual({ Provider: null, error: undefined });
	});

	it("never publishes an empty failure", async () => {
		const loader = createClientRootLoader(() => Promise.reject(undefined));
		await expect(loader.load()).rejects.toBeUndefined();
		expect(loader.getState().error).toBeInstanceOf(Error);
	});
});
