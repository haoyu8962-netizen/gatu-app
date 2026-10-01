// @vitest-environment jsdom

import { useBuilderFeeApproval } from "@sairn/hl-react/signing/use-builder-fee-approval";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
});
