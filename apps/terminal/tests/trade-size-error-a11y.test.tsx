/** @vitest-environment jsdom */

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const desktopState = vi.hoisted(() => ({
	maxSize: 1,
	orderValue: 200,
	sizeInput: "2",
	sizeValue: 2,
}));

const orderActions = vi.hoisted(() => ({
	setLimitPrice: vi.fn(),
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
			markPriceStatus: "success",
			midPx: "100",
			name: "BTC",
			pairName: "BTC/USDC",
			szDecimals: 3,
		},
	}),
}));

vi.mock("@/hooks/trade/use-orderbook-mid-price", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/hooks/trade/use-orderbook-mid-price")>()),
	useOrderbookMidPrice: () => ({ midPx: null }),
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
	useOrderType: () => "market",
	useReduceOnly: () => false,
	useSizeMode: () => "base",
	useTif: () => "Gtc",
	useTpSlEnabled: () => false,
	useTriggerPrice: () => "",
}));

import { TradeFormFields } from "@/components/trade/tradebox/trade-form-fields";

describe("order-size error accessibility wiring", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		desktopState.maxSize = 1;
		desktopState.orderValue = 200;
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

		desktopState.maxSize = 3;
		desktopState.orderValue = 50;
		desktopState.sizeInput = "0.5";
		desktopState.sizeValue = 0.5;
		await renderDesktop(root);

		expect(findOptionalError(container, "Exceeds max size")).toBeNull();
		expectClearedDescription(getSlider(container));
		expectClearedDescription(getPercentInput(container));
	});
});

async function renderDesktop(root: Root) {
	await act(async () => {
		root.render(
			<I18nProvider i18n={i18n}>
				<TradeFormFields
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
						isAvailabilityBlocked: false,
						isSpotMarket: false,
						leverage: 10,
						leverageInteractionIdentity: "BTC:perp:50",
						maxSize: desktopState.maxSize,
						orderValue: desktopState.orderValue,
						quoteToken: "USDC",
						sizeModeLabel: "BTC",
						sizeValue: desktopState.sizeValue,
						szDecimals: 3,
					}}
					price={100}
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
