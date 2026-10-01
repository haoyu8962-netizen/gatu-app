// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { i18n, type Messages } from "@lingui/core";
import { ApiRequestError, HttpRequestError } from "@nktkas/hyperliquid";
import { act, createElement, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IsolatedMarginPositionTarget } from "@/components/trade/positions/position-dialog-types";
import { PositionIsolatedMarginModal } from "@/components/trade/positions/position-isolated-margin-modal";
import { formatActionFailure } from "@/lib/errors/action-error";
import type { Position } from "@/lib/hyperliquid";
import { getOrderAssetLockName } from "@/lib/trade/order-asset-lock";
import { formatPositionSubmitFeedback } from "@/lib/trade/position-submit-feedback";
import * as queueStore from "@/stores/use-order-queue-store";
import { createI18nRoot } from "./harness/react";

const addQueueItemSpy = vi.spyOn(queueStore, "addOrderQueueItem");

function lastQueueItem() {
	return queueStore.getOrderQueueItem(addQueueItemSpy.mock.results.at(-1)?.value);
}

function lastQueueMessage(): string {
	const error = lastQueueItem()?.error;
	if (!error) return "";
	if (typeof error === "string") return error;
	if (!("kind" in error)) return i18n._(error);
	if (error.kind === "exchange-error" || error.kind === "action-error") {
		return formatActionFailure(error, (descriptor) => i18n._(descriptor)) ?? "";
	}
	if (error.kind === "order-reconciliation" || error.kind === "spot-swap") throw new Error("Unexpected feedback kind");
	return formatPositionSubmitFeedback(error, (descriptor) => i18n._(descriptor));
}

const AMBIGUOUS_MESSAGE = "The margin update may have been applied. Refresh position data before trying again.";
const AMBIGUOUS_MESSAGE_AR = "ربما تم تطبيق تحديث الهامش. حدّث بيانات المركز قبل إعادة المحاولة.";
const UPDATE_FAILED_MESSAGE = "Failed to update isolated margin";
const UPDATE_FAILED_MESSAGE_AR = "تعذر تحديث الهامش المعزول";

function getMessageId(message: string): string {
	return createHash("sha256").update(`${message}\x1f`).digest("base64").slice(0, 6);
}

const arabicMessages: Messages = {
	[getMessageId(AMBIGUOUS_MESSAGE)]: AMBIGUOUS_MESSAGE_AR,
	[getMessageId(UPDATE_FAILED_MESSAGE)]: UPDATE_FAILED_MESSAGE_AR,
};

const testState = vi.hoisted(() => ({
	clientKey: "0x1111111111111111111111111111111111111111",
	walletAddress: "0x1111111111111111111111111111111111111111",
	env: "Mainnet" as "Mainnet" | "Testnet",
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
	positionReceivedAt: Date.now(),
	isMobile: false,
	pendingMethods: new Set<string>(),
	updateMargin: vi.fn(),
	topUpMargin: vi.fn(),
	beforeQueuedExecution: null as null | ((method: string) => Promise<void>),
	executionGuards: {} as Record<
		string,
		((params: { asset: number; isBuy?: boolean; ntli?: number; leverage?: string }) => void) | undefined
	>,
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({ address: testState.walletAddress, isConnected: true }),
}));

vi.mock("@sairn/ui", async () => {
	const React = await import("react");
	const SegmentedContext = React.createContext<((value: string) => void) | null>(null);

	return {
		AdaptiveModal: ({
			children,
			dismissible,
			onOpenChange,
			open,
			presentation,
			showHandle,
		}: {
			children: ReactNode;
			dismissible: boolean;
			onOpenChange: (open: boolean) => void;
			open: boolean;
			presentation: string;
			showHandle: boolean;
		}) =>
			open
				? createElement(
						"section",
						{
							"data-testid": "position-risk-dialog",
							"data-presentation": presentation,
							"data-dismissible": String(dismissible),
							"data-show-handle": String(showHandle),
						},
						createElement("button", {
							"aria-label": "Request adaptive dismiss",
							type: "button",
							onClick: () => onOpenChange(false),
						}),
						children,
					)
				: null,
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
		ModalContent: ({ children, ...props }: { children: ReactNode; [key: string]: unknown }) =>
			createElement("div", props, children),
		ModalDescription: ({ children }: { children: ReactNode }) => createElement("p", null, children),
		ModalFooter: ({ children }: { children: ReactNode }) => createElement("footer", null, children),
		ModalHeader: ({ children }: { children: ReactNode }) => createElement("header", null, children),
		ModalTitle: ({ children }: { children: ReactNode }) => createElement("h2", null, children),
		SegmentedControls: ({ children, onValueChange }: { children: ReactNode; onValueChange: (value: string) => void }) =>
			createElement(SegmentedContext.Provider, { value: onValueChange }, children),
		SegmentedControlItem: ({
			children,
			className,
			disabled,
			value,
		}: {
			children: ReactNode;
			className?: string;
			disabled?: boolean;
			value: string;
		}) => {
			const onValueChange = React.useContext(SegmentedContext);
			return createElement(
				"button",
				{
					type: "button",
					className,
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
		className,
		onChange,
		value,
	}: {
		"aria-label": string;
		className?: string;
		onChange: (event: { target: { value: string } }) => void;
		value: string;
	}) => createElement("input", { "aria-label": ariaLabel, className, onChange, value }),
}));

vi.mock("@/components/trade/components/trading-action-button", () => ({
	TradingActionButton: ({
		children,
		containerClassName: _containerClassName,
		requiresBuilderFee: _requiresBuilderFee,
		...props
	}: {
		children: ReactNode;
		containerClassName?: string;
		[key: string]: unknown;
	}) => createElement("button", { ...props, type: "button" }, children),
}));

vi.mock("@/hooks/use-mobile", () => ({
	useIsMobile: () => testState.isMobile,
}));

vi.mock("sonner", () => ({
	toast: {
		error: vi.fn(),
		info: vi.fn(),
		success: vi.fn(),
		warning: vi.fn(),
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
			isPending: testState.pendingMethods.has(method),
			mutateAsync: async (params: { asset: number; isBuy?: boolean; ntli?: number; leverage?: string }) => {
				options?.executionGuard?.(params);
				await testState.beforeQueuedExecution?.(method);
				options?.executionGuard?.(params);
				const mutation = method === "updateIsolatedMargin" ? testState.updateMargin : testState.topUpMargin;
				return mutation(params);
			},
		};
	},
	useHyperliquid: () => ({
		clientKey: testState.clientKey,
		env: testState.env,
	}),
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
		receivedAt: testState.positionReceivedAt,
	}),
}));

const basePositionRef: IsolatedMarginPositionTarget = {
	owner: "0x1111111111111111111111111111111111111111",
	env: "Mainnet",
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

function installExclusiveLockManager(): void {
	const queues = new Map<string, Promise<void>>();
	const busy = new Set<string>();
	const manager = {
		async request<T>(
			name: string,
			options: LockOptions,
			callback: (lock: Lock | null) => T | PromiseLike<T>,
		): Promise<T> {
			if (options.ifAvailable) {
				if (busy.has(name)) return callback(null);
				busy.add(name);
				try {
					return await callback({ name, mode: "exclusive" } as Lock);
				} finally {
					busy.delete(name);
				}
			}
			const previous = queues.get(name) ?? Promise.resolve();
			let release = () => {};
			const current = new Promise<void>((resolve) => {
				release = resolve;
			});
			queues.set(
				name,
				previous.then(() => current),
			);
			await previous;
			busy.add(name);
			try {
				return await callback({ name, mode: "exclusive" } as Lock);
			} finally {
				busy.delete(name);
				release();
			}
		},
	} as unknown as LockManager;
	Object.defineProperty(window.navigator, "locks", { configurable: true, value: manager });
}

describe("PositionIsolatedMarginModal", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		window.localStorage.clear();
		installExclusiveLockManager();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		testState.positionLoading = false;
		testState.positionError = false;
		testState.positionStale = false;
		testState.positionReceivedAt = Date.now();
		testState.clientKey = "0x1111111111111111111111111111111111111111";
		testState.walletAddress = "0x1111111111111111111111111111111111111111";
		testState.env = "Mainnet";
		testState.isMobile = false;
		testState.pendingMethods.clear();
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
		Object.defineProperty(window.navigator, "locks", { configurable: true, value: undefined });
		for (const result of addQueueItemSpy.mock.results) {
			if (result.type === "return") queueStore.removeOrderQueueItem(result.value);
		}
		vi.clearAllMocks();
	});

	function modalElement(
		position: IsolatedMarginPositionTarget = basePositionRef,
		onOpenChange: (open: boolean) => void = vi.fn(),
		sessionId = "margin-1",
	) {
		return createElement(PositionIsolatedMarginModal, {
			session: { sessionId, position },
			onSessionEnd: () => onOpenChange(false),
		});
	}

	function renderModal(
		position: IsolatedMarginPositionTarget = basePositionRef,
		onOpenChange = vi.fn(),
		sessionId = "margin-1",
	) {
		act(() => {
			root.render(modalElement(position, onOpenChange, sessionId));
		});
		return onOpenChange;
	}

	function expectDismissedWith(status: string, message: string) {
		expect(lastQueueItem()?.status).toBe(status);
		expect(lastQueueMessage()).toContain(message);
		expect(container.textContent).not.toContain(message);
		expect(container.querySelector('[data-testid="position-risk-dialog"]')).toBeNull();
	}

	it("uses the terminal breakpoint for a touch-safe mobile bottom sheet while retaining the desktop modal", () => {
		testState.isMobile = true;
		renderModal();

		let dialog = container.querySelector<HTMLElement>('[data-testid="position-risk-dialog"]');
		expect(dialog?.dataset.presentation).toBe("drawer");
		expect(dialog?.dataset.dismissible).toBe("true");
		expect(dialog?.dataset.showHandle).toBe("true");
		expect(getInput(container, "Margin amount").className).toContain("max-[1000px]:h-11");
		for (const label of ["USDC Amount", "Target Leverage", "Add", "Remove", "Cancel", "Add Margin"]) {
			expect(getButton(container, label).className).toContain("max-[1000px]:min-h-11");
		}

		testState.isMobile = false;
		act(() => {
			root.render(modalElement());
		});
		dialog = container.querySelector<HTMLElement>('[data-testid="position-risk-dialog"]');
		expect(dialog?.dataset.presentation).toBe("modal");
		expect(dialog?.dataset.showHandle).toBe("false");
	});

	it("blocks adaptive dismissal while an isolated-margin mutation is pending", () => {
		testState.isMobile = true;
		testState.pendingMethods.add("updateIsolatedMargin");
		const onOpenChange = renderModal();

		const dialog = container.querySelector<HTMLElement>('[data-testid="position-risk-dialog"]');
		expect(dialog?.dataset.dismissible).toBe("false");
		expect(dialog?.dataset.showHandle).toBe("false");
		act(() => container.querySelector<HTMLButtonElement>('[aria-label="Request adaptive dismiss"]')?.click());
		expect(onOpenChange).not.toHaveBeenCalled();
		expect(getButton(container, "Cancel").disabled).toBe(true);
	});

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

	it("keeps the scoped pending task and its result when the dialog controller unmounts after dispatch", async () => {
		const pending = createDeferred();
		testState.updateMargin.mockImplementationOnce(async () => {
			await pending.promise;
			return { status: "ok", response: { type: "default" } };
		});
		renderModal();
		act(() => setInputValue(getInput(container, "Margin amount"), "1"));
		act(() => getButton(container, "Add Margin").click());
		expect(lastQueueItem()).toMatchObject({
			status: "pending",
			owner: basePositionRef.owner,
			env: basePositionRef.env,
		});
		await vi.waitFor(() => expect(testState.updateMargin).toHaveBeenCalledOnce());
		const queueId = lastQueueItem()?.id;
		act(() => root.render(null));
		await act(async () => {
			pending.resolve();
			await pending.promise;
		});
		expect(queueStore.getOrderQueueItem(queueId)).toMatchObject({ status: "success", owner: basePositionRef.owner });
	});

	it("fails closed after a response-loss ambiguity and blocks an immediate retry", async () => {
		testState.updateMargin.mockRejectedValueOnce(new HttpRequestError({ detail: "Request timed out" }));
		renderModal();

		act(() => setInputValue(getInput(container, "Margin amount"), "1"));
		await act(async () => getButton(container, "Add Margin").click());

		expect(testState.updateMargin).toHaveBeenCalledTimes(1);
		expectDismissedWith("unconfirmed", "The margin update may have been applied.");

		renderModal(basePositionRef, vi.fn(), "margin-2");
		act(() => setInputValue(getInput(container, "Margin amount"), "1"));
		await act(async () => getButton(container, "Add Margin").click());

		expect(testState.updateMargin).toHaveBeenCalledTimes(1);
		expect(lastQueueMessage()).toEqual("Another action for this market is already in progress.");
	});

	it("reports an ambiguous result in the locale that is active when it settles", async () => {
		const pending = createDeferred();
		testState.updateMargin.mockImplementationOnce(async () => {
			await pending.promise;
			throw new HttpRequestError({ detail: "Request timed out" });
		});
		renderModal();

		act(() => setInputValue(getInput(container, "Margin amount"), "1"));
		act(() => getButton(container, "Add Margin").click());
		await vi.waitFor(() => expect(testState.updateMargin).toHaveBeenCalledOnce());
		act(() => i18n.loadAndActivate({ locale: "ar", messages: arabicMessages }));
		await act(async () => {
			pending.resolve();
			await pending.promise;
		});

		await vi.waitFor(() => expect(lastQueueMessage()).toEqual(AMBIGUOUS_MESSAGE_AR));
		expect(lastQueueMessage()).not.toEqual(AMBIGUOUS_MESSAGE);
		expect(testState.updateMargin).toHaveBeenCalledOnce();
	});

	it("reports an unrecognised SDK error with the localized fallback in any locale", async () => {
		const sdkMessage = "SDK rejected the isolated margin update";
		testState.updateMargin.mockRejectedValueOnce(new Error(sdkMessage));
		renderModal();
		act(() => i18n.loadAndActivate({ locale: "ar", messages: arabicMessages }));

		act(() => setInputValue(getInput(container, "Margin amount"), "1"));
		await act(async () => getButton(container, "Add Margin").click());

		expectDismissedWith("failed", UPDATE_FAILED_MESSAGE_AR);
		expect(lastQueueMessage()).not.toContain(sdkMessage);
		expect(testState.updateMargin).toHaveBeenCalledOnce();
	});

	it("reports an exchange rejection text unchanged when it is not a known text", async () => {
		const rejection = "Isolated margin cannot be removed right now.";
		testState.updateMargin.mockRejectedValueOnce(
			new ApiRequestError({ status: "err", response: rejection }, rejection),
		);
		renderModal();

		act(() => setInputValue(getInput(container, "Margin amount"), "1"));
		await act(async () => getButton(container, "Add Margin").click());

		expectDismissedWith("failed", rejection);
	});

	it("fails closed when the exchange returns a malformed success response", async () => {
		testState.updateMargin.mockResolvedValueOnce({ status: "ok", response: { type: "unexpected" } });
		renderModal();

		act(() => setInputValue(getInput(container, "Margin amount"), "1"));
		await act(async () => getButton(container, "Add Margin").click());

		expect(testState.updateMargin).toHaveBeenCalledTimes(1);
		expectDismissedWith("unconfirmed", "The margin update may have been applied.");
	});

	it("allows a retry after a definitive HTTP rejection that could not have been applied", async () => {
		testState.updateMargin
			.mockRejectedValueOnce(new HttpRequestError({ response: new Response("bad request", { status: 400 }) }))
			.mockResolvedValueOnce({ status: "ok", response: { type: "default" } });
		renderModal();

		act(() => setInputValue(getInput(container, "Margin amount"), "1"));
		await act(async () => getButton(container, "Add Margin").click());
		expect(testState.updateMargin).toHaveBeenCalledTimes(1);
		expect(lastQueueItem()?.status).not.toBe("unconfirmed");
		expect(lastQueueItem()?.status).toBe("failed");
		expect(container.querySelector('[data-testid="position-risk-dialog"]')).toBeNull();

		const onOpenChange = renderModal(basePositionRef, vi.fn(), "margin-2");
		act(() => setInputValue(getInput(container, "Margin amount"), "1"));
		await act(async () => getButton(container, "Add Margin").click());
		expect(testState.updateMargin).toHaveBeenCalledTimes(2);
		expect(lastQueueItem()?.status).toBe("success");
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("rejects a competing tab while the same account asset lock is held", async () => {
		renderModal();
		act(() => setInputValue(getInput(container, "Margin amount"), "1"));
		const lockName = getOrderAssetLockName(
			{ env: basePositionRef.env, owner: basePositionRef.owner },
			basePositionRef.assetId,
		);

		await window.navigator.locks.request(lockName, { mode: "exclusive" }, async () => {
			await act(async () => getButton(container, "Add Margin").click());
		});

		expect(testState.updateMargin).not.toHaveBeenCalled();
		expectDismissedWith("failed", "Another action for this market is already in progress.");
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

	it.each(["5", "999"])("rejects a target leverage of %s that would not add margin", (targetLeverage) => {
		testState.position = {
			...getLiveTestPosition(),
			positionValue: "10",
			marginUsed: "2",
		};
		renderModal();

		act(() => getButton(container, "Target Leverage").click());
		act(() => setInputValue(getInput(container, "Target leverage"), targetLeverage));

		expect(getButton(container, "Add to Target").disabled).toBe(true);
		expect(container.textContent).toContain(
			"Target leverage must be below the current effective leverage to add margin.",
		);
		expect(testState.topUpMargin).not.toHaveBeenCalled();
	});

	it("fails closed when the effective leverage cannot be derived from the live position", () => {
		testState.position = {
			...getLiveTestPosition(),
			marginUsed: "invalid",
		};
		renderModal();

		act(() => getButton(container, "Target Leverage").click());
		act(() => setInputValue(getInput(container, "Target leverage"), "5"));

		expect(getButton(container, "Add to Target").disabled).toBe(true);
		expect(container.textContent).not.toContain("Live position data is unavailable.");
		expect(testState.topUpMargin).not.toHaveBeenCalled();
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
		["invalid", null],
	])("fails closed when the live position size is %s", (szi, expectedMessage) => {
		testState.position = {
			...getLiveTestPosition(),
			szi,
		};
		renderModal();

		act(() => setInputValue(getInput(container, "Margin amount"), "1"));

		expect(getButton(container, "Add Margin").disabled).toBe(true);
		if (expectedMessage) expect(container.textContent).toContain(expectedMessage);
		else expect(container.textContent).not.toContain("Live position data is unavailable.");
		expect(testState.updateMargin).not.toHaveBeenCalled();
	});

	it("fails closed while live position data is in an error state", () => {
		testState.positionError = true;
		renderModal();

		act(() => setInputValue(getInput(container, "Margin amount"), "1"));

		expect(getButton(container, "Add Margin").disabled).toBe(true);
		expect(container.textContent).not.toContain("Live position data is unavailable.");
		expect(testState.updateMargin).not.toHaveBeenCalled();
	});

	it("fails closed while a cached live position is refreshing", () => {
		testState.positionLoading = true;
		renderModal();

		act(() => setInputValue(getInput(container, "Margin amount"), "1"));

		expect(getButton(container, "Add Margin").disabled).toBe(true);
		expect(container.textContent).not.toContain("Loading position...");
		expect(testState.updateMargin).not.toHaveBeenCalled();
	});

	it("fails closed while the live position snapshot is stale", () => {
		testState.positionStale = true;
		renderModal();

		act(() => setInputValue(getInput(container, "Margin amount"), "1"));

		expect(getButton(container, "Add Margin").disabled).toBe(true);
		expect(container.textContent).not.toContain("Live position data is unavailable.");
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

	it.each(["owner", "wallet", "environment"] as const)(
		"fails closed when the active %s changes while open",
		(identityPart) => {
			renderModal();
			const executionGuard = testState.executionGuards.updateIsolatedMargin;

			act(() => setInputValue(getInput(container, "Margin amount"), "1"));
			if (identityPart === "owner") {
				testState.clientKey = "0x2222222222222222222222222222222222222222";
			} else if (identityPart === "wallet") {
				testState.walletAddress = "0x2222222222222222222222222222222222222222";
			} else {
				testState.env = "Testnet";
			}
			act(() => {
				root.render(modalElement());
			});

			expect(getButton(container, "Add Margin").disabled).toBe(true);
			expect(container.textContent).toContain("Trading data changed while this dialog was open.");
			expect(() => executionGuard?.({ asset: 120_031, isBuy: true, ntli: 1_000_000 })).toThrow(
				"Trading data changed while this dialog was open.",
			);
			expect(testState.updateMargin).not.toHaveBeenCalled();
		},
	);

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

		await vi.waitFor(() => expect(lastQueueMessage()).toEqual(expect.stringContaining("This position changed sides.")));
		expect(testState.updateMargin).not.toHaveBeenCalled();
		expect(onOpenChange).toHaveBeenCalledWith(false);
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

		await vi.waitFor(() => expect(lastQueueMessage()).toEqual(expect.stringContaining("This position changed sides.")));
		expect(testState.topUpMargin).not.toHaveBeenCalled();
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("revalidates the effective leverage when the queued target callback executes", async () => {
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

		testState.position = {
			...getLiveTestPosition(),
			positionValue: "10",
			marginUsed: "2",
		};
		renderModal({ ...basePositionRef }, onOpenChange);
		await act(async () => {
			releaseQueue.resolve();
			await releaseQueue.promise;
		});

		await vi.waitFor(() =>
			expect(lastQueueMessage()).toEqual(
				expect.stringContaining("Target leverage must be below the current effective leverage to add margin."),
			),
		);
		expect(testState.topUpMargin).not.toHaveBeenCalled();
		expect(onOpenChange).toHaveBeenCalledWith(false);
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

		await vi.waitFor(() =>
			expect(lastQueueMessage()).toEqual(expect.stringContaining("Live position data is unavailable.")),
		);
		expect(testState.updateMargin).not.toHaveBeenCalled();
		expect(onOpenChange).toHaveBeenCalledWith(false);
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

		await vi.waitFor(() =>
			expect(lastQueueMessage()).toEqual(expect.stringContaining("Live position data is unavailable.")),
		);
		expect(testState.updateMargin).not.toHaveBeenCalled();
		expect(onOpenChange).toHaveBeenCalledWith(false);
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
			expect(lastQueueMessage()).toEqual(
				expect.stringContaining(
					"This strict isolated market does not allow margin to be removed from an open position.",
				),
			),
		);
		expect(testState.updateMargin).not.toHaveBeenCalled();
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});
});
