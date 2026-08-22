// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useHistoryExportRunner } from "@/hooks/trade/use-history-csv-export";

const mocks = vi.hoisted(() => ({
	address: "0x1111111111111111111111111111111111111111" as `0x${string}`,
	isTestnet: false,
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({ address: mocks.address, isConnected: true }),
}));

vi.mock("@/stores/use-global-settings-store", () => ({
	useIsTestnet: () => mocks.isTestnet,
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let hookValue: ReturnType<typeof useHistoryExportRunner> | null = null;

function Probe() {
	hookValue = useHistoryExportRunner();
	return null;
}

describe("history export owner isolation", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		mocks.address = "0x1111111111111111111111111111111111111111";
		mocks.isTestnet = false;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		act(() => root.render(<Probe />));
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		hookValue = null;
	});

	it("aborts and discards an export when the owner changes", async () => {
		if (!hookValue) throw new Error("Missing history export runner");
		let resolveLoad: ((value: string) => void) | undefined;
		let requestSignal: AbortSignal | undefined;
		let resultPromise: Promise<string | null> | undefined;
		act(() => {
			resultPromise = hookValue?.run(async (_owner, signal) => {
				requestSignal = signal;
				return new Promise<string>((resolve) => {
					resolveLoad = resolve;
				});
			});
		});

		mocks.address = "0x2222222222222222222222222222222222222222";
		act(() => root.render(<Probe />));
		expect(requestSignal?.aborted).toBe(true);
		let result: string | null | undefined;
		await act(async () => {
			resolveLoad?.("stale data");
			result = await resultPromise;
		});
		expect(result).toBeNull();
	});

	it("aborts and discards an export when the network changes", async () => {
		if (!hookValue) throw new Error("Missing history export runner");
		let resolveLoad: ((value: string) => void) | undefined;
		let requestSignal: AbortSignal | undefined;
		let resultPromise: Promise<string | null> | undefined;
		act(() => {
			resultPromise = hookValue?.run(async (_owner, signal) => {
				requestSignal = signal;
				return new Promise<string>((resolve) => {
					resolveLoad = resolve;
				});
			});
		});

		mocks.isTestnet = true;
		act(() => root.render(<Probe />));
		expect(requestSignal?.aborted).toBe(true);
		let result: string | null | undefined;
		await act(async () => {
			resolveLoad?.("wrong network data");
			result = await resultPromise;
		});
		expect(result).toBeNull();
	});
});
