// @vitest-environment jsdom

import { act, createElement, Fragment, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createI18nRoot } from "./harness/react";

const testState = vi.hoisted(() => ({
	ready: true,
	authenticated: false,
	isMobileQrSurface: false,
	importEnabled: true,
	login: vi.fn(),
	reconnectWallet: vi.fn(),
	walletsReady: true,
	isReconnecting: false,
}));

vi.mock("@privy-io/react-auth", () => ({
	usePrivy: () => ({
		ready: testState.ready,
		authenticated: testState.authenticated,
		login: testState.login,
	}),
}));

vi.mock("@lingui/react/macro", () => ({
	Trans: ({ children }: { children: ReactNode }) => createElement(Fragment, null, children),
}));

vi.mock("@phosphor-icons/react", () => ({
	QrCodeIcon: () => null,
	SpinnerGapIcon: () => null,
	WalletIcon: () => null,
}));

vi.mock("@/hooks/use-mobile", () => ({
	useIsMobileQrSurface: () => testState.isMobileQrSurface,
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useReconnectWallet: () => ({
		reconnectWallet: testState.reconnectWallet,
		walletsReady: testState.walletsReady,
		isReconnecting: testState.isReconnecting,
	}),
}));

vi.mock("@/config/mobile-pairing", () => ({
	MOBILE_PAIRING_FEATURES: {
		get importFromQr() {
			return testState.importEnabled;
		},
	},
}));

vi.mock("@gatu/ui", () => ({
	AdaptiveModal: ({ children, open }: { children: ReactNode; open: boolean }) =>
		open ? createElement("div", null, children) : null,
	Button: ({ children, disabled, onClick }: { children: ReactNode; disabled?: boolean; onClick?: () => void }) =>
		createElement("button", { disabled, onClick, type: "button" }, children),
	ModalContent: ({ children }: { children: ReactNode }) => createElement("div", null, children),
	ModalDescription: ({ children }: { children: ReactNode }) => createElement("p", null, children),
	ModalHeader: ({ children }: { children: ReactNode }) => createElement("header", null, children),
	ModalTitle: ({ children }: { children: ReactNode }) => createElement("h2", null, children),
}));

vi.mock("@/components/trade/components/mobile-agent-qr-scanner", () => ({
	MobileAgentQrScanner: ({ onCancel }: { onCancel: () => void }) =>
		createElement(
			"div",
			null,
			"In-app QR scanner",
			createElement("button", { onClick: onCancel, type: "button" }, "Back"),
		),
}));

function findButton(container: HTMLElement, label: string): HTMLButtonElement | undefined {
	return [...container.querySelectorAll("button")].find((button) => button.textContent?.includes(label));
}

describe("WalletModal", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		testState.ready = true;
		testState.authenticated = false;
		testState.isMobileQrSurface = false;
		testState.importEnabled = true;
		testState.login.mockReset();
		testState.reconnectWallet.mockReset();
		testState.walletsReady = true;
		testState.isReconnecting = false;
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.clearAllMocks();
	});

	it("preserves the immediate Privy login flow on desktop", async () => {
		const onOpenChange = vi.fn();
		const { WalletModal } = await import("@/components/trade/components/wallet-modal");

		act(() => {
			root.render(createElement(WalletModal, { open: true, onOpenChange }));
		});

		expect(testState.login).toHaveBeenCalledTimes(1);
		expect(onOpenChange).toHaveBeenCalledWith(false);
		expect(container.textContent).toBe("");
	});

	it("reconnects an authenticated desktop session instead of closing without an action", async () => {
		testState.authenticated = true;
		const onOpenChange = vi.fn();
		const { WalletModal } = await import("@/components/trade/components/wallet-modal");

		act(() => {
			root.render(createElement(WalletModal, { open: true, onOpenChange }));
		});

		expect(testState.reconnectWallet).toHaveBeenCalledTimes(1);
		expect(testState.login).not.toHaveBeenCalled();
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("blocks an unavailable wallet runtime and launches desktop reconnect only once per opening", async () => {
		testState.authenticated = true;
		testState.walletsReady = false;
		const onOpenChange = vi.fn();
		const { WalletModal } = await import("@/components/trade/components/wallet-modal");

		act(() => {
			root.render(createElement(WalletModal, { open: true, onOpenChange }));
		});
		expect(testState.reconnectWallet).not.toHaveBeenCalled();

		testState.walletsReady = true;
		const launchedOnOpenChange = vi.fn();
		act(() => {
			root.render(createElement(WalletModal, { open: true, onOpenChange: launchedOnOpenChange }));
		});

		expect(testState.reconnectWallet).toHaveBeenCalledTimes(1);
		expect(launchedOnOpenChange).toHaveBeenCalledWith(false);

		testState.isReconnecting = true;
		act(() => {
			root.render(createElement(WalletModal, { open: true, onOpenChange: vi.fn() }));
		});
		testState.isReconnecting = false;
		act(() => {
			root.render(createElement(WalletModal, { open: true, onOpenChange: vi.fn() }));
		});
		expect(testState.reconnectWallet).toHaveBeenCalledTimes(1);

		act(() => {
			root.render(createElement(WalletModal, { open: false, onOpenChange }));
		});
		act(() => {
			root.render(createElement(WalletModal, { open: true, onOpenChange }));
		});
		expect(testState.reconnectWallet).toHaveBeenCalledTimes(2);
	});

	it("offers mobile QR linking before starting wallet login", async () => {
		testState.isMobileQrSurface = true;
		const onOpenChange = vi.fn();
		const { WalletModal } = await import("@/components/trade/components/wallet-modal");

		act(() => {
			root.render(createElement(WalletModal, { open: true, onOpenChange }));
		});

		expect(testState.login).not.toHaveBeenCalled();
		expect(findButton(container, "Connect wallet")).toBeDefined();
		expect(findButton(container, "Link Desktop Wallet")).toBeDefined();

		act(() => findButton(container, "Link Desktop Wallet")?.click());
		expect(container.textContent).toContain("In-app QR scanner");
		expect(testState.login).not.toHaveBeenCalled();
	});

	it("keeps the scanner reachable for an already authenticated mobile session", async () => {
		testState.isMobileQrSurface = true;
		testState.authenticated = true;
		const onOpenChange = vi.fn();
		const { WalletModal } = await import("@/components/trade/components/wallet-modal");

		act(() => {
			root.render(createElement(WalletModal, { open: true, onOpenChange }));
		});

		expect(findButton(container, "Link Desktop Wallet")).toBeDefined();
		expect(onOpenChange).not.toHaveBeenCalled();
		expect(testState.login).not.toHaveBeenCalled();

		act(() => findButton(container, "Reconnect wallet")?.click());
		expect(testState.reconnectWallet).toHaveBeenCalledTimes(1);
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("starts the existing reconnect flow only after the mobile user chooses Connect wallet", async () => {
		testState.isMobileQrSurface = true;
		const onOpenChange = vi.fn();
		const { WalletModal } = await import("@/components/trade/components/wallet-modal");

		act(() => {
			root.render(createElement(WalletModal, { open: true, onOpenChange }));
		});
		act(() => findButton(container, "Connect wallet")?.click());

		expect(testState.reconnectWallet).toHaveBeenCalledTimes(1);
		expect(testState.login).not.toHaveBeenCalled();
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("hides the scanner entry while QR import is gated off", async () => {
		testState.isMobileQrSurface = true;
		testState.importEnabled = false;
		const { WalletModal } = await import("@/components/trade/components/wallet-modal");

		act(() => {
			root.render(createElement(WalletModal, { open: true, onOpenChange: vi.fn() }));
		});

		expect(findButton(container, "Connect wallet")).toBeDefined();
		expect(findButton(container, "Link Desktop Wallet")).toBeUndefined();
	});

	it("blocks reconnect while the Privy wallet runtime is unavailable or reconnecting", async () => {
		testState.isMobileQrSurface = true;
		testState.walletsReady = false;
		const onOpenChange = vi.fn();
		const { WalletModal } = await import("@/components/trade/components/wallet-modal");

		act(() => {
			root.render(createElement(WalletModal, { open: true, onOpenChange }));
		});
		expect(findButton(container, "Connect wallet")?.disabled).toBe(true);

		testState.walletsReady = true;
		testState.isReconnecting = true;
		act(() => {
			root.render(createElement(WalletModal, { open: false, onOpenChange }));
		});
		act(() => {
			root.render(createElement(WalletModal, { open: true, onOpenChange }));
		});

		expect(findButton(container, "Connecting...")?.disabled).toBe(true);
		expect(testState.reconnectWallet).not.toHaveBeenCalled();
		expect(onOpenChange).not.toHaveBeenCalled();
	});
});
