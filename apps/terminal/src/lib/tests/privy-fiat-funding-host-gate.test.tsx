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

	async function settleHostImport() {
		await act(async () => {
			await import(HOST_MODULE).catch(() => undefined);
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
	}

	it("loads the onramp host only after a purchase is requested", async () => {
		const hostRenders = vi.fn(() => null);
		vi.doMock(HOST_MODULE, () => ({ PrivyFiatFundingHost: hostRenders }));
		const { PrivyFiatFundingHostGate, store } = await loadGate();
		await act(async () => root.render(createElement(PrivyFiatFundingHostGate)));
		expect(hostRenders).not.toHaveBeenCalled();

		await act(async () => {
			store.requestPrivyFiatFunding(createAttempt());
		});
		await settleHostImport();
		expect(hostRenders).toHaveBeenCalled();
		expect(toastMocks.error).not.toHaveBeenCalled();
	});

	it("loads the host ahead of the request once the purchase entry warms it", async () => {
		const hostRenders = vi.fn(() => null);
		vi.doMock(HOST_MODULE, () => ({ PrivyFiatFundingHost: hostRenders }));
		const { PrivyFiatFundingHostGate, store } = await loadGate();
		await act(async () => root.render(createElement(PrivyFiatFundingHostGate)));

		await act(async () => {
			store.warmPrivyFiatFundingHost();
		});
		await settleHostImport();

		expect(hostRenders).toHaveBeenCalled();
		expect(store.readPrivyFiatFundingAttempt()).toBeNull();
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
		await settleHostImport();
		expect(toastMocks.error).toHaveBeenCalledWith("Card purchase could not open. Check your connection and try again.");
		expect(store.isCurrentPrivyFiatFundingAttempt(attempt)).toBe(false);
		expect(JSON.stringify(toastMocks.error.mock.calls)).not.toContain("dynamically imported");
	});

	it("stays quiet when a warm-up cannot load the host and tries again for the next request", async () => {
		const hostRenders = vi.fn(() => null);
		let available = false;
		vi.doMock(HOST_MODULE, () => {
			if (!available) throw new Error("Failed to fetch dynamically imported module");
			return { PrivyFiatFundingHost: hostRenders };
		});
		const { PrivyFiatFundingHostGate, store } = await loadGate();
		await act(async () => root.render(createElement(PrivyFiatFundingHostGate)));

		await act(async () => {
			store.warmPrivyFiatFundingHost();
		});
		await settleHostImport();
		expect(toastMocks.error).not.toHaveBeenCalled();
		expect(hostRenders).not.toHaveBeenCalled();

		available = true;
		const attempt = createAttempt();
		await act(async () => {
			store.requestPrivyFiatFunding(attempt);
		});
		await settleHostImport();
		expect(hostRenders).toHaveBeenCalled();
		expect(store.isCurrentPrivyFiatFundingAttempt(attempt)).toBe(true);
		expect(toastMocks.error).not.toHaveBeenCalled();
	});

	it("reports a purchase that was requested while a failing warm-up was still loading", async () => {
		let failHostImport: (error: Error) => void = () => undefined;
		const hostImport = new Promise<never>((_resolve, reject) => {
			failHostImport = reject;
		});
		vi.doMock(HOST_MODULE, () => hostImport);
		const { PrivyFiatFundingHostGate, store } = await loadGate();
		await act(async () => root.render(createElement(PrivyFiatFundingHostGate)));
		const attempt = createAttempt();

		await act(async () => {
			store.warmPrivyFiatFundingHost();
		});
		await act(async () => {
			store.requestPrivyFiatFunding(attempt);
		});
		expect(toastMocks.error).not.toHaveBeenCalled();

		failHostImport(new Error("Failed to fetch dynamically imported module"));
		await settleHostImport();
		expect(toastMocks.error).toHaveBeenCalledExactlyOnceWith(
			"Card purchase could not open. Check your connection and try again.",
		);
		expect(store.isCurrentPrivyFiatFundingAttempt(attempt)).toBe(false);
	});
});
