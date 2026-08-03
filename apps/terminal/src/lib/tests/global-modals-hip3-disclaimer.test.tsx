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
	hip3RequirementHook: vi.fn(),
	legalGate: {
		state: "accepted" as string,
		identity: "0x1234",
		accept: vi.fn(),
		acceptanceError: null,
		resetAcceptance: vi.fn(),
		retryStatus: vi.fn(),
	},
	legalGateHook: vi.fn(),
	openCommandMenu: vi.fn(),
	closeSendModal: vi.fn(),
}));

vi.mock("@/hooks/trade/use-hip3-disclaimer", () => ({
	useHip3DisclaimerRequirement: () => {
		testState.hip3RequirementHook();
		return testState.hip3Disclaimer;
	},
}));

vi.mock("@/hooks/trade/use-legal-gate", () => ({
	useLegalGate: () => {
		testState.legalGateHook();
		return testState.legalGate;
	},
}));

vi.mock("@/components/trade/components/hip3-deployer-disclaimer", () => ({
	Hip3DeployerDisclaimer: (props: Record<string, unknown>) =>
		createElement("div", { "data-props": JSON.stringify(props), "data-testid": "Hip3DeployerDisclaimer" }),
}));

vi.mock("@/components/trade/components/legal-acceptance-modal", () => ({
	LegalAcceptanceModal: (props: Record<string, unknown>) =>
		createElement("div", { "data-props": JSON.stringify(props), "data-testid": "LegalAcceptanceModal" }),
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
	useSendModalAccountType: () => "spot",
	useSendModalActions: () => ({ close: testState.closeSendModal }),
	useSendModalAsset: () => "USDC",
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
		testState.closeSendModal.mockReset();
		testState.hip3RequirementHook.mockReset();
		testState.legalGate = {
			state: "accepted",
			identity: "0x1234",
			accept: vi.fn(),
			acceptanceError: null,
			resetAcceptance: vi.fn(),
			retryStatus: vi.fn(),
		};
		testState.legalGateHook.mockReset();
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
		expect(testState.hip3RequirementHook).toHaveBeenCalledTimes(1);

		act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true })));
		expect(testState.openCommandMenu).not.toHaveBeenCalled();
	});

	it("renders the legal gate before the HIP-3 disclaimer and other global modals", async () => {
		testState.legalGate.state = "required";
		const { GlobalModals } = await import("@/components/trade/components/global-modals");

		act(() => root.render(createElement(GlobalModals, { enableHip3Disclaimer: true, enableLegalGate: true })));

		expect(container.querySelector('[data-testid="LegalAcceptanceModal"]')).not.toBeNull();
		expect(container.querySelector('[data-testid="Hip3DeployerDisclaimer"]')).toBeNull();
		expect(container.querySelector('[data-testid="DepositModal"]')).toBeNull();
		expect(testState.hip3RequirementHook).not.toHaveBeenCalled();
	});

	it("suppresses lower-priority modals while legal status is loading", async () => {
		testState.legalGate.state = "checking";
		const { GlobalModals } = await import("@/components/trade/components/global-modals");

		act(() => root.render(createElement(GlobalModals, { enableHip3Disclaimer: true, enableLegalGate: true })));

		expect(container.children).toHaveLength(0);
		expect(testState.hip3RequirementHook).not.toHaveBeenCalled();
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
		expect(testState.hip3RequirementHook).not.toHaveBeenCalled();
	});

	it("mounts the globally accessible Send modal with the requested account defaults", async () => {
		testState.activeModal = "send";
		const { GlobalModals } = await import("@/components/trade/components/global-modals");

		act(() => root.render(createElement(GlobalModals)));

		const sendModal = container.querySelector('[data-testid="SendModal"]');
		expect(sendModal).not.toBeNull();
		expect(sendModal?.getAttribute("data-props")).toContain('"initialAsset":"USDC"');
		expect(sendModal?.getAttribute("data-props")).toContain('"initialAccountType":"spot"');
	});
});
