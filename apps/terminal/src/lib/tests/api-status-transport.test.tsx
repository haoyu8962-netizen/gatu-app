// @vitest-environment jsdom

import { type ApiStatus, useApiStatus } from "@sairn/hl-react/hooks/useApiStatus";
import { createHyperliquidStore, type HyperliquidStore } from "@sairn/hl-react/store";
import {
	HyperliquidStoreContext,
	HyperliquidTransportContext,
	type HyperliquidTransportContextValue,
} from "@sairn/hl-react/transport-provider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("useApiStatus follows the shared transport, not only the subscription entries", () => {
	let store: HyperliquidStore;
	let container: HTMLDivElement;
	let root: Root;
	let latest: ApiStatus | undefined;

	beforeEach(() => {
		store = createHyperliquidStore({ ssr: false, triggerReconnect: vi.fn() });
		container = document.createElement("div");
		root = createRoot(container);
		latest = undefined;
	});

	afterEach(() => {
		act(() => root.unmount());
	});

	function Probe() {
		latest = useApiStatus().status;
		return null;
	}

	async function renderProbe() {
		const queryClient = new QueryClient();
		const transport = {
			info: { allMids: async () => ({}) },
			subscription: {},
			env: "Testnet",
			isTestnet: true,
		} as unknown as HyperliquidTransportContextValue;
		function Wrapper({ children }: { children: ReactNode }) {
			return createElement(
				QueryClientProvider,
				{ client: queryClient },
				createElement(
					HyperliquidStoreContext.Provider,
					{ value: store },
					createElement(HyperliquidTransportContext.Provider, { value: transport }, children),
				),
			);
		}
		await act(async () => {
			root.render(createElement(Wrapper, null, createElement(Probe)));
		});
		await vi.waitFor(async () => {
			await act(async () => {
				await Promise.resolve();
			});
			expect(latest).toBe("connected");
		});
	}

	it("shows connected only while the socket is open, connecting while it reconnects and offline without a network", async () => {
		store.setState({ wsStatus: "open", transportStatus: "open" });
		await renderProbe();

		act(() => store.setState({ transportStatus: "reconnecting" }));
		expect(latest).toBe("connecting");

		act(() => store.setState({ transportStatus: "offline" }));
		expect(latest).toBe("offline");

		act(() => store.setState({ transportStatus: "open" }));
		expect(latest).toBe("connected");
	});
});
