// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({
	ready: true,
	authenticated: false,
	login: vi.fn(),
}));

vi.mock("@privy-io/react-auth", () => ({
	usePrivy: () => ({
		ready: testState.ready,
		authenticated: testState.authenticated,
		login: testState.login,
	}),
}));

describe("WalletModal", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		testState.ready = true;
		testState.authenticated = false;
		testState.login.mockReset();
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.clearAllMocks();
	});

	it("opens the Privy login flow and closes itself when opened while logged out", async () => {
		const onOpenChange = vi.fn();
		const { WalletModal } = await import("@/components/trade/components/wallet-modal");

		act(() => {
			root.render(createElement(WalletModal, { open: true, onOpenChange }));
		});

		expect(testState.login).toHaveBeenCalledTimes(1);
		expect(onOpenChange).toHaveBeenCalledWith(false);
		expect(container.textContent).toBe("");
	});

	it("does not call login when already authenticated", async () => {
		testState.authenticated = true;
		const onOpenChange = vi.fn();
		const { WalletModal } = await import("@/components/trade/components/wallet-modal");

		act(() => {
			root.render(createElement(WalletModal, { open: true, onOpenChange }));
		});

		expect(testState.login).not.toHaveBeenCalled();
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("waits for Privy to be ready before triggering login", async () => {
		testState.ready = false;
		const onOpenChange = vi.fn();
		const { WalletModal } = await import("@/components/trade/components/wallet-modal");

		act(() => {
			root.render(createElement(WalletModal, { open: true, onOpenChange }));
		});

		expect(testState.login).not.toHaveBeenCalled();
		expect(onOpenChange).not.toHaveBeenCalled();
	});

	it("stays inert while closed", async () => {
		const onOpenChange = vi.fn();
		const { WalletModal } = await import("@/components/trade/components/wallet-modal");

		act(() => {
			root.render(createElement(WalletModal, { open: false, onOpenChange }));
		});

		expect(testState.login).not.toHaveBeenCalled();
		expect(onOpenChange).not.toHaveBeenCalled();
	});
});
