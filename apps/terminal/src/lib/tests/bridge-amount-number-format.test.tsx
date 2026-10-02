// @vitest-environment jsdom

import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssetSelectionScreen } from "@/components/trade/tradebox/bridge/asset-selection-screen";
import { ConfirmationScreen } from "@/components/trade/tradebox/bridge/confirmation-screen";
import { SuccessScreen } from "@/components/trade/tradebox/bridge/success-screen";
import { formatSendAmount } from "@/lib/bridge/format";
import { getNumberFormatters } from "@/lib/format";
import type { BridgeToken } from "@/lib/lifi/use-balances";
import type { BridgeQuote } from "@/lib/lifi/use-quote";
import { notifyNumberFormatChange } from "@/lib/number-format-reactivity";
import { createI18nRoot } from "./harness/react";

const testState = vi.hoisted(() => ({
	formatLocale: "en-US",
	query: {} as Record<string, unknown>,
	balances: [] as unknown[],
}));

vi.mock("@/stores/use-global-settings-store", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/stores/use-global-settings-store")>()),
	getResolvedFormatLocale: () => testState.formatLocale,
}));

vi.mock("@/lib/lifi/use-balances", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/lifi/use-balances")>()),
	useBridgeBalances: () => ({ data: testState.balances, isLoading: false, isError: false, refetch: vi.fn() }),
}));

vi.mock("@/lib/lifi/use-quote", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/lifi/use-quote")>()),
	useBridgeQuote: () => testState.query,
}));

const ADDRESS = "0x1111111111111111111111111111111111111111";

const TOKEN: BridgeToken = {
	chainId: 42161,
	address: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
	symbol: "USDC",
	name: "USD Coin",
	decimals: 6,
	logoURI: undefined,
	priceUSD: "1",
	amount: "10000000",
	amountUSD: 10,
	chainName: "Arbitrum",
	chainLogoURI: undefined,
	isDust: false,
};

const QUOTE: BridgeQuote = {
	step: {} as BridgeQuote["step"],
	fromAmount: "1235000000",
	fromAmountUSD: "1235",
	toAmount: "1234567890",
	toAmountMin: "1230000000",
	toAmountUSD: "1234.56",
	executionDuration: 30,
	gasCosts: [],
	feeCosts: [],
	totalFeesUSD: "0.01",
};

describe("bridge send amount", () => {
	it.each([
		["1", "1.0000"],
		["1234.5678", "1,234.6"],
		["9.99996", "10.000"],
		["99.9996", "100.00"],
		["999.996", "1,000.0"],
		["9999.96", "10,000"],
		["99999.99", "100,000"],
		["123456.789", "123,457"],
		["-1234.5678", "-1,234.6"],
		["0.000123456789", "0.00012345"],
	])("keeps %s to five significant digits as %s", (amount, expected) => {
		expect(formatSendAmount(amount, getNumberFormatters())).toBe(expected);
	});
});

describe("bridge amounts", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		testState.formatLocale = "en-US";
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	function rowValue(labelText: string): string | null | undefined {
		const label = [...container.querySelectorAll("span, dt, div")].find(
			(element) => element.children.length === 0 && element.textContent === labelText,
		);
		return label?.parentElement?.lastElementChild?.textContent;
	}

	function receivedValue(): string | null | undefined {
		return rowValue("You receive");
	}

	it("writes the received amount on the success screen with the number-format separators", () => {
		act(() =>
			root.render(
				<SuccessScreen
					address={ADDRESS}
					receivedAmount="1234567890"
					txHash={null}
					startTime={null}
					endTime={null}
					processDetails={[]}
					onDone={vi.fn()}
					onNewDeposit={vi.fn()}
				/>,
			),
		);
		expect(receivedValue()).toBe("1,234.57 USDC");

		testState.formatLocale = "de-DE";
		act(() => notifyNumberFormatChange());
		expect(receivedValue()).toBe("1.234,57 USDC");

		testState.formatLocale = "fr-FR";
		act(() => notifyNumberFormatChange());
		expect(receivedValue()).toBe("1 234,57 USDC");
	});

	it("writes the quoted receive amount with the number-format separators", () => {
		testState.query = {
			data: QUOTE,
			isLoading: false,
			isError: false,
			error: null,
			dataUpdatedAt: Date.now(),
			refetch: vi.fn(),
		};
		act(() =>
			root.render(
				<ConfirmationScreen token={TOKEN} tokenAmount="1235" address={ADDRESS} onBack={vi.fn()} onConfirm={vi.fn()} />,
			),
		);
		expect(receivedValue()).toBe("1,234.57 USDC$1,234.56");

		testState.formatLocale = "de-DE";
		act(() => notifyNumberFormatChange());
		expect(receivedValue()).toBe("1.234,57 USDC$1.234,56");
	});

	it("writes the sent amount in plain notation with the number-format separators", () => {
		testState.query = {
			data: QUOTE,
			isLoading: false,
			isError: false,
			error: null,
			dataUpdatedAt: Date.now(),
			refetch: vi.fn(),
		};
		function renderSend(tokenAmount: string) {
			root.render(
				<ConfirmationScreen
					token={TOKEN}
					tokenAmount={tokenAmount}
					address={ADDRESS}
					onBack={vi.fn()}
					onConfirm={vi.fn()}
				/>,
			);
		}
		act(() => renderSend("1234.5678"));
		expect(rowValue("You send")).toBe("1,234.6 USDC");

		act(() => renderSend("123456.789"));
		expect(rowValue("You send")).toBe("123,457 USDC");

		testState.formatLocale = "de-DE";
		act(() => notifyNumberFormatChange());
		expect(rowValue("You send")).toBe("123.457 USDC");

		act(() => renderSend("0.000123456789"));
		expect(rowValue("You send")).toBe("0,00012345 USDC");
	});

	it("writes wallet balances, the dust threshold and the total time with the number-format separators", () => {
		testState.balances = [
			{ ...TOKEN, address: "0x01", amount: "1234567890", amountUSD: 1234.57 },
			{ ...TOKEN, address: "0x02", symbol: "DAI", decimals: 18, amount: "500000000000000", amountUSD: 0.0005 },
		];
		act(() => root.render(<AssetSelectionScreen address={ADDRESS} onSelect={vi.fn()} />));
		const balances = () =>
			[...container.querySelectorAll("button div.text-right > div:first-child")].map((node) => node.textContent);
		expect(balances()).toEqual(["1,234.57", "<0.001"]);

		testState.formatLocale = "de-DE";
		act(() => notifyNumberFormatChange());
		expect(balances()).toEqual(["1.234,57", "<0,001"]);

		act(() =>
			root.render(
				<SuccessScreen
					address={ADDRESS}
					receivedAmount="50"
					txHash={null}
					startTime={1_000}
					endTime={1_235_000}
					processDetails={[]}
					onDone={vi.fn()}
					onNewDeposit={vi.fn()}
				/>,
			),
		);
		expect(receivedValue()).toBe("<0,0001 USDC");
		expect(rowValue("Total time")).toBe("1.234 seconds");
	});
});
