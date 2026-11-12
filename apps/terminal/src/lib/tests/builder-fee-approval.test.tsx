// @vitest-environment jsdom

import {
	ExchangeActionDeadlineError,
	startExchangeActionDeadline,
} from "@sairn/hl-react/internal/exchange/request-scheduler";
import { useBuilderFeeApproval } from "@sairn/hl-react/signing/use-builder-fee-approval";
import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const OWNER = "0x1111111111111111111111111111111111111111";
const BUILDER = "0x2222222222222222222222222222222222222222";

const testState = vi.hoisted(() => ({
	approveBuilderFee: vi.fn(),
	refetchBuilderFee: vi.fn(),
}));

vi.mock("@sairn/hl-react/provider", () => ({
	useHyperliquid: () => ({
		builderConfig: { b: BUILDER, f: 10 },
		clientKey: OWNER,
	}),
}));

vi.mock("@sairn/hl-react/hooks/useExchange", () => ({
	useExchange: () => ({ mutateAsync: testState.approveBuilderFee }),
}));

vi.mock("../../../../../packages/hl-react/src/signing/use-trading-status", () => ({
	useTradingStatus: () => ({ refetchBuilderFee: testState.refetchBuilderFee }),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let hookValue: ReturnType<typeof useBuilderFeeApproval> | null = null;

function Probe() {
	hookValue = useBuilderFeeApproval();
	return null;
}

function requirements(needsBuilderFee: boolean) {
	return {
		isSignerReady: false,
		isBuilderFeeReady: !needsBuilderFee,
		isReady: false,
		needsAgent: true,
		needsBuilderFee,
		signaturesRequired: needsBuilderFee ? 2 : 1,
	};
}

describe("useBuilderFeeApproval", () => {
	let container: HTMLDivElement;
	let root: Root;
	let queryClient: QueryClient;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		queryClient = new QueryClient({
			defaultOptions: {
				mutations: { retry: false },
				queries: { retry: false },
			},
		});
		hookValue = null;
		testState.approveBuilderFee.mockReset();
		testState.approveBuilderFee.mockResolvedValue(undefined);
		testState.refetchBuilderFee.mockReset();
	});

	afterEach(() => {
		onlineManager.setOnline(true);
		vi.useRealTimers();
		act(() => root.unmount());
		queryClient.clear();
		container.remove();
		vi.clearAllMocks();
	});

	function renderHook() {
		act(() => {
			root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(Probe)));
		});
		if (!hookValue) throw new Error("Missing builder fee approval hook value");
		return hookValue;
	}

	it("submits the configured fee and confirms it from the info endpoint", async () => {
		testState.refetchBuilderFee.mockResolvedValueOnce(requirements(true)).mockResolvedValueOnce(requirements(false));
		const hook = renderHook();

		await act(async () => {
			await hook.approve();
		});

		expect(testState.approveBuilderFee).toHaveBeenCalledWith({
			builder: BUILDER,
			maxFeeRate: "0.01%",
		});
		expect(testState.refetchBuilderFee).toHaveBeenCalledTimes(2);
	});

	it("does not request a wallet signature when the configured fee is already approved", async () => {
		testState.refetchBuilderFee.mockResolvedValue(requirements(false));
		const hook = renderHook();

		await act(async () => {
			await hook.approve();
		});

		expect(testState.approveBuilderFee).not.toHaveBeenCalled();
		expect(testState.refetchBuilderFee).toHaveBeenCalledOnce();
	});

	it("fails closed when the approval cannot be confirmed", async () => {
		testState.refetchBuilderFee.mockResolvedValue(requirements(true));
		const hook = renderHook();

		await act(async () => {
			await expect(hook.approve()).rejects.toThrow("Builder fee approval could not be confirmed");
		});

		expect(testState.approveBuilderFee).toHaveBeenCalledOnce();
		expect(testState.refetchBuilderFee).toHaveBeenCalledTimes(2);
	});

	it("does not sign when the builder fee status query paused offline answers 120 seconds after the click", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
		queryClient.setDefaultOptions({ mutations: { retry: false, networkMode: "always" }, queries: { retry: false } });
		testState.refetchBuilderFee.mockImplementation(() =>
			queryClient.fetchQuery({
				queryKey: ["builder-fee-status"],
				queryFn: async () => requirements(true),
				networkMode: "online",
				staleTime: 0,
			}),
		);
		const hook = renderHook();
		onlineManager.setOnline(false);

		let failure: unknown;
		await act(async () => {
			hook.approve().catch((error: unknown) => {
				failure = error;
			});
			await vi.advanceTimersByTimeAsync(120_000);
		});
		expect(failure).toBeUndefined();

		await act(async () => {
			onlineManager.setOnline(true);
			await vi.advanceTimersByTimeAsync(0);
		});
		expect(failure).toBeInstanceOf(ExchangeActionDeadlineError);
		expect(testState.approveBuilderFee).not.toHaveBeenCalled();
	});

	it("checks the deadline of the authorization that started it instead of starting its own", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
		testState.refetchBuilderFee.mockResolvedValue(requirements(true));
		const hook = renderHook();
		const deadline = startExchangeActionDeadline();
		await act(async () => {
			await vi.advanceTimersByTimeAsync(16_000);
		});

		await act(async () => {
			await expect(hook.approve(deadline)).rejects.toBeInstanceOf(ExchangeActionDeadlineError);
		});
		expect(testState.approveBuilderFee).not.toHaveBeenCalled();
	});

	it("still approves a fee whose status arrives within the limit", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
		testState.refetchBuilderFee
			.mockImplementationOnce(() => new Promise((resolve) => setTimeout(() => resolve(requirements(true)), 14_000)))
			.mockResolvedValueOnce(requirements(false));
		const hook = renderHook();

		let done: Promise<void> | undefined;
		await act(async () => {
			done = hook.approve();
			await vi.advanceTimersByTimeAsync(14_000);
		});
		await act(async () => {
			await done;
		});
		expect(testState.approveBuilderFee).toHaveBeenCalledOnce();
	});
});
