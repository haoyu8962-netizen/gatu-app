// @vitest-environment jsdom

import { act, createElement, Fragment, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function renderChildren(children: ReactNode) {
	return createElement(Fragment, null, children);
}

function Icon({ className }: { className?: string }) {
	return createElement("span", { className, "aria-hidden": true });
}

vi.mock("@lingui/react/macro", () => ({
	Trans: ({ children }: { children: ReactNode }) => renderChildren(children),
}));

vi.mock("@lingui/core/macro", () => ({
	t: (strings: TemplateStringsArray | string, ...values: unknown[]) => {
		if (typeof strings === "string") return strings;
		return strings.reduce((message, part, index) => `${message}${part}${values[index] ?? ""}`, "");
	},
}));

vi.mock("@phosphor-icons/react", () => ({
	ArrowSquareOutIcon: Icon,
	CaretDownIcon: Icon,
	CopyIcon: Icon,
	DeviceMobileIcon: Icon,
	FlaskIcon: Icon,
	LinkIcon: Icon,
	SpinnerGapIcon: Icon,
	WalletIcon: Icon,
	WarningCircleIcon: Icon,
	XIcon: Icon,
}));

vi.mock("@hypeterminal/ui", () => ({
	Button: ({
		children,
		disabled,
		onClick,
		type,
	}: {
		children: ReactNode;
		disabled?: boolean;
		onClick?: () => void;
		type?: "button" | "submit" | "reset";
	}) => createElement("button", { disabled, onClick, type: type ?? "button" }, children),
	Drawer: ({ children, open }: { children: ReactNode; open: boolean }) =>
		open ? createElement("div", { role: "dialog" }, children) : null,
	DrawerContent: ({ children }: { children: ReactNode }) => renderChildren(children),
	Modal: ({ children, open }: { children: ReactNode; open: boolean }) =>
		open ? createElement("div", { role: "dialog" }, children) : null,
	ModalContent: ({ children }: { children: ReactNode }) => renderChildren(children),
	ModalPopup: ({ children }: { children: ReactNode }) => renderChildren(children),
	TextInput: ({
		label,
		onChange,
		value,
	}: {
		label: ReactNode;
		onChange?: (event: { target: { value: string } }) => void;
		value?: string;
	}) =>
		createElement(
			"label",
			null,
			label,
			createElement("input", {
				onChange: (event) => onChange?.({ target: { value: event.currentTarget.value } }),
				value: value ?? "",
			}),
		),
}));

vi.mock("@/config/wagmi", () => ({
	MOCK_WALLETS: [],
}));

vi.mock("@/hooks/use-mobile", () => ({
	useIsMobile: () => false,
}));

vi.mock("wagmi", () => ({
	useConnect: () => ({
		error: null,
		isPending: false,
		mutateAsync: vi.fn(),
	}),
	useConnectors: () => [
		{ id: "coinbaseWallet", name: "Coinbase Wallet", type: "coinbaseWallet", uid: "coinbase" },
		{ id: "walletConnect", name: "WalletConnect", type: "walletConnect", uid: "wallet-connect" },
		{ id: "mock", name: "Mock Wallet", type: "mock", uid: "mock" },
	],
}));

vi.mock("wagmi/connectors", () => ({
	mock: ({ accounts }: { accounts: readonly string[] }) => ({
		id: "mock",
		name: "Custom Mock Wallet",
		type: "mock",
		uid: `custom-${accounts[0] ?? "wallet"}`,
	}),
}));

describe("WalletModal", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		vi.stubGlobal("localStorage", {
			getItem: vi.fn(() => null),
			setItem: vi.fn(),
			removeItem: vi.fn(),
		});
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.clearAllMocks();
		vi.unstubAllGlobals();
	});

	it("renders connector groups without crashing", async () => {
		const { WalletModal } = await import("@/components/trade/components/wallet-modal");

		act(() => {
			root.render(createElement(WalletModal, { open: true, onOpenChange: vi.fn() }));
		});

		expect(container.textContent).toContain("Coinbase Wallet");
		expect(container.textContent).toContain("WalletConnect");
		expect(container.textContent).toContain("Mock Wallet");
	});
});
