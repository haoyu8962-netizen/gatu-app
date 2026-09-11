/** @vitest-environment jsdom */

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const desktopState = vi.hoisted(() => ({
	accountReady: true,
	marketReady: true,
	maxSize: 1,
	orderType: "market",
	orderValue: 200,
	price: 100,
	sizeInput: "2",
	sizeValue: 2,
}));

const orderActions = vi.hoisted(() => ({
	setLimitPrice: vi.fn(),
	setLimitPriceFromPrefill: vi.fn(),
	setLimitPriceFromUser: vi.fn(),
	setReduceOnly: vi.fn(),
	setSize: vi.fn(),
	setTpSlEnabled: vi.fn(),
	setTriggerPrice: vi.fn(),
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({ isConnected: true }),
}));

vi.mock("@/lib/hyperliquid", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/hyperliquid")>()),
	useSelectedMarketInfo: () => ({
		data: {
			assetId: 0,
			kind: "perp",
			markPx: "100",
			markPriceStatus: desktopState.marketReady ? "success" : "stale",
			midPx: "100",
			name: "BTC",
			pairName: "BTC/USDC",
			szDecimals: 3,
		},
	}),
}));

vi.mock("@/lib/number-format-reactivity", () => ({
	useNumberFormatRevision: () => 0,
}));

vi.mock("@/stores/use-global-settings-store", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/stores/use-global-settings-store")>()),
	useMarketOrderSlippageBps: () => 50,
}));

vi.mock("@/stores/use-order-entry-store", () => ({
	useLimitPrice: () => "",
	useOrderEntryActions: () => orderActions,
	useOrderSide: () => "buy",
	useOrderSize: () => desktopState.sizeInput,
	useOrderType: () => desktopState.orderType,
	useReduceOnly: () => false,
	useSizeMode: () => "base",
	useTif: () => "Gtc",
	useTpSlEnabled: () => false,
	useTriggerPrice: () => "",
}));

import { TradeFormFields } from "@/components/trade/tradebox/trade-form-fields";
import { orderInputValidators } from "@/lib/errors/definitions/order-input";
import { runValidators } from "@/lib/errors/types";
import { getOrderValidationPresentation } from "@/lib/trade/order-validation-presentation";

describe("order-size error accessibility wiring", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		desktopState.accountReady = true;
		desktopState.marketReady = true;
		desktopState.maxSize = 1;
		desktopState.orderType = "market";
		desktopState.orderValue = 200;
		desktopState.price = 100;
		desktopState.sizeInput = "2";
		desktopState.sizeValue = 2;
		i18n.loadAndActivate({ locale: "en", messages: {} });
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(async () => {
		await act(async () => root.unmount());
		container.remove();
		vi.clearAllMocks();
	});

	it("links the desktop slider and percentage input to the rendered max-size error, then clears the state", async () => {
		await renderDesktop(root);

		const error = findError(container, "Exceeds max size");
		expect(error.id).not.toBe("");
		expect(error.getAttribute("role")).toBe("alert");
		const slider = getSlider(container);
		const percentInput = getPercentInput(container);
		expectInvalidDescription(slider, error.id);
		expectInvalidDescription(percentInput, error.id);
		expectInvalidDescription(getSizeInput(container), error.id);
		expectErrorFrame(getSizeInput(container), true);

		desktopState.maxSize = 3;
		desktopState.orderValue = 50;
		desktopState.sizeInput = "0.5";
		desktopState.sizeValue = 0.5;
		await renderDesktop(root);

		expect(findOptionalError(container, "Exceeds max size")).toBeNull();
		expectClearedDescription(getSlider(container));
		expectClearedDescription(getPercentInput(container));
		expectClearedDescription(getSizeInput(container));
		expectErrorFrame(getSizeInput(container), false);
	});

	it.each(["accountReady", "marketReady"] as const)(
		"clears size text, red frame and accessible errors while %s is unresolved, then restores real input errors",
		async (readiness) => {
			await renderDesktop(root);
			const sizeInput = getSizeInput(container);
			expectErrorFrame(sizeInput, true);

			desktopState[readiness] = false;
			await renderDesktop(root);
			expect(getSizeInput(container)).toBe(sizeInput);
			expect(sizeInput.value).toBe("2");
			expect(findOptionalError(container, "Exceeds max size")).toBeNull();
			expectErrorFrame(sizeInput, false);
			expectClearedDescription(sizeInput);
			expectClearedDescription(getSlider(container));
			expectClearedDescription(getPercentInput(container));

			desktopState[readiness] = true;
			await renderDesktop(root);
			const error = findError(container, "Exceeds max size");
			expectErrorFrame(sizeInput, true);
			expectInvalidDescription(sizeInput, error.id);
		},
	);

	it("uses the same filtered result for limit and trigger field error frames and accessible states", async () => {
		desktopState.orderType = "stopLimit";
		desktopState.maxSize = 3;
		desktopState.price = 0;
		await renderDesktop(root);
		const triggerInput = container.querySelector<HTMLInputElement>('input[aria-label="Trigger Price (USDC)"]');
		if (!triggerInput) throw new Error("Expected trigger price input");
		const priceInput = getLabeledInput(container, "Price");
		expectErrorFrame(triggerInput, true);
		expectErrorFrame(priceInput, true);
		expect(triggerInput.getAttribute("aria-invalid")).toBe("true");
		expect(priceInput.getAttribute("aria-invalid")).toBe("true");

		desktopState.accountReady = false;
		await renderDesktop(root);
		expectErrorFrame(triggerInput, false);
		expectErrorFrame(priceInput, false);
		expectClearedDescription(triggerInput);
		expectClearedDescription(priceInput);
		expect(triggerInput.disabled).toBe(true);
		expect(priceInput.disabled).toBe(true);
	});
});

async function renderDesktop(root: Root) {
	const errors = runValidators(orderInputValidators, {
		usesLimitPrice: desktopState.orderType === "stopLimit",
		usesTriggerPrice: desktopState.orderType === "stopLimit",
		price: desktopState.price,
		triggerPriceNum: null,
		sizeValue: desktopState.sizeValue,
		orderValue: desktopState.orderValue,
		maxSize: desktopState.maxSize,
	});
	const visibleValidationErrors = getOrderValidationPresentation(errors, {
		accountReady: desktopState.accountReady,
		marketReady: desktopState.marketReady,
		positionReady: true,
	});
	await act(async () => {
		root.render(
			<I18nProvider i18n={i18n}>
				<TradeFormFields
					visibleValidationErrors={visibleValidationErrors}
					orderEntryData={{
						availableBalance: 100,
						baseToken: "BTC",
						capabilities: {
							allowsCrossMargin: true,
							hasFunding: true,
							hasMarginMode: true,
							hasReduceOnly: false,
							hasTpSl: false,
							isCanonical: null,
							isLeveraged: true,
							isOnlyIsolated: false,
							maxLeverage: 50,
						},
						displayAvailableBalance: 100,
						displayAvailableBalanceToken: "USDC",
						isAvailabilityBlocked: !desktopState.accountReady,
						isSpotMarket: false,
						leverage: 10,
						leverageInteractionIdentity: "BTC:perp:50",
						maxSize: desktopState.maxSize,
						quoteToken: "USDC",
						sizeModeLabel: "BTC",
						sizeValue: desktopState.sizeValue,
						szDecimals: 3,
					}}
					price={desktopState.price}
					positionSize={0}
					swapTargetToken={null}
					onSizeModeToggle={vi.fn()}
					onSizePercentApply={vi.fn()}
					onSwapClick={vi.fn()}
				/>
			</I18nProvider>,
		);
	});
}

function findError(container: HTMLElement, message: string): HTMLParagraphElement {
	const error = findOptionalError(container, message);
	if (!error) throw new Error(`Expected error message: ${message}`);
	return error;
}

function findOptionalError(container: HTMLElement, message: string): HTMLParagraphElement | null {
	return (
		[...container.querySelectorAll<HTMLParagraphElement>("p")].find((candidate) => candidate.textContent === message) ??
		null
	);
}

function getSlider(container: HTMLElement): HTMLInputElement {
	const slider = container.querySelector<HTMLInputElement>('input[type="range"]');
	if (!slider) throw new Error("Expected size slider");
	return slider;
}

function getLabeledInput(container: HTMLElement, labelText: string): HTMLInputElement {
	const label = [...container.querySelectorAll("label")].find((candidate) => candidate.textContent === labelText);
	const input = label && container.querySelector<HTMLInputElement>(`input[id="${label.htmlFor}"]`);
	if (!input) throw new Error(`Expected ${labelText} input`);
	return input;
}

function getSizeInput(container: HTMLElement): HTMLInputElement {
	return getLabeledInput(container, "Size");
}

function expectErrorFrame(input: HTMLInputElement, hasError: boolean) {
	expect(input.parentElement?.classList.contains("border-trading-panel-error")).toBe(hasError);
}

function getPercentInput(container: HTMLElement): HTMLInputElement {
	const input = container.querySelector<HTMLInputElement>('input[aria-label="Size (%)"]:not([type="range"])');
	if (!input) throw new Error("Expected size percentage input");
	return input;
}

function expectInvalidDescription(control: HTMLInputElement, errorId: string) {
	const descriptionIds = (control.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
	expect(descriptionIds).toContain(errorId);
	expect(control.getAttribute("aria-invalid")).toBe("true");
}

function expectClearedDescription(control: HTMLInputElement) {
	expect(control.getAttribute("aria-describedby")).toBeNull();
	expect(control.getAttribute("aria-invalid")).toBeNull();
}
