/** @vitest-environment jsdom */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));

const testState = vi.hoisted(() => ({
	exportVisible: false,
	exportWallet: vi.fn(async (beforeOpen?: () => void) => {
		beforeOpen?.();
	}),
	open: true,
	close: vi.fn(() => {
		testState.open = false;
	}),
	modalProps: null as Record<string, unknown> | null,
	isMobile: false,
	marketOrderSlippagePercent: 0.5,
	formatLocale: "en-US",
	setMarketOrderSlippagePercent: vi.fn((value: number) => {
		testState.marketOrderSlippagePercent = value;
	}),
	setShowOrderbookInQuote: vi.fn(),
	animateOrderbook: true,
	setAnimateOrderbook: vi.fn((value: boolean) => {
		testState.animateOrderbook = value;
	}),
	skipOrderConfirmation: false,
	setSkipOrderConfirmation: vi.fn((value: boolean) => {
		testState.skipOrderConfirmation = value;
	}),
	numberInputProps: null as Record<string, unknown> | null,
	toggleProps: [] as Record<string, unknown>[],
}));

vi.mock("@/hooks/wallet/use-email-wallet-export", () => ({
	useEmailWalletExport: () => ({
		visible: testState.exportVisible,
		canExport: true,
		exportEmailWallet: testState.exportWallet,
	}),
}));

vi.mock("@sairn/ui", () => ({
	Button: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) =>
		createElement("button", { type: "button", ...props }, children),
	Modal: (props: { children: ReactNode } & Record<string, unknown>) => {
		testState.modalProps = props;
		return createElement("div", { role: "dialog" }, props.children);
	},
	ModalContent: ({ children }: { children: ReactNode }) => createElement("div", null, children),
	ModalHeader: ({ children }: { children: ReactNode }) => createElement("div", null, children),
	ModalPopup: ({ children }: { children: ReactNode }) => createElement("div", null, children),
	ModalTitle: ({ children }: { children: ReactNode }) => createElement("h2", null, children),
	SegmentedControlItem: ({ children }: { children: ReactNode }) => createElement("div", null, children),
	SegmentedControls: ({ children }: { children: ReactNode }) => createElement("div", null, children),
	Toggle: (props: Record<string, unknown>) => {
		testState.toggleProps.push(props);
		return createElement("button", {
			type: "button",
			role: "switch",
			"aria-label": props["aria-label"],
			"aria-checked": props.checked,
			onClick: () => (props.onCheckedChange as (next: boolean) => void)(!props.checked),
		});
	},
}));

vi.mock("@/components/ui/number-input", () => ({
	NumberInput: (props: Record<string, unknown>) => {
		testState.numberInputProps = props;
		return createElement("input", {
			value: String(props.value ?? ""),
			"aria-label": props["aria-label"],
			"aria-describedby": props["aria-describedby"],
			"aria-invalid": props["aria-invalid"],
			onChange: props.onChange,
			onBlur: props.onBlur,
		});
	},
}));

vi.mock("@/hooks/use-mobile", () => ({
	useIsMobile: () => testState.isMobile,
}));

vi.mock("@/lib/hyperliquid", () => ({
	useHyperliquid: () => ({ clientKey: "0xabc", env: "Mainnet" }),
}));

vi.mock("@/lib/trade/position-market-close-confirmation-preference", () => ({
	readPositionMarketCloseConfirmationPreference: () => "required",
	resetPositionMarketCloseConfirmation: () => "required",
}));

vi.mock("@/stores/use-global-modal-store", () => ({
	useSettingsDialogActions: () => ({ close: testState.close }),
	useSettingsDialogOpen: () => testState.open,
}));

vi.mock("@/stores/use-global-settings-store", () => ({
	getResolvedFormatLocale: () => testState.formatLocale,
	useGlobalSettings: () => ({ showOrderbookInQuote: false }),
	useGlobalSettingsActions: () => ({
		setMarketOrderSlippagePercent: testState.setMarketOrderSlippagePercent,
		setNetwork: vi.fn(),
		setShowOrderbookInQuote: testState.setShowOrderbookInQuote,
		setAnimateOrderbook: testState.setAnimateOrderbook,
		setSkipOrderConfirmation: testState.setSkipOrderConfirmation,
	}),
	useMarketOrderSlippagePercent: () => testState.marketOrderSlippagePercent,
	useNetwork: () => "mainnet",
	useSkipOrderConfirmation: () => testState.skipOrderConfirmation,
	useAnimateOrderbook: () => testState.animateOrderbook,
}));

import { GlobalSettingsModal } from "@/components/trade/components/global-settings-modal";
import { APP_BUILD_COMMIT, APP_RELEASE_ID, APP_RELEASE_LABEL, APP_RELEASE_TAG, APP_VERSION } from "@/config/app";
import { notifyNumberFormatChange } from "@/lib/number-format-reactivity";

describe("GlobalSettingsModal", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		testState.exportVisible = false;
		testState.exportWallet.mockClear();
		i18n.loadAndActivate({ locale: "en", messages: {} });
		testState.open = true;
		testState.close.mockClear();
		testState.modalProps = null;
		testState.isMobile = false;
		testState.marketOrderSlippagePercent = 0.5;
		testState.formatLocale = "en-US";
		testState.setMarketOrderSlippagePercent.mockClear();
		testState.setShowOrderbookInQuote.mockClear();
		testState.animateOrderbook = true;
		testState.setAnimateOrderbook.mockClear();
		testState.skipOrderConfirmation = false;
		testState.setSkipOrderConfirmation.mockClear();
		testState.numberInputProps = null;
		testState.toggleProps = [];
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		renderModal();
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.useRealTimers();
	});

	function renderModal() {
		act(() =>
			root.render(createElement(I18nProvider, { i18n }, testState.open ? createElement(GlobalSettingsModal) : null)),
		);
	}

	it("closes Settings before launching the explicit email export action", async () => {
		testState.exportVisible = true;
		renderModal();
		await act(async () => {
			getButton(container, "Export email wallet").click();
		});
		expect(testState.exportWallet).toHaveBeenCalledOnce();
		expect(testState.close).toHaveBeenCalledOnce();
		expect(testState.open).toBe(false);
	});

	it("translates wallet export without remounting Settings or losing its draft", () => {
		testState.exportVisible = true;
		renderModal();
		const button = getButton(container, "Export email wallet");
		const input = getSlippageInput(container);
		changeInput(input, "1.25");
		const messageId = createHash("sha256").update("Export email wallet\x1f").digest("base64").slice(0, 6);
		act(() => i18n.loadAndActivate({ locale: "zh", messages: { [messageId]: "导出邮箱钱包" } }));
		expect(getButton(container, "导出邮箱钱包")).toBe(button);
		expect(getSlippageInput(container)).toBe(input);
		expect(input.value).toBe("1.25");
		expect(testState.exportWallet).not.toHaveBeenCalled();
	});

	it("keeps edits and blur local until the explicit confirmation", () => {
		const input = getSlippageInput(container);
		act(() => input.focus());
		changeInput(input, "1.25");
		act(() => input.blur());

		expect(testState.setMarketOrderSlippagePercent).not.toHaveBeenCalled();
		expect(input.value).toBe("1.25");

		const confirm = getButton(container, "Confirm");
		act(() => confirm.click());
		act(() => confirm.click());

		expect(testState.setMarketOrderSlippagePercent).toHaveBeenCalledExactlyOnceWith(1.25);
		expect(input.value).toBe("1.25");
		expect(confirm.disabled).toBe(true);
		expect(testState.close).not.toHaveBeenCalled();
	});

	it.each(["", ".", "0", "0.09", "5.01", "9"])(
		"rejects the invalid draft %j without changing the risk setting",
		(draft) => {
			const input = getSlippageInput(container);
			changeInput(input, draft);
			act(() => input.blur());
			const confirm = getButton(container, "Confirm");
			act(() => confirm.click());

			expect(confirm.disabled).toBe(true);
			expect(input.getAttribute("aria-invalid")).toBe("true");
			expect(input.value).toBe(draft);
			expect(testState.marketOrderSlippagePercent).toBe(0.5);
			expect(testState.setMarketOrderSlippagePercent).not.toHaveBeenCalled();
		},
	);

	it.each(["0.1", "5"])("allows confirmation at the %s percent boundary", (draft) => {
		changeInput(getSlippageInput(container), draft);
		act(() => getButton(container, "Confirm").click());

		expect(testState.setMarketOrderSlippagePercent).toHaveBeenCalledExactlyOnceWith(Number(draft));
	});

	it("cancels a draft without persisting or disturbing other settings", () => {
		const input = getSlippageInput(container);
		changeInput(input, "2.35");
		act(() => getButton(container, "Cancel").click());

		expect(input.value).toBe("0.5");
		expect(testState.setMarketOrderSlippagePercent).not.toHaveBeenCalled();
		expect(testState.setSkipOrderConfirmation).not.toHaveBeenCalled();
		expect(testState.setAnimateOrderbook).not.toHaveBeenCalled();
	});

	it("discards a dismissed draft and restores the persisted value when reopened", () => {
		changeInput(getSlippageInput(container), "2.35");
		act(() => (testState.modalProps?.onOpenChange as (open: boolean) => void)(false));
		renderModal();

		expect(testState.close).toHaveBeenCalledTimes(1);
		expect(container.querySelector("input")).toBeNull();
		expect(testState.setMarketOrderSlippagePercent).not.toHaveBeenCalled();

		testState.open = true;
		testState.marketOrderSlippagePercent = 0.75;
		renderModal();

		expect(getSlippageInput(container).value).toBe("0.75");
		expect(getButton(container, "Confirm").disabled).toBe(true);
	});

	it("has no slider or delayed pointer callbacks that can persist a canceled edit", () => {
		vi.useFakeTimers();
		changeInput(getSlippageInput(container), "4.5");
		act(() => getButton(container, "Cancel").click());
		act(() => {
			document.dispatchEvent(new Event("pointercancel", { bubbles: true }));
			document.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 500 }));
			document.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: 500 }));
			vi.runOnlyPendingTimers();
		});

		expect(container.querySelector('[role="slider"], input[type="range"]')).toBeNull();
		expect(getSlippageInput(container).value).toBe("0.5");
		expect(testState.setMarketOrderSlippagePercent).not.toHaveBeenCalled();
	});

	it("shows the order confirmation toggle on and writes the inverted skip flag when turned off", () => {
		const toggle = findOrderConfirmationToggle();

		expect(toggle?.checked).toBe(true);

		act(() => (toggle?.onCheckedChange as ((next: boolean) => void) | undefined)?.(false));

		expect(testState.setSkipOrderConfirmation).toHaveBeenCalledTimes(1);
		expect(testState.setSkipOrderConfirmation).toHaveBeenCalledWith(true);
	});

	it("renders the toggle off once the skip preference is stored", () => {
		testState.skipOrderConfirmation = true;
		testState.toggleProps = [];
		renderModal();

		const toggle = findOrderConfirmationToggle();

		expect(toggle?.checked).toBe(false);

		act(() => (toggle?.onCheckedChange as ((next: boolean) => void) | undefined)?.(true));

		expect(testState.setSkipOrderConfirmation).toHaveBeenCalledWith(false);
	});

	it("writes the slippage range with the number-format decimal sign", () => {
		const rangeId = container.querySelector("input")?.getAttribute("aria-describedby");
		testState.formatLocale = "de-DE";
		act(() => notifyNumberFormatChange());
		expect(document.getElementById(rangeId ?? "")?.textContent).toBe("0,1% – 5%");
	});

	it("names the slippage input and every settings toggle", () => {
		expect(testState.numberInputProps?.["aria-label"]).toBe("Slippage tolerance");
		expect(testState.numberInputProps?.mobileSafe).toBe(true);
		expect(testState.numberInputProps?.maxAllowedDecimals).toBe(2);
		const rangeId = getSlippageInput(container).getAttribute("aria-describedby");
		expect(document.getElementById(rangeId ?? "")?.textContent).toBe("0.1% – 5%");
		expect(testState.numberInputProps?.className).toContain("max-[1000px]:h-8");
		expect(testState.toggleProps.map((props) => props["aria-label"])).toEqual([
			"Order confirmation",
			"Order book animations",
		]);

		testState.isMobile = true;
		testState.toggleProps = [];
		act(() => root.unmount());
		root = createRoot(container);
		renderModal();

		expect(testState.toggleProps.map((props) => props["aria-label"])).toEqual([
			"Order confirmation",
			"Order book animations",
			"Order book in quote asset",
		]);
	});

	it("shows the build version under About and copies the full version on click", async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
		expect(container.textContent).toContain("About");
		expect(container.textContent).toContain("Version");
		const button = container.querySelector<HTMLButtonElement>('button[aria-label="Copy version"]');
		expect(button?.textContent).toBe(APP_RELEASE_LABEL);
		expect(container.textContent?.includes(`Release ${APP_RELEASE_ID}`)).toBe(APP_RELEASE_TAG !== APP_RELEASE_ID);
		await act(async () => {
			button?.click();
		});
		expect(writeText).toHaveBeenCalledWith(`${APP_VERSION} ${APP_RELEASE_ID} ${APP_BUILD_COMMIT}`);
	});

	it("hides the order book unit setting on the desktop layout", () => {
		expect(findOrderbookUnitToggle()).toBeUndefined();
		expect(container.textContent).not.toContain("Order book in quote asset");
	});

	it("shows the order book unit setting on the mobile layout and writes the global preference", () => {
		testState.isMobile = true;
		testState.toggleProps = [];
		renderModal();

		const toggle = findOrderbookUnitToggle();
		expect(toggle?.checked).toBe(false);

		act(() => (toggle?.onCheckedChange as ((next: boolean) => void) | undefined)?.(true));

		expect(testState.setShowOrderbookInQuote).toHaveBeenCalledTimes(1);
		expect(testState.setShowOrderbookInQuote).toHaveBeenCalledWith(true);
		expect(testState.setSkipOrderConfirmation).not.toHaveBeenCalled();
	});

	it.each([false, true])("changes the shared animation preference on the mobile=%s layout", (isMobile) => {
		testState.isMobile = isMobile;
		renderModal();
		const toggle = container.querySelector<HTMLButtonElement>('[aria-label="Order book animations"]');

		expect(toggle?.getAttribute("aria-checked")).toBe("true");
		act(() => toggle?.click());
		renderModal();

		expect(testState.setAnimateOrderbook).toHaveBeenCalledExactlyOnceWith(false);
		expect(toggle?.getAttribute("aria-checked")).toBe("false");
		expect(container.querySelector('[aria-label="Order book animations"]')).toBe(toggle);

		act(() => toggle?.click());
		renderModal();

		expect(testState.setAnimateOrderbook).toHaveBeenLastCalledWith(true);
		expect(toggle?.getAttribute("aria-checked")).toBe("true");
		expect(testState.setShowOrderbookInQuote).not.toHaveBeenCalled();
		expect(testState.setSkipOrderConfirmation).not.toHaveBeenCalled();
	});

	it.each([false, true])("hot-switches animation labels without resetting the mobile=%s modal", (isMobile) => {
		testState.isMobile = isMobile;
		renderModal();
		const toggle = container.querySelector<HTMLButtonElement>('[aria-label="Order book animations"]');
		const input = container.querySelector("input");
		act(() => toggle?.click());
		changeInput(getSlippageInput(container), "1.2");
		expect(input?.value).toBe("1.2");

		const messageId = createHash("sha256").update("Order book animations\x1f").digest("base64").slice(0, 6);
		act(() => i18n.loadAndActivate({ locale: "zh", messages: { [messageId]: "订单簿动画" } }));

		expect(container.textContent).toContain("订单簿动画");
		expect(container.querySelector('[aria-label="订单簿动画"]')).toBe(toggle);
		expect(toggle?.getAttribute("aria-checked")).toBe("false");
		expect(container.querySelector("input")).toBe(input);
		expect(input?.value).toBe("1.2");

		act(() => i18n.loadAndActivate({ locale: "en", messages: {} }));

		expect(container.querySelector('[aria-label="Order book animations"]')).toBe(toggle);
		expect(toggle?.getAttribute("aria-checked")).toBe("false");
		expect(container.querySelector("input")).toBe(input);
		expect(input?.value).toBe("1.2");
		expect(testState.setAnimateOrderbook).toHaveBeenCalledExactlyOnceWith(false);
		expect(testState.setMarketOrderSlippagePercent).not.toHaveBeenCalled();
	});

	it("ships the animation label in every locale catalog", () => {
		const translations = {
			en: "Order book animations",
			zh: "订单簿动画",
			hi: "ऑर्डर बुक एनिमेशन",
			es: "Animaciones del libro de órdenes",
			fr: "Animations du carnet d’ordres",
			ar: "رسوم دفتر الأوامر المتحركة",
		};
		for (const [locale, translation] of Object.entries(translations)) {
			const catalog = readFileSync(resolve(TEST_DIR, "../..", "locales", locale, "messages.po"), "utf8");
			expect(catalog).toContain(`msgid "Order book animations"\nmsgstr "${translation}"`);
		}
	});

	it("keeps the desktop order book unit source decoupled from the global setting", () => {
		const modalSource = readFileSync(
			resolve(TEST_DIR, "../..", "components/trade/components/global-settings-modal.tsx"),
			"utf8",
		);
		const orderbookPanelSource = readFileSync(
			resolve(TEST_DIR, "../..", "components/trade/orderbook/orderbook-panel.tsx"),
			"utf8",
		);

		expect(modalSource).not.toContain("use-order-entry-store");
		expect(orderbookPanelSource).toContain("useSizeMode");
		expect(orderbookPanelSource).not.toContain("use-global-settings-store");
	});
});

function getSlippageInput(container: HTMLElement): HTMLInputElement {
	const input = container.querySelector<HTMLInputElement>('input[aria-label="Slippage tolerance"]');
	if (!input) throw new Error("Expected the slippage input");
	return input;
}

function getButton(container: HTMLElement, text: string): HTMLButtonElement {
	const button = [...container.querySelectorAll("button")].find((element) => element.textContent === text);
	if (!button) throw new Error(`Expected the ${text} button`);
	return button;
}

function changeInput(input: HTMLInputElement, value: string) {
	const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
	act(() => {
		setter?.call(input, value);
		input.dispatchEvent(new Event("input", { bubbles: true }));
	});
}

function findOrderConfirmationToggle(): Record<string, unknown> | undefined {
	return testState.toggleProps.find((props) => props["aria-label"] === "Order confirmation");
}

function findOrderbookUnitToggle(): Record<string, unknown> | undefined {
	return testState.toggleProps.find((props) => props["aria-label"] === "Order book in quote asset");
}
