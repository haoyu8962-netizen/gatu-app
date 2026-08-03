// @vitest-environment jsdom

import { act, createElement, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IsolatedMarginPositionRef } from "@/components/trade/positions/position-dialog-types";
import { PositionIsolatedMarginModal } from "@/components/trade/positions/position-isolated-margin-modal";
import type { Position } from "@/lib/hyperliquid";
import { createI18nRoot } from "./harness/react";

const testState = vi.hoisted(() => ({
	market: {
		kind: "builderPerp",
		name: "xyz:CXMT",
		assetId: 120_031,
		dex: "xyz",
		marginMode: "noCross",
		onlyIsolated: true,
	} as {
		kind: "builderPerp" | "perp" | "spot";
		name: string;
		assetId: number;
		dex?: string;
		marginMode?: "strictIsolated" | "noCross";
		onlyIsolated?: true;
	} | null,
	marketLoading: false,
	marketError: null as Error | null,
	position: {
		dex: "xyz",
		coin: "xyz:CXMT",
		szi: "205.9",
		entryPx: "7.79995",
		positionValue: "1559.84",
		unrealizedPnl: "-46.18",
		returnOnEquity: "-0.3366",
		liquidationPx: "7.27304",
		marginUsed: "137.19",
		maxLeverage: 10,
		leverage: { type: "isolated", value: 10, rawUsd: "-18.794" },
		cumFunding: { allTime: "-22.59", sinceChange: "0", sinceOpen: "-22.59" },
	} as Position | null,
	positionLoading: false,
	positionError: false,
	positionStale: false,
	updateMargin: vi.fn(),
	topUpMargin: vi.fn(),
	beforeQueuedExecution: null as null | ((method: string) => Promise<void>),
	executionGuards: {} as Record<
		string,
		((params: { asset: number; isBuy?: boolean; ntli?: number; leverage?: string }) => void) | undefined
	>,
}));

vi.mock("@gatu/ui", async () => {
	const React = await import("react");
	const SegmentedContext = React.createContext<((value: string) => void) | null>(null);

	return {
		Button: ({
			children,
			iconLeft: _iconLeft,
			iconRight: _iconRight,
			intent: _intent,
			variant: _variant,
			...props
		}: {
			children: ReactNode;
			[key: string]: unknown;
		}) => createElement("button", { ...props, type: "button" }, children),
		Modal: ({ children, open }: { children: ReactNode; open: boolean }) => (open ? children : null),
		ModalContent: ({ children, ...props }: { children: ReactNode; [key: string]: unknown }) =>
			createElement("div", props, children),
		ModalDescription: ({ children }: { children: ReactNode }) => createElement("p", null, children),
		ModalFooter: ({ children }: { children: ReactNode }) => createElement("footer", null, children),
		ModalHeader: ({ children }: { children: ReactNode }) => createElement("header", null, children),
		ModalPopup: ({
			children,
			showClose: _showClose,
			size: _size,
			...props
		}: {
			children: ReactNode;
			[key: string]: unknown;
		}) => createElement("section", props, children),
		ModalTitle: ({ children }: { children: ReactNode }) => createElement("h2", null, children),
		SegmentedControls: ({ children, onValueChange }: { children: ReactNode; onValueChange: (value: string) => void }) =>
			createElement(SegmentedContext.Provider, { value: onValueChange }, children),
		SegmentedControlItem: ({
			children,
			disabled,
			value,
		}: {
			children: ReactNode;
			disabled?: boolean;
			value: string;
		}) => {
			const onValueChange = React.useContext(SegmentedContext);
			return createElement(
				"button",
				{
					type: "button",
					disabled,
					onClick: () => onValueChange?.(value),
				},
				children,
			);
		},
	};
});

vi.mock("@/components/ui/info-row", () => ({
	InfoRow: ({ label, value }: { label: ReactNode; value: ReactNode }) =>
		createElement("div", null, createElement("span", null, label), createElement("span", null, value)),
}));

vi.mock("@/components/ui/number-input", () => ({
	NumberInput: ({
		"aria-label": ariaLabel,
		onChange,
		value,
	}: {
		"aria-label": string;
		onChange: (event: { target: { value: string } }) => void;
		value: string;
	}) => createElement("input", { "aria-label": ariaLabel, onChange, value }),
}));

vi.mock("@/components/trade/components/trading-action-button", () => ({
	TradingActionButton: ({ children, ...props }: { children: ReactNode; [key: string]: unknown }) =>
		createElement("button", { ...props, type: "button" }, children),
}));

vi.mock("sonner", () => ({
	toast: {
		error: vi.fn(),
		success: vi.fn(),
	},
}));

vi.mock("@/lib/hyperliquid", () => ({
	useExchange: (
		method: string,
		options?: {
			executionGuard?: (params: { asset: number; isBuy?: boolean; ntli?: number; leverage?: string }) => void;
		},
	) => {
		testState.executionGuards[method] = options?.executionGuard;
		return {
			isPending: false,
			mutateAsync: async (params: { asset: number; isBuy?: boolean; ntli?: number; leverage?: string }) => {
				options?.executionGuard?.(params);
				await testState.beforeQueuedExecution?.(method);
				options?.executionGuard?.(params);
				const mutation = method === "updateIsolatedMargin" ? testState.updateMargin : testState.topUpMargin;
				return mutation(params);
			},
		};
	},
	useMarkets: () => ({
		error: testState.marketError,
		getMarket: (coin: string) => (testState.market?.name === coin ? testState.market : undefined),
		isLoading: testState.marketLoading,
	}),
	useUserPositions: () => ({
		getPosition: (coin: string, dex?: string) =>
			testState.position?.coin === coin && (dex === undefined || testState.position.dex === dex)
				? testState.position
				: null,
		hasError: testState.positionError,
		isLoading: testState.positionLoading,
		isStale: testState.positionStale,
	}),
}));

const basePositionRef: IsolatedMarginPositionRef = {
	coin: "xyz:CXMT",
	dex: "xyz",
	assetId: 120_031,
	isLong: true,
	szDecimals: 1,
	marginConstraint: "noCross",
	marginUsed: "137.19",
	positionValue: "1559.84",
	liquidationPx: "7.27304",
};

function getButton(container: HTMLElement, label: string): HTMLButtonElement {
	const button = [...container.querySelectorAll("button")].find((candidate) => candidate.textContent === label);
	if (!(button instanceof HTMLButtonElement)) throw new Error(`${label} button not found`);
	return button;
}

function getInput(container: HTMLElement, label: string): HTMLInputElement {
	const input = container.querySelector(`input[aria-label="${label}"]`);
	if (!(input instanceof HTMLInputElement)) throw new Error(`${label} input not found`);
	return input;
}

function setInputValue(input: HTMLInputElement, value: string) {
	const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
	if (!valueSetter) throw new Error("Native input value setter not found");
	valueSetter.call(input, value);
	input.dispatchEvent(new Event("input", { bubbles: true }));
}

function getLiveTestPosition(): Position {
	if (!testState.position) throw new Error("Live test position is not configured");
	return testState.position;
}

function getLiveTestMarket() {
	if (!testState.market) throw new Error("Live test market is not configured");
	return testState.market;
}

function createDeferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((resolvePromise) => {
		resolve = resolvePromise;
	});
	return { promise, resolve };
}

describe("PositionIsolatedMarginModal", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		testState.positionLoading = false;
		testState.positionError = false;
		testState.positionStale = false;
		testState.marketLoading = false;
		testState.marketError = null;
		testState.market = {
			kind: "builderPerp",
			name: "xyz:CXMT",
			assetId: 120_031,
			dex: "xyz",
			marginMode: "noCross",
			onlyIsolated: true,
		};
		testState.position = {
			dex: "xyz",
			coin: "xyz:CXMT",
			szi: "205.9",
			entryPx: "7.79995",
			positionValue: "1559.84",
			unrealizedPnl: "-46.18",
			returnOnEquity: "-0.3366",
			liquidationPx: "7.27304",
			marginUsed: "137.19",
			maxLeverage: 10,
			leverage: { type: "isolated", value: 10, rawUsd: "-18.794" },
			cumFunding: { allTime: "-22.59", sinceChange: "0", sinceOpen: "-22.59" },
		};
		testState.updateMargin.mockReset().mockResolvedValue({ status: "ok", response: { type: "default" } });
		testState.topUpMargin.mockReset().mockResolvedValue({ status: "ok", response: { type: "default" } });
		testState.beforeQueuedExecution = null;
		testState.executionGuards = {};
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.clearAllMocks();
	});

	function renderModal(position: IsolatedMarginPositionRef = basePositionRef, onOpenChange = vi.fn()) {
		act(() => {
			root.render(
				createElement(PositionIsolatedMarginModal, {
					open: true,
					onOpenChange,
					position,
				}),
			);
		});
		return onOpenChange;
	}

	it("submits an exact HIP-3 micro-USDC margin addition", async () => {
		const onOpenChange = renderModal();

		act(() => setInputValue(getInput(container, "Margin amount"), "12.345678"));
		await act(async () => {
			getButton(container, "Add Margin").click();
		});

		expect(testState.updateMargin).toHaveBeenCalledWith({
			asset: 120_031,
			isBuy: true,
			ntli: 12_345_678,
		});
		expect(testState.topUpMargin).not.toHaveBeenCalled();
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("blocks an action when the current live position side differs from the opened position", async () => {
		testState.position = {
			...getLiveTestPosition(),
			szi: "-205.9",
		};
		renderModal();

		act(() => setInputValue(getInput(container, "Margin amount"), "1"));
		await act(async () => {
			getButton(container, "Add Margin").click();
		});

		expect(getButton(container, "Add Margin").disabled).toBe(true);
		expect(container.textContent).toContain("This position changed sides.");
		expect(testState.updateMargin).not.toHaveBeenCalled();
	});

	it("uses the dedicated isolated-only target leverage action", async () => {
		renderModal();

		act(() => getButton(container, "Target Leverage").click());
		act(() => setInputValue(getInput(container, "Target leverage"), "5.0"));
		await act(async () => {
			getButton(container, "Add to Target").click();
		});

		expect(testState.topUpMargin).toHaveBeenCalledWith({
			asset: 120_031,
			leverage: "5",
		});
		expect(testState.updateMargin).not.toHaveBeenCalled();
	});

	it("submits an exact margin removal for a noCross market", async () => {
		const onOpenChange = renderModal();

		act(() => getButton(container, "Remove").click());
		act(() => setInputValue(getInput(container, "Margin amount"), "1.25"));
		await act(async () => {
			getButton(container, "Remove Margin").click();
		});

		expect(testState.updateMargin).toHaveBeenCalledWith({
			asset: 120_031,
			isBuy: true,
			ntli: -1_250_000,
		});
		expect(testState.topUpMargin).not.toHaveBeenCalled();
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it.each([
		["strict isolated", { marginMode: "strictIsolated" as const, onlyIsolated: true as const }],
		["legacy isolated-only", { marginMode: undefined, onlyIsolated: true as const }],
	])("disables removal for %s markets", (_label, constraint) => {
		testState.market = { ...getLiveTestMarket(), ...constraint };
		renderModal();

		expect(getButton(container, "Remove").disabled).toBe(true);
		expect(container.textContent).toContain(
			"This strict isolated market does not allow margin to be removed from an open position.",
		);
	});

	it("blocks submission when the live position is no longer isolated", () => {
		testState.position = {
			...getLiveTestPosition(),
			leverage: { type: "cross", value: 10 },
		};
		renderModal();

		act(() => setInputValue(getInput(container, "Margin amount"), "1"));

		expect(getButton(container, "Add Margin").disabled).toBe(true);
		expect(container.textContent).toContain("This position is no longer using isolated margin.");
	});

	it.each([
		["0", "This isolated position is no longer open."],
		["invalid", "Live position data is unavailable."],
	])("fails closed when the live position size is %s", (szi, expectedMessage) => {
		testState.position = {
			...getLiveTestPosition(),
			szi,
		};
		renderModal();

		act(() => setInputValue(getInput(container, "Margin amount"), "1"));

		expect(getButton(container, "Add Margin").disabled).toBe(true);
		expect(container.textContent).toContain(expectedMessage);
		expect(testState.updateMargin).not.toHaveBeenCalled();
	});

	it("fails closed while live position data is in an error state", () => {
		testState.positionError = true;
		renderModal();

		act(() => setInputValue(getInput(container, "Margin amount"), "1"));

		expect(getButton(container, "Add Margin").disabled).toBe(true);
		expect(container.textContent).toContain("Live position data is unavailable.");
		expect(testState.updateMargin).not.toHaveBeenCalled();
	});

	it("fails closed while a cached live position is refreshing", () => {
		testState.positionLoading = true;
		renderModal();

		act(() => setInputValue(getInput(container, "Margin amount"), "1"));

		expect(getButton(container, "Add Margin").disabled).toBe(true);
		expect(container.textContent).toContain("Loading position...");
		expect(testState.updateMargin).not.toHaveBeenCalled();
	});

	it("fails closed while the live position snapshot is stale", () => {
		testState.positionStale = true;
		renderModal();

		act(() => setInputValue(getInput(container, "Margin amount"), "1"));

		expect(getButton(container, "Add Margin").disabled).toBe(true);
		expect(container.textContent).toContain("Live position data is unavailable.");
		expect(testState.updateMargin).not.toHaveBeenCalled();
	});

	it("keeps removal blocked when a strict position snapshot conflicts with current noCross metadata", async () => {
		const onOpenChange = renderModal();

		act(() => getButton(container, "Remove").click());
		act(() => setInputValue(getInput(container, "Margin amount"), "1"));
		renderModal({ ...basePositionRef, marginConstraint: "strictIsolated" }, onOpenChange);

		expect(getButton(container, "Remove").disabled).toBe(true);
		expect(getButton(container, "Remove Margin").disabled).toBe(true);
		await act(async () => {
			getButton(container, "Remove Margin").click();
		});
		expect(testState.updateMargin).not.toHaveBeenCalled();
		expect(onOpenChange).not.toHaveBeenCalledWith(false);
	});

	it("fails closed when the current market identity no longer matches the position reference", () => {
		testState.market = { ...getLiveTestMarket(), assetId: 120_032 };
		renderModal();

		act(() => setInputValue(getInput(container, "Margin amount"), "1"));

		expect(getButton(container, "Add Margin").disabled).toBe(true);
		expect(container.textContent).toContain("The selected market changed.");
		expect(testState.updateMargin).not.toHaveBeenCalled();
	});

	it("rejects an execution request for a different asset", () => {
		renderModal();

		expect(() =>
			testState.executionGuards.updateIsolatedMargin?.({
				asset: 120_032,
				isBuy: true,
				ntli: 1_000_000,
			}),
		).toThrow("The selected market changed.");
	});

	it("uses the latest position state when the queued amount callback executes", async () => {
		const queueStarted = createDeferred();
		const releaseQueue = createDeferred();
		testState.beforeQueuedExecution = async () => {
			queueStarted.resolve();
			await releaseQueue.promise;
		};
		const onOpenChange = renderModal();

		act(() => setInputValue(getInput(container, "Margin amount"), "1"));
		act(() => getButton(container, "Add Margin").click());
		await queueStarted.promise;

		testState.position = { ...getLiveTestPosition(), szi: "-205.9" };
		renderModal({ ...basePositionRef }, onOpenChange);
		await act(async () => {
			releaseQueue.resolve();
			await releaseQueue.promise;
		});

		await vi.waitFor(() => expect(container.textContent).toContain("This position changed sides."));
		expect(testState.updateMargin).not.toHaveBeenCalled();
		expect(onOpenChange).not.toHaveBeenCalledWith(false);
	});

	it("uses the latest position state when the queued target callback executes", async () => {
		const queueStarted = createDeferred();
		const releaseQueue = createDeferred();
		testState.beforeQueuedExecution = async () => {
			queueStarted.resolve();
			await releaseQueue.promise;
		};
		const onOpenChange = renderModal();

		act(() => getButton(container, "Target Leverage").click());
		act(() => setInputValue(getInput(container, "Target leverage"), "5"));
		act(() => getButton(container, "Add to Target").click());
		await queueStarted.promise;

		testState.position = { ...getLiveTestPosition(), szi: "-205.9" };
		renderModal({ ...basePositionRef }, onOpenChange);
		await act(async () => {
			releaseQueue.resolve();
			await releaseQueue.promise;
		});

		await vi.waitFor(() => expect(container.textContent).toContain("This position changed sides."));
		expect(testState.topUpMargin).not.toHaveBeenCalled();
		expect(onOpenChange).not.toHaveBeenCalledWith(false);
	});

	it("fails closed if the position subscription errors before queued execution", async () => {
		const queueStarted = createDeferred();
		const releaseQueue = createDeferred();
		testState.beforeQueuedExecution = async () => {
			queueStarted.resolve();
			await releaseQueue.promise;
		};
		const onOpenChange = renderModal();

		act(() => setInputValue(getInput(container, "Margin amount"), "1"));
		act(() => getButton(container, "Add Margin").click());
		await queueStarted.promise;

		testState.positionError = true;
		renderModal({ ...basePositionRef }, onOpenChange);
		await act(async () => {
			releaseQueue.resolve();
			await releaseQueue.promise;
		});

		await vi.waitFor(() => expect(container.textContent).toContain("Live position data is unavailable."));
		expect(testState.updateMargin).not.toHaveBeenCalled();
		expect(onOpenChange).not.toHaveBeenCalledWith(false);
	});

	it("fails closed if the position snapshot becomes stale before queued execution", async () => {
		const queueStarted = createDeferred();
		const releaseQueue = createDeferred();
		testState.beforeQueuedExecution = async () => {
			queueStarted.resolve();
			await releaseQueue.promise;
		};
		const onOpenChange = renderModal();

		act(() => setInputValue(getInput(container, "Margin amount"), "1"));
		act(() => getButton(container, "Add Margin").click());
		await queueStarted.promise;

		testState.positionStale = true;
		renderModal({ ...basePositionRef }, onOpenChange);
		await act(async () => {
			releaseQueue.resolve();
			await releaseQueue.promise;
		});

		await vi.waitFor(() => expect(container.textContent).toContain("Live position data is unavailable."));
		expect(testState.updateMargin).not.toHaveBeenCalled();
		expect(onOpenChange).not.toHaveBeenCalledWith(false);
	});

	it.each([
		["strict isolated", { marginMode: "strictIsolated" as const, onlyIsolated: true as const }],
		["legacy isolated-only", { marginMode: undefined, onlyIsolated: true as const }],
	])("denies queued removal after the market becomes %s", async (_label, constraint) => {
		const queueStarted = createDeferred();
		const releaseQueue = createDeferred();
		testState.beforeQueuedExecution = async () => {
			queueStarted.resolve();
			await releaseQueue.promise;
		};
		const onOpenChange = renderModal();

		act(() => getButton(container, "Remove").click());
		act(() => setInputValue(getInput(container, "Margin amount"), "1"));
		act(() => getButton(container, "Remove Margin").click());
		await queueStarted.promise;

		testState.market = { ...getLiveTestMarket(), ...constraint };
		renderModal({ ...basePositionRef }, onOpenChange);
		await act(async () => {
			releaseQueue.resolve();
			await releaseQueue.promise;
		});

		await vi.waitFor(() =>
			expect(container.textContent).toContain(
				"This strict isolated market does not allow margin to be removed from an open position.",
			),
		);
		expect(testState.updateMargin).not.toHaveBeenCalled();
		expect(onOpenChange).not.toHaveBeenCalledWith(false);
	});
});
