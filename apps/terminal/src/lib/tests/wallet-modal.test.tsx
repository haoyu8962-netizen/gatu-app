// @vitest-environment jsdom

import { act, createElement, Fragment, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type ConnectorMessage = { type?: string; data?: unknown };

const testState = vi.hoisted(() => ({
	activateWalletConnectPairing: vi.fn(),
	connectAsync: vi.fn(),
	isMobile: false,
	pairWalletConnectUri: vi.fn(),
	walletConnectHandler: null as ((message: ConnectorMessage) => void) | null,
}));

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
	QrCodeIcon: Icon,
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
	useIsMobile: () => testState.isMobile,
}));

vi.mock("wagmi", () => ({
	useConnect: () => ({
		error: null,
		isPending: false,
		mutateAsync: testState.connectAsync,
	}),
	useConnectors: () => [
		{ id: "coinbaseWallet", name: "Coinbase Wallet", type: "coinbaseWallet", uid: "coinbase" },
		{
			id: "walletConnect",
			name: "WalletConnect",
			type: "walletConnect",
			uid: "wallet-connect",
			emitter: {
				on: (_eventName: "message", handler: (message: ConnectorMessage) => void) => {
					testState.walletConnectHandler = handler;
				},
				off: (_eventName: "message", handler: (message: ConnectorMessage) => void) => {
					if (testState.walletConnectHandler === handler) testState.walletConnectHandler = null;
				},
			},
			getProvider: vi.fn(async () => ({
				signer: {
					client: {
						core: {
							pairing: {
								activate: testState.activateWalletConnectPairing,
							},
						},
						pair: testState.pairWalletConnectUri,
					},
				},
			})),
		},
		{ id: "mock", name: "Mock Wallet", type: "mock", uid: "mock" },
	],
}));

vi.mock("qrcode", () => ({
	toDataURL: vi.fn(async () => "data:image/png;base64,qr"),
}));

vi.mock("wagmi/connectors", () => ({
	mock: ({ accounts }: { accounts: readonly string[] }) => ({
		id: "mock",
		name: "Custom Mock Wallet",
		type: "mock",
		uid: `custom-${accounts[0] ?? "wallet"}`,
	}),
}));

function mockCamera() {
	const stopTrack = vi.fn();
	const getUserMedia = vi.fn(async () => ({
		getTracks: () => [{ stop: stopTrack }],
	}));

	Object.defineProperty(navigator, "mediaDevices", {
		configurable: true,
		value: { getUserMedia },
	});
	Object.defineProperty(HTMLMediaElement.prototype, "srcObject", {
		configurable: true,
		writable: true,
		value: null,
	});
	vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
	vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) =>
		window.setTimeout(() => callback(performance.now()), 0),
	);
	vi.spyOn(window, "cancelAnimationFrame").mockImplementation((handle) => window.clearTimeout(handle));

	return { getUserMedia, stopTrack };
}

async function flushAsyncWork(times = 4) {
	for (let i = 0; i < times; i += 1) {
		await act(async () => {
			await new Promise((resolve) => window.setTimeout(resolve, 0));
		});
	}
}

function mockBarcodeDetector(detect: () => Promise<Array<{ rawValue?: string }>>) {
	class BarcodeDetectorMock {
		async detect() {
			return detect();
		}
	}
	vi.stubGlobal("BarcodeDetector", BarcodeDetectorMock);
	Object.defineProperty(window, "BarcodeDetector", {
		configurable: true,
		value: BarcodeDetectorMock,
	});
}

describe("WalletModal", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		testState.isMobile = false;
		testState.walletConnectHandler = null;
		testState.activateWalletConnectPairing.mockReset();
		testState.activateWalletConnectPairing.mockResolvedValue(undefined);
		testState.pairWalletConnectUri.mockReset();
		testState.pairWalletConnectUri.mockResolvedValue(undefined);
		testState.connectAsync.mockReset();
		testState.connectAsync.mockResolvedValue(undefined);
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
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
		Reflect.deleteProperty(window, "BarcodeDetector");
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

	it("keeps the standard mobile WalletConnect path available alongside desktop linking", async () => {
		testState.isMobile = true;

		const { WalletModal } = await import("@/components/trade/components/wallet-modal");

		act(() => {
			root.render(createElement(WalletModal, { open: true, onOpenChange: vi.fn() }));
		});

		const buttons = [...container.querySelectorAll("button")];
		expect(buttons.some((button) => button.textContent?.includes("Link desktop wallet"))).toBe(true);
		expect(
			buttons.some(
				(button) =>
					button.textContent?.includes("WalletConnect") && !button.textContent?.includes("Link desktop wallet"),
			),
		).toBe(true);
	});

	it("shows a mobile link desktop wallet action and starts the camera scanner", async () => {
		testState.isMobile = true;
		const { getUserMedia } = mockCamera();
		mockBarcodeDetector(async () => []);

		const { WalletModal } = await import("@/components/trade/components/wallet-modal");

		act(() => {
			root.render(createElement(WalletModal, { open: true, onOpenChange: vi.fn() }));
		});

		const linkDesktopButton = [...container.querySelectorAll("button")].find((button) =>
			button.textContent?.includes("Link desktop wallet"),
		);
		expect(linkDesktopButton).toBeDefined();

		act(() => {
			linkDesktopButton?.click();
		});

		await flushAsyncWork();

		expect(container.textContent).toContain("Scan desktop wallet QR");
		expect(getUserMedia).toHaveBeenCalledWith({
			audio: false,
			video: { facingMode: { ideal: "environment" } },
		});
		expect(container.querySelector('video[aria-label="Desktop wallet QR scanner"]')).not.toBeNull();
	});

	it("connects a scanned WalletConnect desktop QR", async () => {
		testState.isMobile = true;
		mockCamera();
		mockBarcodeDetector(async () => [{ rawValue: "wc:abc123@2?relay-protocol=irn" }]);

		const onOpenChange = vi.fn();
		const { WalletModal } = await import("@/components/trade/components/wallet-modal");

		act(() => {
			root.render(createElement(WalletModal, { open: true, onOpenChange }));
		});

		const linkDesktopButton = [...container.querySelectorAll("button")].find((button) =>
			button.textContent?.includes("Link desktop wallet"),
		);
		expect(linkDesktopButton).toBeDefined();

		act(() => {
			linkDesktopButton?.click();
		});

		await flushAsyncWork(8);

		expect(testState.pairWalletConnectUri).toHaveBeenCalledWith({
			activatePairing: true,
			uri: "wc:abc123@2?relay-protocol=irn",
		});
		expect(testState.activateWalletConnectPairing).toHaveBeenCalledWith({
			topic: "abc123",
		});
		expect(testState.connectAsync).toHaveBeenCalledWith(
			expect.objectContaining({
				connector: expect.objectContaining({ id: "walletConnect" }),
				pairingTopic: "abc123",
			}),
		);
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("does not connect if QR detection resolves after the scanner is cancelled", async () => {
		testState.isMobile = true;
		mockCamera();
		let resolveDetect: ((codes: Array<{ rawValue?: string }>) => void) | null = null;
		const detectStarted = vi.fn();
		mockBarcodeDetector(
			() =>
				new Promise((resolve) => {
					detectStarted();
					resolveDetect = resolve;
				}),
		);

		const { WalletModal } = await import("@/components/trade/components/wallet-modal");

		act(() => {
			root.render(createElement(WalletModal, { open: true, onOpenChange: vi.fn() }));
		});

		const linkDesktopButton = [...container.querySelectorAll("button")].find((button) =>
			button.textContent?.includes("Link desktop wallet"),
		);
		expect(linkDesktopButton).toBeDefined();

		act(() => {
			linkDesktopButton?.click();
		});

		await flushAsyncWork(6);
		expect(detectStarted).toHaveBeenCalled();

		const cancelButton = [...container.querySelectorAll("button")].find(
			(button) => button.textContent?.trim() === "Cancel",
		);
		expect(cancelButton).toBeDefined();

		act(() => {
			cancelButton?.click();
		});

		await act(async () => {
			resolveDetect?.([{ rawValue: "wc:late@2?relay-protocol=irn" }]);
			await new Promise((resolve) => window.setTimeout(resolve, 0));
		});
		await flushAsyncWork();

		expect(testState.pairWalletConnectUri).not.toHaveBeenCalled();
		expect(testState.connectAsync).not.toHaveBeenCalled();
	});
});
