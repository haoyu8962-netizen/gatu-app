// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfirmationScreen } from "@/components/trade/tradebox/bridge/confirmation-screen";
import type { BridgeToken } from "@/lib/lifi/use-balances";
import type { BridgeQuote } from "@/lib/lifi/use-quote";

const testState = vi.hoisted(() => ({
	query: {} as Record<string, unknown>,
}));

vi.mock("@/lib/lifi/use-quote", async () => {
	const actual = await vi.importActual<typeof import("@/lib/lifi/use-quote")>("@/lib/lifi/use-quote");
	return {
		...actual,
		useBridgeQuote: () => testState.query,
	};
});

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

function createQuote(overrides: Partial<BridgeQuote> = {}): BridgeQuote {
	return {
		step: {} as BridgeQuote["step"],
		fromAmount: "1000000",
		fromAmountUSD: "1",
		toAmount: "997500",
		toAmountMin: "992512",
		toAmountUSD: "0.9965",
		executionDuration: 30,
		gasCosts: [],
		feeCosts: [],
		totalFeesUSD: "0.01",
		...overrides,
	};
}

function findButton(container: HTMLElement, label: string): HTMLButtonElement {
	const button = [...container.querySelectorAll("button")].find((candidate) => candidate.textContent?.includes(label));
	if (!button) throw new Error(`Missing button: ${label}`);
	return button;
}

describe("bridge quote confirmation", () => {
	let container: HTMLDivElement;
	let root: Root;
	const onConfirm = vi.fn();

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		onConfirm.mockReset();
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.clearAllMocks();
	});

	function render(query: Record<string, unknown>) {
		testState.query = query;
		act(() => {
			root.render(
				<I18nProvider i18n={i18n}>
					<ConfirmationScreen
						token={TOKEN}
						tokenAmount="1"
						address={TOKEN.address}
						onBack={vi.fn()}
						onConfirm={onConfirm}
					/>
				</I18nProvider>,
			);
		});
	}

	it("refreshes an expired quote without executing it", async () => {
		const quote = createQuote();
		const refreshedAt = Date.now();
		const refetch = vi.fn().mockResolvedValue({ isError: false, data: quote, dataUpdatedAt: refreshedAt });
		render({
			data: quote,
			isLoading: false,
			isError: false,
			error: null,
			dataUpdatedAt: refreshedAt - 31_000,
			refetch,
		});

		await act(async () => findButton(container, "Refresh quote").click());

		expect(refetch).toHaveBeenCalledOnce();
		expect(onConfirm).not.toHaveBeenCalled();
	});

	it("executes the exact freshly fetched quote when terms did not worsen", async () => {
		const quote = createQuote();
		const refreshedQuote = createQuote({ toAmount: "998000", toAmountMin: "993000" });
		const refreshedAt = Date.now();
		const refetch = vi.fn().mockResolvedValue({ isError: false, data: refreshedQuote, dataUpdatedAt: refreshedAt });
		render({
			data: quote,
			isLoading: false,
			isError: false,
			error: null,
			dataUpdatedAt: refreshedAt,
			refetch,
		});

		await act(async () => findButton(container, "Confirm").click());

		expect(onConfirm).toHaveBeenCalledWith(refreshedQuote);
	});

	it("requires another review when refreshed terms are worse", async () => {
		const quote = createQuote();
		const worseQuote = createQuote({ toAmountMin: "900000" });
		const refreshedAt = Date.now();
		const refetch = vi.fn().mockResolvedValue({ isError: false, data: worseQuote, dataUpdatedAt: refreshedAt + 1 });
		render({
			data: quote,
			isLoading: false,
			isError: false,
			error: null,
			dataUpdatedAt: refreshedAt,
			refetch,
		});

		await act(async () => findButton(container, "Confirm").click());

		expect(onConfirm).not.toHaveBeenCalled();
	});
});
