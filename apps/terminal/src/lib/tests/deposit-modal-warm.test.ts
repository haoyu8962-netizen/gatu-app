import { beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({
	importFails: false,
	imports: 0,
	preload: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/lazy", () => ({
	createLazyComponent: (_importer: unknown, exportName: string) =>
		Object.assign(() => null, exportName === "DepositModal" ? { preload: testState.preload } : {}),
	preloadLazyComponents: vi.fn(() => Promise.resolve()),
}));

async function loadWarmDepositModal() {
	vi.resetModules();
	vi.doMock("@/components/trade/tradebox/deposit-modal", () => {
		testState.imports += 1;
		if (testState.importFails) throw new Error("Failed to fetch dynamically imported module");
		return { DepositModal: () => null };
	});
	const { warmDepositModal } = await import("@/components/trade/components/lazy-global-modals");
	return warmDepositModal;
}

describe("deposit dialog warm-up", () => {
	beforeEach(() => {
		testState.importFails = false;
		testState.imports = 0;
		testState.preload.mockClear();
	});

	it("hands the module to the lazy component once and ignores later intents", async () => {
		const warmDepositModal = await loadWarmDepositModal();

		warmDepositModal();
		warmDepositModal();

		await vi.waitFor(() => expect(testState.preload).toHaveBeenCalledOnce());
		expect(testState.imports).toBe(1);
	});

	it("keeps a failed warm-up away from the lazy component and loads on a later intent", async () => {
		testState.importFails = true;
		const warmDepositModal = await loadWarmDepositModal();

		warmDepositModal();
		await vi.waitFor(() => expect(testState.imports).toBe(1));
		await Promise.resolve();
		await Promise.resolve();
		expect(testState.preload).not.toHaveBeenCalled();

		testState.importFails = false;
		await vi.waitFor(() => {
			warmDepositModal();
			expect(testState.preload).toHaveBeenCalledOnce();
		});
		expect(testState.imports).toBe(2);
	});
});
