import { beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({
	importFails: false,
	imports: 0,
}));

function LoadedDepositModal() {
	return null;
}

async function loadLazyGlobalModals() {
	vi.resetModules();
	vi.doMock("@/components/trade/tradebox/deposit-modal", () => {
		testState.imports += 1;
		if (testState.importFails) throw new Error("Failed to fetch dynamically imported module");
		return { DepositModal: LoadedDepositModal };
	});
	return import("@/components/trade/components/lazy-global-modals");
}

function renderOutsideReact(component: (props: never) => unknown) {
	return component({} as never) as { type?: unknown } | null;
}

function settle() {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("deposit dialog warm-up", () => {
	beforeEach(() => {
		testState.importFails = false;
		testState.imports = 0;
	});

	it("loads the real lazy component once, however many intents arrive", async () => {
		const { DepositModal, warmDepositModal } = await loadLazyGlobalModals();

		warmDepositModal();
		warmDepositModal();
		await vi.waitFor(() => expect(testState.imports).toBe(1));
		await DepositModal.preload?.();

		expect(renderOutsideReact(DepositModal)?.type).toBe(LoadedDepositModal);
		expect(testState.imports).toBe(1);
	});

	it("keeps a failed warm-up away from the lazy component, so a later open still loads it", async () => {
		testState.importFails = true;
		const { DepositModal, warmDepositModal } = await loadLazyGlobalModals();

		warmDepositModal();
		await vi.waitFor(() => expect(testState.imports).toBe(1));
		await settle();

		testState.importFails = false;
		await DepositModal.preload?.();

		expect(renderOutsideReact(DepositModal)?.type).toBe(LoadedDepositModal);
	});

	it("does nothing on intent until the owner of the lazy dialog has loaded, then warms through it", async () => {
		vi.resetModules();
		const before = await import("@/components/trade/components/deposit-modal-intent");

		before.depositModalIntentProps.onPointerEnter();
		before.depositModalIntentProps.onPointerDown();
		before.depositModalIntentProps.onFocus();
		await settle();
		expect(testState.imports).toBe(0);

		const { DepositModal } = await loadLazyGlobalModals();
		const { depositModalIntentProps } = await import("@/components/trade/components/deposit-modal-intent");

		depositModalIntentProps.onPointerEnter();
		depositModalIntentProps.onPointerDown();
		depositModalIntentProps.onFocus();
		await vi.waitFor(() => expect(testState.imports).toBe(1));
		await DepositModal.preload?.();

		expect(renderOutsideReact(DepositModal)?.type).toBe(LoadedDepositModal);
		expect(testState.imports).toBe(1);
	});

	it("warms again after a failed warm-up", async () => {
		testState.importFails = true;
		const { warmDepositModal } = await loadLazyGlobalModals();

		warmDepositModal();
		await vi.waitFor(() => expect(testState.imports).toBe(1));
		await settle();

		warmDepositModal();
		await vi.waitFor(() => expect(testState.imports).toBe(2));
	});
});
