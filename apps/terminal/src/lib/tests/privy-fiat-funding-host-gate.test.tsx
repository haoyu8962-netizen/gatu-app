// @vitest-environment jsdom

import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createI18nRoot } from "./harness/react";

const OWNER = "0xabcdefabcdefabcdefabcdefabcdefabcdef1234" as const;
const HOST_MODULE = "@/components/trade/tradebox/privy-fiat-funding-host";
const toastMocks = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), warning: vi.fn() }));

vi.mock("sonner", () => ({ toast: toastMocks }));

async function loadGate() {
	const gate = await import("@/components/trade/tradebox/privy-fiat-funding-host-gate");
	const store = await import("@/stores/use-privy-fiat-funding-store");
	return { PrivyFiatFundingHostGate: gate.PrivyFiatFundingHostGate, store };
}

function createAttempt() {
	return {
		destination: { address: OWNER, walletKind: "embedded" as const },
		network: "mainnet" as const,
		ownerKey: `mainnet:${OWNER}`,
	};
}

describe("PrivyFiatFundingHostGate", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		vi.resetModules();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.doUnmock(HOST_MODULE);
		vi.clearAllMocks();
	});

	it("loads the onramp host only after a purchase is requested", async () => {
		const hostRenders = vi.fn(() => null);
		vi.doMock(HOST_MODULE, () => ({ PrivyFiatFundingHost: hostRenders }));
		const { PrivyFiatFundingHostGate, store } = await loadGate();
		await act(async () => root.render(createElement(PrivyFiatFundingHostGate)));
		expect(hostRenders).not.toHaveBeenCalled();

		await act(async () => {
			store.requestPrivyFiatFunding(createAttempt());
		});
		await act(async () => {
			await import(HOST_MODULE);
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
		expect(hostRenders).toHaveBeenCalled();
		expect(toastMocks.error).not.toHaveBeenCalled();
	});

	it("ends the attempt with a fixed message when the host cannot load", async () => {
		vi.doMock(HOST_MODULE, () => {
			throw new Error("Failed to fetch dynamically imported module");
		});
		const { PrivyFiatFundingHostGate, store } = await loadGate();
		await act(async () => root.render(createElement(PrivyFiatFundingHostGate)));
		const attempt = createAttempt();

		await act(async () => {
			store.requestPrivyFiatFunding(attempt);
		});
		await act(async () => {
			await import(HOST_MODULE).catch(() => undefined);
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
		expect(toastMocks.error).toHaveBeenCalledWith("Card purchase could not open. Check your connection and try again.");
		expect(store.isCurrentPrivyFiatFundingAttempt(attempt)).toBe(false);
		expect(JSON.stringify(toastMocks.error.mock.calls)).not.toContain("dynamically imported");
	});
});
