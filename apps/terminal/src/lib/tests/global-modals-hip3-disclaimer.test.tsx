// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, createElement, type ReactNode, useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({
	activeModalListeners: new Set<() => void>(),
	activeModal: "deposit" as string | null,
	closeCommandMenu: vi.fn(),
	closeDepositModal: vi.fn(),
	depositPath: "sponsored" as "external" | "sponsored",
	discardPositionMarketCloseModal: vi.fn(),
	depositModalTab: "deposit" as "bridge" | "deposit" | "withdraw",
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
	marketClosePresentation: "confirmation" as "confirmation" | "dismissed" | "direct",
	marketClosePhase: "idle" as "idle" | "validating" | "submitting" | "reconciling",
	lazySuspension: new Promise<never>(() => {}),
	suspendedLazyComponent: null as string | null,
}));

vi.mock("@/hooks/trade/use-hip3-disclaimer", () => ({
	useHip3DisclaimerRequirement: (targetMarketName?: string | null) => {
		testState.hip3RequirementHook(targetMarketName);
		if (targetMarketName === null) return { isRequired: false, dex: undefined, documentationUrl: undefined };
		return testState.hip3Disclaimer;
	},
}));

vi.mock("@/hooks/trade/use-legal-gate", () => ({
	useLegalGate: () => {
		testState.legalGateHook();
		return testState.legalGate;
	},
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({
		walletAddress: "0x1111111111111111111111111111111111111111",
		walletIntent: "external",
	}),
}));

vi.mock("@/lib/hyperliquid", () => ({
	useHyperliquid: () => ({
		clientKey: "0x1111111111111111111111111111111111111111",
		env: "Mainnet",
		sessionMode: "wallet",
	}),
}));

vi.mock("@/components/trade/components/hip3-deployer-disclaimer", () => ({
	Hip3DeployerDisclaimer: (props: Record<string, unknown>) =>
		createElement("div", { "data-props": JSON.stringify(props), "data-testid": "Hip3DeployerDisclaimer" }),
}));

vi.mock("@/components/trade/components/legal-acceptance-modal", () => ({
	LegalAcceptanceModal: (props: Record<string, unknown>) =>
		createElement("div", { "data-props": JSON.stringify(props), "data-testid": "LegalAcceptanceModal" }),
}));

vi.mock("@/components/trade/components/trading-onboarding-gate", () => ({
	TradingOnboardingGate: ({ children }: { children: ReactNode }) =>
		createElement("div", { "data-testid": "TradingOnboardingGate" }, children),
}));

vi.mock("@/components/trade/components/position-dialog-host-gate", () => ({
	PositionDialogHostGate: () => createElement("div", { "data-testid": "PositionDialogHostGate" }),
}));

vi.mock("@/hooks/use-mobile", () => ({
	useIsMobile: () => false,
}));

vi.mock("@/hooks/trade/use-deposit-availability", () => ({
	useDepositAvailability: () => ({ path: testState.depositPath }),
}));

vi.mock("@/lib/lazy", () => ({
	createLazyComponent: (_loader: unknown, exportName: string) =>
		function LazyComponent(props: Record<string, unknown>) {
			if (testState.suspendedLazyComponent === exportName) throw testState.lazySuspension;
			return createElement("div", { "data-props": JSON.stringify(props), "data-testid": exportName });
		},
}));

vi.mock("@/stores/use-global-modal-store", () => ({
	discardPositionMarketCloseModal: testState.discardPositionMarketCloseModal,
	useCommandMenuActions: () => ({ open: testState.openCommandMenu, close: testState.closeCommandMenu }),
	useDepositModalActions: () => ({ close: testState.closeDepositModal }),
	useDepositModalTab: () => testState.depositModalTab,
	useGlobalModalType: () =>
		useSyncExternalStore(
			(listener) => {
				testState.activeModalListeners.add(listener);
				return () => testState.activeModalListeners.delete(listener);
			},
			() => testState.activeModal,
		),
	useSendModalAccountType: () => "spot",
	useSendModalActions: () => ({ close: testState.closeSendModal }),
	useSendModalAsset: () => "USDC",
	useTransferModalActions: () => ({ close: vi.fn() }),
	useTransferModalDirection: () => "toPerp",
	usePositionMarketCloseSession: () =>
		testState.activeModal === "positionMarketClose"
			? {
					sessionId: "close-session",
					presentation: testState.marketClosePresentation,
					phase: testState.marketClosePhase,
					position: { coin: "xyz:CXMT" },
				}
			: null,
}));

describe("GlobalModals HIP-3 disclaimer priority", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		Object.defineProperty(window, "matchMedia", {
			configurable: true,
			value: vi.fn().mockReturnValue({
				addEventListener: vi.fn(),
				matches: false,
				removeEventListener: vi.fn(),
			}),
		});
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		testState.activeModal = "deposit";
		testState.closeDepositModal.mockReset();
		testState.depositPath = "sponsored";
		testState.depositModalTab = "deposit";
		testState.hip3Disclaimer = {
			isRequired: true,
			dex: "xyz",
			documentationUrl: "https://docs.trade.xyz/consolidated-resources/specification-index",
		};
		testState.closeCommandMenu.mockReset();
		testState.discardPositionMarketCloseModal.mockReset();
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
		testState.marketClosePresentation = "confirmation";
		testState.marketClosePhase = "idle";
		testState.lazySuspension = new Promise<never>(() => {});
		testState.suspendedLazyComponent = null;
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.clearAllMocks();
	});

	it(
		"renders the disclaimer instead of other global modals and blocks the command shortcut",
		{ timeout: 15_000 },
		async () => {
			const { GlobalModals } = await import("@/components/trade/components/global-modals");

			act(() => root.render(createElement(GlobalModals, { enableHip3Disclaimer: true })));
			expect(container.querySelector('[data-testid="Hip3DeployerDisclaimer"]')).not.toBeNull();
			expect(container.querySelector('[data-testid="DepositModal"]')).toBeNull();
			expect(testState.hip3RequirementHook).toHaveBeenCalledTimes(1);

			act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true })));
			expect(testState.openCommandMenu).not.toHaveBeenCalled();
		},
	);

	it("renders the legal gate before the HIP-3 disclaimer and other global modals", async () => {
		testState.legalGate.state = "required";
		const { GlobalModals } = await import("@/components/trade/components/global-modals");

		act(() => root.render(createElement(GlobalModals, { enableHip3Disclaimer: true, enableLegalGate: true })));

		expect(container.querySelector('[data-testid="LegalAcceptanceModal"]')).not.toBeNull();
		expect(container.querySelector('[data-testid="Hip3DeployerDisclaimer"]')).toBeNull();
		expect(container.querySelector('[data-testid="DepositModal"]')).toBeNull();
		expect(testState.hip3RequirementHook).not.toHaveBeenCalled();
	});

	it("mounts trading onboarding only after the legal gate is accepted", async () => {
		const { GlobalModals } = await import("@/components/trade/components/global-modals");

		act(() =>
			root.render(
				createElement(GlobalModals, {
					enableHip3Disclaimer: true,
					enableLegalGate: true,
					enableTradingOnboarding: true,
				}),
			),
		);

		expect(container.querySelector('[data-testid="TradingOnboardingGate"]')).not.toBeNull();
		expect(container.querySelector('[data-testid="Hip3DeployerDisclaimer"]')).not.toBeNull();
	});

	it("keeps preference modals available while legal status is loading", async () => {
		testState.legalGate.state = "checking";
		testState.activeModal = "settings";
		const { GlobalModals } = await import("@/components/trade/components/global-modals");

		act(() => root.render(createElement(GlobalModals, { enableHip3Disclaimer: true, enableLegalGate: true })));

		expect(container.querySelector('[data-testid="GlobalSettingsModal"]')).not.toBeNull();
		expect(container.querySelector('[data-testid="DepositModal"]')).toBeNull();
		expect(testState.hip3RequirementHook).not.toHaveBeenCalled();
	});

	it("keeps the command menu available while legal status is loading", async () => {
		testState.legalGate.state = "checking";
		testState.activeModal = "commandMenu";
		const { GlobalModals } = await import("@/components/trade/components/global-modals");

		act(() => root.render(createElement(GlobalModals, { enableHip3Disclaimer: true, enableLegalGate: true })));

		expect(container.querySelector('[data-testid="CommandMenu"]')).not.toBeNull();
		expect(container.querySelector('[data-testid="DepositModal"]')).toBeNull();
		expect(testState.hip3RequirementHook).not.toHaveBeenCalled();
	});

	it("suspends a trading modal while legal status is checking without discarding it", async () => {
		const { GlobalModals } = await import("@/components/trade/components/global-modals");

		act(() => root.render(createElement(GlobalModals, { enableLegalGate: true })));
		expect(container.querySelector('[data-testid="DepositModal"]')).not.toBeNull();

		testState.legalGate.state = "checking";
		act(() => root.render(createElement(GlobalModals, { enableLegalGate: true, key: "legal-checking" })));

		expect(container.querySelector('[data-testid="DepositModal"]')).toBeNull();

		testState.legalGate.state = "accepted";
		act(() => root.render(createElement(GlobalModals, { enableLegalGate: true, key: "legal-accepted" })));
		expect(container.querySelector('[data-testid="DepositModal"]')).not.toBeNull();
	});

	it.each(["checking", "required", "submitting", "blocked", "wallet_required", "error", "accepted"])(
		"keeps the position dialog host mounted while legal status is %s",
		async (state) => {
			testState.legalGate.state = state;
			const { GlobalModals } = await import("@/components/trade/components/global-modals");

			act(() => root.render(createElement(GlobalModals, { enableLegalGate: true, enablePositionMarketClose: true })));

			expect(container.querySelector('[data-testid="PositionDialogHostGate"]')).not.toBeNull();
		},
	);

	it("keeps an in-flight position dialog owner mounted when legal status leaves accepted", async () => {
		const { GlobalModals } = await import("@/components/trade/components/global-modals");

		act(() => root.render(createElement(GlobalModals, { enableLegalGate: true, enablePositionMarketClose: true })));
		const host = container.querySelector('[data-testid="PositionDialogHostGate"]');
		expect(host).not.toBeNull();

		for (const state of ["checking", "error", "accepted"]) {
			testState.legalGate.state = state;
			act(() => root.render(createElement(GlobalModals, { enableLegalGate: true, enablePositionMarketClose: true })));
			expect(container.querySelector('[data-testid="PositionDialogHostGate"]')).toBe(host);
		}
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

		act(() => root.render(createElement(I18nProvider, { i18n }, createElement(GlobalModals))));
		expect(container.querySelector('[data-testid="Hip3DeployerDisclaimer"]')).toBeNull();
		expect(container.querySelector('[data-testid="DepositModal"]')).not.toBeNull();
		expect(testState.hip3RequirementHook).not.toHaveBeenCalled();
	});

	it("keeps the deposit modal shell stable while its lazy chunk loads", async () => {
		testState.suspendedLazyComponent = "DepositModal";
		const { GlobalModals } = await import("@/components/trade/components/global-modals");

		act(() => root.render(createElement(I18nProvider, { i18n }, createElement(GlobalModals))));

		const fallback = document.body.querySelector('[data-testid="deposit-modal-loading-fallback"]');
		expect(fallback).not.toBeNull();
		expect(fallback?.getAttribute("aria-busy")).toBe("true");
		expect(fallback?.getAttribute("data-deposit-loading-layout")).toBe("funding-address");
		expect(fallback?.getAttribute("data-desktop-content-height")).toBe("37.5rem");
		expect(fallback?.className).toContain("min-[1001px]:h-[37.5rem]");
		expect(fallback?.querySelectorAll("[data-skeleton-slot]")).toHaveLength(6);
		expect(fallback?.querySelector('[aria-hidden="true"]')).not.toBeNull();
		const depositTitle = document.body.querySelector("h2");
		expect(depositTitle?.textContent).toBe("Deposit");
		expect(depositTitle?.className).toContain("sr-only");
		expect(document.body.querySelector('[role="dialog"]')?.getAttribute("aria-labelledby")).toBe(depositTitle?.id);
		expect(fallback?.querySelector("span.sr-only")?.textContent).toContain("Loading");
		expect(fallback?.querySelector(".animate-spin")).toBeNull();
		expect(container.querySelector('[data-testid="global-modal-loading-fallback"]')).toBeNull();

		const closeButton = document.body.querySelector<HTMLButtonElement>('button[aria-label="Close"]');
		expect(closeButton).not.toBeNull();
		act(() => closeButton?.click());
		expect(testState.closeDepositModal).toHaveBeenCalledOnce();
	});

	it("keeps the withdrawal title visible while its lazy chunk loads", async () => {
		testState.depositModalTab = "withdraw";
		testState.suspendedLazyComponent = "DepositModal";
		const { GlobalModals } = await import("@/components/trade/components/global-modals");

		act(() => root.render(createElement(I18nProvider, { i18n }, createElement(GlobalModals))));

		const withdrawTitle = document.body.querySelector("h2");
		expect(withdrawTitle?.textContent).toBe("Withdraw");
		expect(withdrawTitle?.className).not.toContain("sr-only");
	});

	it("preserves the compact loading fallback for other lazy global modals", async () => {
		testState.activeModal = "settings";
		testState.suspendedLazyComponent = "GlobalSettingsModal";
		const { GlobalModals } = await import("@/components/trade/components/global-modals");

		act(() => root.render(createElement(I18nProvider, { i18n }, createElement(GlobalModals))));

		expect(container.querySelector('[data-testid="global-modal-loading-fallback"]')).not.toBeNull();
		expect(document.body.querySelector('[data-testid="deposit-modal-loading-fallback"]')).toBeNull();
	});

	it("preserves the compact loading fallback for external-wallet deposits", async () => {
		testState.depositPath = "external";
		testState.suspendedLazyComponent = "DepositModal";
		const { GlobalModals } = await import("@/components/trade/components/global-modals");

		act(() => root.render(createElement(I18nProvider, { i18n }, createElement(GlobalModals))));

		expect(container.querySelector('[data-testid="global-modal-loading-fallback"]')).not.toBeNull();
		expect(document.body.querySelector('[data-testid="deposit-modal-loading-fallback"]')).toBeNull();
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

	it("does not let Command-K replace an active funds modal", async () => {
		testState.activeModal = "send";
		const { GlobalModals } = await import("@/components/trade/components/global-modals");

		act(() => root.render(createElement(GlobalModals)));
		act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true })));

		expect(testState.openCommandMenu).not.toHaveBeenCalled();
		expect(testState.closeCommandMenu).not.toHaveBeenCalled();
	});

	it("mounts market close only in enabled scopes and does not replace it with Command-K", async () => {
		testState.activeModal = "positionMarketClose";
		const { GlobalModals } = await import("@/components/trade/components/global-modals");

		act(() => root.render(createElement(GlobalModals, { enablePositionMarketClose: true })));
		expect(container.querySelector('[data-testid="PositionMarketCloseModal"]')).not.toBeNull();

		act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true })));
		expect(testState.openCommandMenu).not.toHaveBeenCalled();

		act(() => root.render(createElement(GlobalModals)));
		expect(container.querySelector('[data-testid="PositionMarketCloseModal"]')).toBeNull();
		expect(testState.discardPositionMarketCloseModal).toHaveBeenCalledOnce();
	});

	it("never mounts a direct close but keeps a dismissed close mounted while it runs", async () => {
		testState.activeModal = "positionMarketClose";
		testState.marketClosePresentation = "direct";
		testState.marketClosePhase = "reconciling";
		const { GlobalModals } = await import("@/components/trade/components/global-modals");

		act(() => root.render(createElement(GlobalModals, { enablePositionMarketClose: true })));
		expect(container.querySelector('[data-testid="PositionMarketCloseModal"]')).toBeNull();

		testState.marketClosePresentation = "dismissed";
		testState.marketClosePhase = "submitting";
		act(() => root.render(createElement(GlobalModals, { key: "dismissed", enablePositionMarketClose: true })));
		expect(container.querySelector('[data-testid="PositionMarketCloseModal"]')).not.toBeNull();
	});

	it("keeps a closing global modal mounted for its exit transition and then unmounts it", async () => {
		vi.useFakeTimers();
		try {
			testState.activeModal = "settings";
			const { GlobalModals } = await import("@/components/trade/components/global-modals");

			act(() => root.render(createElement(GlobalModals)));
			expect(container.querySelector('[data-testid="GlobalSettingsModal"]')).not.toBeNull();

			act(() => {
				testState.activeModal = null;
				for (const listener of testState.activeModalListeners) listener();
			});
			expect(container.querySelector('[data-testid="GlobalSettingsModal"]')).not.toBeNull();

			act(() => {
				vi.advanceTimersByTime(250);
			});
			expect(container.querySelector('[data-testid="GlobalSettingsModal"]')).toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});

	it("binds the HIP-3 gate to the market-close target instead of the selected terminal market", async () => {
		testState.activeModal = "positionMarketClose";
		const { GlobalModals } = await import("@/components/trade/components/global-modals");

		act(() =>
			root.render(createElement(GlobalModals, { enableHip3Disclaimer: true, enablePositionMarketClose: true })),
		);

		expect(testState.hip3RequirementHook).toHaveBeenCalledWith("xyz:CXMT");
		expect(container.querySelector('[data-testid="Hip3DeployerDisclaimer"]')).not.toBeNull();
		expect(container.querySelector('[data-testid="PositionMarketCloseModal"]')).toBeNull();
	});

	it("does not show a selected-market disclaimer on position-close-only pages", async () => {
		const { GlobalModals } = await import("@/components/trade/components/global-modals");

		act(() =>
			root.render(
				createElement(GlobalModals, {
					enableHip3Disclaimer: true,
					enablePositionMarketClose: true,
					enableSelectedMarketHip3Disclaimer: false,
				}),
			),
		);

		expect(testState.hip3RequirementHook).toHaveBeenCalledWith(null);
		expect(container.querySelector('[data-testid="Hip3DeployerDisclaimer"]')).toBeNull();
		expect(container.querySelector('[data-testid="DepositModal"]')).not.toBeNull();
	});
});
