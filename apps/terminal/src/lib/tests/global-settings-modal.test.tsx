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
	popupProps: {} as Record<string, unknown>,
	marketOrderSlippagePercent: 0.5,
	formatLocale: "en-US",
	setMarketOrderSlippagePercent: vi.fn((value: number) => {
		testState.marketOrderSlippagePercent = value;
	}),
	animateOrderbook: true,
	setAnimateOrderbook: vi.fn((value: boolean) => {
		testState.animateOrderbook = value;
	}),
	skipOrderConfirmation: false,
	setSkipOrderConfirmation: vi.fn((value: boolean) => {
		testState.skipOrderConfirmation = value;
	}),
	transactionDelayProtection: true,
	setTransactionDelayProtection: vi.fn((value: boolean) => {
		testState.transactionDelayProtection = value;
	}),
	numberInputProps: null as Record<string, unknown> | null,
	toggleProps: [] as Record<string, unknown>[],
	toastSuccess: vi.fn(),
	toastError: vi.fn(),
}));

vi.mock("sonner", () => ({
	toast: { success: testState.toastSuccess, error: testState.toastError },
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
	ModalPopup: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) => {
		testState.popupProps = props;
		return createElement("div", null, children);
	},
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

vi.mock("@/config/app", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/config/app")>()),
	APP_BUILD_COMMIT: "74e69f77d0d154fdd48b128fc5face3a70b6bcc7",
	APP_RELEASE_ID: "cloudfront-2026-10-12-p31",
	APP_RELEASE_LABEL: "p31 · 74e69f77",
	APP_VERSION: "v0.1.0+74e69f77",
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
	useGlobalSettingsActions: () => ({
		setMarketOrderSlippagePercent: testState.setMarketOrderSlippagePercent,
		setNetwork: vi.fn(),
		setAnimateOrderbook: testState.setAnimateOrderbook,
		setSkipOrderConfirmation: testState.setSkipOrderConfirmation,
		setTransactionDelayProtection: testState.setTransactionDelayProtection,
	}),
	useMarketOrderSlippagePercent: () => testState.marketOrderSlippagePercent,
	useNetwork: () => "mainnet",
	useSkipOrderConfirmation: () => testState.skipOrderConfirmation,
	useTransactionDelayProtection: () => testState.transactionDelayProtection,
	useAnimateOrderbook: () => testState.animateOrderbook,
}));

import { GlobalSettingsModal } from "@/components/trade/components/global-settings-modal";
import { APP_BUILD_COMMIT, APP_RELEASE_ID, APP_RELEASE_LABEL, APP_VERSION } from "@/config/app";
import { DIAGNOSTICS_STORAGE_KEY } from "@/lib/diagnostics/diagnostics-buffer";
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
		testState.animateOrderbook = true;
		testState.setAnimateOrderbook.mockClear();
		testState.skipOrderConfirmation = false;
		testState.setSkipOrderConfirmation.mockClear();
		testState.transactionDelayProtection = true;
		testState.setTransactionDelayProtection.mockClear();
		testState.numberInputProps = null;
		testState.toggleProps = [];
		testState.toastSuccess.mockClear();
		testState.toastError.mockClear();
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

	it("keeps transaction delay protection on by default and stores the choice when it is turned off", () => {
		const toggle = testState.toggleProps.find((props) => props["aria-label"] === "Transaction delay protection");

		expect(toggle?.checked).toBe(true);
		expect(container.textContent).toContain(
			"Orders, cancels and other trading actions expire if the exchange has not accepted them within 15 seconds.",
		);

		act(() => (toggle?.onCheckedChange as ((next: boolean) => void) | undefined)?.(false));

		expect(testState.setTransactionDelayProtection).toHaveBeenCalledExactlyOnceWith(false);
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
			"Transaction delay protection",
			"Order book animations",
		]);

		testState.isMobile = true;
		testState.toggleProps = [];
		act(() => root.unmount());
		root = createRoot(container);
		renderModal();

		expect(testState.toggleProps.map((props) => props["aria-label"])).toEqual([
			"Order confirmation",
			"Transaction delay protection",
			"Order book animations",
		]);
	});

	it("shows the build version under About and copies the full version on click", async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
		expect(container.textContent).toContain("About");
		expect(container.textContent).toContain("Version");
		const button = container.querySelector<HTMLButtonElement>('button[aria-label="Copy version"]');
		expect(button?.textContent).toBe(APP_RELEASE_LABEL);
		expect(container.textContent).not.toContain(APP_RELEASE_ID);
		expect(container.textContent).not.toContain("Release ");
		await act(async () => {
			button?.click();
		});
		expect(writeText).toHaveBeenCalledWith(`${APP_VERSION} ${APP_RELEASE_ID} ${APP_BUILD_COMMIT}`);
	});

	it("copies the stored startup diagnostics with the build and browser state and reports the outcome", async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
		const boot = {
			id: "1794559766310",
			startedAt: 1794559766310,
			build: { commit: "74e69f77d0d1", release: "cloudfront-2026-10-12-p31" },
			navigation: null,
			resources: { total: 40, fetched: 12, fetchedBytes: 1_500_000 },
			milestones: { entry: 30, runtime: 400, locale: 450, fonts: 420, reveal: 460, route: 900 },
			hiddenAt: null,
			recoveries: [
				{
					at: 60_000,
					cause: "network-resume",
					action: "reconnect",
					streams: 4,
					visibility: "visible",
					network: "online",
					durationMs: 1800,
					result: "recovered",
				},
			],
		};
		localStorage.setItem(DIAGNOSTICS_STORAGE_KEY, JSON.stringify({ v: 1, boots: [boot] }));
		const button = container.querySelector<HTMLButtonElement>('button[aria-label="Copy diagnostics"]');
		expect(container.textContent).toContain("Diagnostics");

		await act(async () => {
			button?.click();
		});

		expect(writeText).toHaveBeenCalledOnce();
		const report = JSON.parse(String(writeText.mock.calls[0]?.[0]));
		expect(report).toMatchObject({
			kind: "startup-diagnostics",
			v: 1,
			build: { version: APP_VERSION, release: APP_RELEASE_ID, commit: APP_BUILD_COMMIT },
			userAgent: navigator.userAgent,
			standalone: false,
			visibility: "visible",
			boots: [boot],
		});
		expect(testState.toastSuccess).toHaveBeenCalledWith("Copied to clipboard");

		writeText.mockRejectedValueOnce(new Error("denied"));
		await act(async () => {
			button?.click();
		});
		expect(testState.toastError).toHaveBeenCalledWith("Failed to copy");
		localStorage.removeItem(DIAGNOSTICS_STORAGE_KEY);
	});

	it("copies an empty diagnostics list instead of failing when nothing was recorded or the record is corrupt", async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		localStorage.setItem(DIAGNOSTICS_STORAGE_KEY, "{broken");
		await act(async () => {
			container.querySelector<HTMLButtonElement>('button[aria-label="Copy diagnostics"]')?.click();
		});
		expect(JSON.parse(String(writeText.mock.calls[0]?.[0])).boots).toEqual([]);
		expect(localStorage.getItem(DIAGNOSTICS_STORAGE_KEY)).toBeNull();
		warn.mockRestore();
	});

	it("opens on the phone with focus on the dialog, not the slippage input, and without the desktop layout reset", () => {
		testState.isMobile = true;
		renderModal();
		const popupRef = testState.popupProps.ref as { current: unknown } | undefined;
		expect(testState.popupProps.initialFocus).toBe(popupRef);
		expect(container.textContent).not.toContain("Desktop layout");

		testState.isMobile = false;
		renderModal();
		expect(testState.popupProps.initialFocus).toBeUndefined();
		expect(container.textContent).toContain("Desktop layout");
	});

	it.each([false, true])(
		"offers no separate order book unit setting on the mobile=%s layout, as the book follows the order size unit",
		(isMobile) => {
			testState.isMobile = isMobile;
			testState.toggleProps = [];
			renderModal();

			expect(findOrderbookUnitToggle()).toBeUndefined();
			expect(container.textContent).not.toContain("Order book in quote asset");
		},
	);

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
			ja: "板のアニメーション",
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

	it("ships the transaction delay protection label in every locale catalog", () => {
		const translations = {
			en: "Transaction delay protection",
			zh: "交易延迟保护",
			ja: "取引遅延保護",
			hi: "लेनदेन विलंब सुरक्षा",
			es: "Protección contra retrasos de transacción",
			fr: "Protection contre les retards de transaction",
			ar: "الحماية من تأخر المعاملات",
		};
		for (const [locale, translation] of Object.entries(translations)) {
			const catalog = readFileSync(resolve(TEST_DIR, "../..", "locales", locale, "messages.po"), "utf8");
			expect(catalog).toContain(`msgid "Transaction delay protection"\nmsgstr "${translation}"`);
		}
	});

	it("ships the diagnostics labels in every locale catalog", () => {
		const translations = {
			en: ["Diagnostics", "Copy diagnostics"],
			zh: ["诊断信息", "复制诊断信息"],
			ja: ["診断情報", "診断情報をコピー"],
			hi: ["निदान जानकारी", "निदान जानकारी कॉपी करें"],
			es: ["Diagnóstico", "Copiar diagnóstico"],
			fr: ["Diagnostic", "Copier le diagnostic"],
			ar: ["معلومات التشخيص", "نسخ معلومات التشخيص"],
		};
		for (const [locale, [label, action]] of Object.entries(translations)) {
			const catalog = readFileSync(resolve(TEST_DIR, "../..", "locales", locale, "messages.po"), "utf8");
			expect(catalog).toContain(`msgid "Diagnostics"\nmsgstr "${label}"`);
			expect(catalog).toContain(`msgid "Copy diagnostics"\nmsgstr "${action}"`);
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
