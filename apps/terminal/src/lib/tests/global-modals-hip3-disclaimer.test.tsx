// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({
	activeModal: "deposit" as string | null,
	closeCommandMenu: vi.fn(),
	hip3Disclaimer: {
		isRequired: true,
		dex: "xyz" as string | undefined,
		documentationUrl: "https://docs.trade.xyz/consolidated-resources/specification-index" as string | undefined,
	},
	openCommandMenu: vi.fn(),
}));

vi.mock("@/hooks/trade/use-hip3-disclaimer", () => ({
	useHip3DisclaimerRequirement: () => testState.hip3Disclaimer,
}));

vi.mock("@/components/trade/components/hip3-deployer-disclaimer", () => ({
	Hip3DeployerDisclaimer: (props: Record<string, unknown>) =>
		createElement("div", { "data-props": JSON.stringify(props), "data-testid": "Hip3DeployerDisclaimer" }),
}));

vi.mock("@/lib/lazy", () => ({
	createLazyComponent: (_loader: unknown, exportName: string) =>
		function LazyComponent(props: Record<string, unknown>) {
			return createElement("div", { "data-props": JSON.stringify(props), "data-testid": exportName });
		},
}));

vi.mock("@/stores/use-global-modal-store", () => ({
	useCommandMenuActions: () => ({ open: testState.openCommandMenu, close: testState.closeCommandMenu }),
	useGlobalModalType: () => testState.activeModal,
	useTransferModalActions: () => ({ close: vi.fn() }),
	useTransferModalDirection: () => "toPerp",
}));

describe("GlobalModals HIP-3 disclaimer priority", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		testState.activeModal = "deposit";
		testState.hip3Disclaimer = {
			isRequired: true,
			dex: "xyz",
			documentationUrl: "https://docs.trade.xyz/consolidated-resources/specification-index",
		};
		testState.closeCommandMenu.mockReset();
		testState.openCommandMenu.mockReset();
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.clearAllMocks();
	});

	it("renders the disclaimer instead of other global modals and blocks the command shortcut", async () => {
		const { GlobalModals } = await import("@/components/trade/components/global-modals");

		act(() => root.render(createElement(GlobalModals, { enableHip3Disclaimer: true })));
		expect(container.querySelector('[data-testid="Hip3DeployerDisclaimer"]')).not.toBeNull();
		expect(container.querySelector('[data-testid="DepositModal"]')).toBeNull();

		act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true })));
		expect(testState.openCommandMenu).not.toHaveBeenCalled();
	});

	it("preserves existing global modal behavior when no disclaimer is required", async () => {
		testState.hip3Disclaimer = {
			isRequired: false,
			dex: undefined,
			documentationUrl: undefined,
		};
		const { GlobalModals } = await import("@/components/trade/components/global-modals");

		act(() => root.render(createElement(GlobalModals, { enableHip3Disclaimer: true })));
		expect(container.querySelector('[data-testid="Hip3DeployerDisclaimer"]')).toBeNull();
		expect(container.querySelector('[data-testid="DepositModal"]')).not.toBeNull();
	});

	it("does not show the trade disclaimer on shared non-trading pages", async () => {
		const { GlobalModals } = await import("@/components/trade/components/global-modals");

		act(() => root.render(createElement(GlobalModals)));
		expect(container.querySelector('[data-testid="Hip3DeployerDisclaimer"]')).toBeNull();
		expect(container.querySelector('[data-testid="DepositModal"]')).not.toBeNull();
	});
});
