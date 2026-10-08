// @vitest-environment jsdom

import { useConnectionWalletClient } from "@sairn/hl-react";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const wagmiState = vi.hoisted(() => ({
	chainId: 42161 as number | undefined,
	requests: [] as unknown[],
}));

vi.mock("wagmi", () => ({
	useConnection: () => ({ chainId: wagmiState.chainId }),
	useWalletClient: (parameters?: { chainId?: number }) => {
		wagmiState.requests.push(parameters);
		return { data: { requestedChainId: parameters?.chainId }, error: null, isLoading: false };
	},
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("useConnectionWalletClient", () => {
	let container: HTMLDivElement;
	let root: Root;
	let captured: ReturnType<typeof useConnectionWalletClient> | null = null;

	function Probe() {
		captured = useConnectionWalletClient();
		return null;
	}

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		wagmiState.requests = [];
		captured = null;
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("asks wagmi for the client of the connection's own chain, configured or not", () => {
		wagmiState.chainId = 999_999;
		act(() => root.render(createElement(Probe)));

		expect(wagmiState.requests).toEqual([{ chainId: 999_999 }]);
		expect(captured?.data).toEqual({ requestedChainId: 999_999 });
	});

	it("falls back to wagmi's default client while no connection reports a chain", () => {
		wagmiState.chainId = undefined;
		act(() => root.render(createElement(Probe)));

		expect(wagmiState.requests).toEqual([undefined]);
	});
});
