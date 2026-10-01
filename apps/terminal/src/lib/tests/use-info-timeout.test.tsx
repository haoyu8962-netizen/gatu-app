// @vitest-environment jsdom

import type { InfoClient } from "@nktkas/hyperliquid";
import { useInfo } from "@sairn/hl-react";
import { HyperliquidContext, type HyperliquidContextValue } from "@sairn/hl-react/provider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const OWNER = "0x1111111111111111111111111111111111111111" as const;

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let requestTimeoutMs = 20;

function Probe() {
	useInfo("referral", { user: OWNER }, { requestTimeoutMs, retry: false });
	return null;
}

describe("useInfo request timeout", () => {
	let container: HTMLDivElement;
	let context: HyperliquidContextValue;
	let queryClient: QueryClient;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		root = createRoot(container);
		requestTimeoutMs = 20;
	});

	afterEach(() => {
		act(() => root.unmount());
		queryClient.clear();
		container.remove();
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	function renderProbe() {
		act(() =>
			root.render(
				<HyperliquidContext.Provider value={context}>
					<QueryClientProvider client={queryClient}>
						<Probe />
					</QueryClientProvider>
				</HyperliquidContext.Provider>,
			),
		);
	}

	it("aborts the SDK signal when the per-request deadline expires", async () => {
		vi.useFakeTimers();
		let requestSignal: AbortSignal | undefined;
		const info = {
			referral: vi.fn((_params: unknown, signal?: AbortSignal) => {
				requestSignal = signal;
				return new Promise((_, reject) => {
					if (!signal) return;
					const rejectAborted = () => reject(signal.reason);
					if (signal.aborted) rejectAborted();
					else signal.addEventListener("abort", rejectAborted, { once: true });
				});
			}),
		} as unknown as InfoClient;
		context = { env: "Mainnet", info } as HyperliquidContextValue;

		renderProbe();
		await act(async () => Promise.resolve());
		expect(requestSignal?.aborted).toBe(false);

		await act(async () => {
			vi.advanceTimersByTime(requestTimeoutMs);
			await Promise.resolve();
		});

		expect(requestSignal?.aborted).toBe(true);
		expect(requestSignal?.reason).toMatchObject({ name: "TimeoutError" });
	});

	it("clears the deadline timer after a request settles", async () => {
		vi.useFakeTimers();
		requestTimeoutMs = 1_234;
		const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
		const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
		const info = {
			referral: vi.fn().mockResolvedValue({}),
		} as unknown as InfoClient;
		context = { env: "Mainnet", info } as HyperliquidContextValue;

		renderProbe();
		await act(async () => {
			await Promise.resolve();
			await Promise.resolve();
		});

		const timeoutCallIndex = setTimeoutSpy.mock.calls.findIndex((call) => call[1] === requestTimeoutMs);
		expect(timeoutCallIndex).toBeGreaterThanOrEqual(0);
		const timeoutId = setTimeoutSpy.mock.results[timeoutCallIndex]?.value;
		expect(clearTimeoutSpy).toHaveBeenCalledWith(timeoutId);
	});

	it("forwards TanStack Query cancellation to the SDK request", async () => {
		let requestSignal: AbortSignal | undefined;
		const info = {
			referral: vi.fn((_params: unknown, signal?: AbortSignal) => {
				requestSignal = signal;
				return new Promise((_, reject) => {
					if (!signal) return;
					const rejectAborted = () => reject(signal.reason);
					if (signal.aborted) rejectAborted();
					else signal.addEventListener("abort", rejectAborted, { once: true });
				});
			}),
		} as unknown as InfoClient;
		context = { env: "Mainnet", info } as HyperliquidContextValue;

		renderProbe();
		await act(async () => Promise.resolve());
		expect(requestSignal?.aborted).toBe(false);

		await act(async () => queryClient.cancelQueries());

		expect(requestSignal?.aborted).toBe(true);
	});
});
