// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, createElement, type ReactNode, useEffect, useLayoutEffect, useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DepositModalSurface } from "@/components/trade/components/deposit-modal-surface";

const testState = vi.hoisted(() => ({
	closeDepositModal: vi.fn(),
	isMobile: false,
	open: true,
	openListeners: new Set<() => void>(),
	tab: "deposit" as "bridge" | "deposit" | "withdraw",
}));

function setDepositModalOpen(open: boolean) {
	testState.open = open;
	for (const listener of testState.openListeners) listener();
}

const body = vi.hoisted(() => {
	const listeners = new Set<() => void>();
	let release: (() => void) | null = null;
	const state = {
		mounts: 0,
		unmounts: 0,
		pending: null as Promise<void> | null,
		surface: null as DepositModalSurface | null,
	};
	return {
		state,
		listeners,
		suspend() {
			state.pending = new Promise<void>((resolve) => {
				release = resolve;
			});
		},
		resolve() {
			state.pending = null;
			release?.();
			release = null;
		},
		report(surface: DepositModalSurface) {
			state.surface = surface;
			for (const listener of listeners) listener();
		},
		subscribe(listener: () => void) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	};
});

vi.mock("@/components/trade/components/lazy-global-modals", () => ({
	DepositModal: function DepositModalBody({
		onSurfaceChange,
	}: {
		onSurfaceChange: (surface: DepositModalSurface) => void;
	}) {
		if (body.state.pending) throw body.state.pending;
		const surface = useSyncExternalStore(body.subscribe, () => body.state.surface);
		useEffect(() => {
			body.state.mounts += 1;
			return () => {
				body.state.unmounts += 1;
			};
		}, []);
		useLayoutEffect(() => {
			if (surface) onSurfaceChange(surface);
		}, [onSurfaceChange, surface]);
		return null;
	},
}));

vi.mock("@/hooks/use-mobile", () => ({
	useIsMobile: () => testState.isMobile,
}));

vi.mock("@/stores/use-global-modal-store", () => ({
	useDepositModalActions: () => ({ close: testState.closeDepositModal }),
	useDepositModalOpen: () =>
		useSyncExternalStore(
			(listener) => {
				testState.openListeners.add(listener);
				return () => testState.openListeners.delete(listener);
			},
			() => testState.open,
		),
	useDepositModalTab: () => testState.tab,
}));

import { DepositModalHost } from "@/components/trade/components/deposit-modal-host";

function shellSurface(content: ReactNode, overrides: Partial<Extract<DepositModalSurface, { kind: "shell" }>> = {}) {
	return {
		kind: "shell" as const,
		tab: "deposit" as const,
		isPending: false,
		backButton: null,
		onOpenChange: vi.fn(),
		content,
		...overrides,
	};
}

function dialog() {
	return document.body.querySelector('[role="dialog"]');
}

function fallback() {
	return document.body.querySelector('[data-testid="deposit-modal-loading-fallback"]');
}

describe.each([
	{ surface: "desktop modal", isMobile: false, backdrop: ".bg-scrim" },
	{ surface: "phone sheet", isMobile: true, backdrop: ".bg-scrim-sheet" },
])("DepositModalHost on the $surface", ({ isMobile, backdrop }) => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		Object.defineProperty(window, "matchMedia", {
			configurable: true,
			value: vi.fn().mockReturnValue({
				addEventListener: vi.fn(),
				matches: false,
				removeEventListener: vi.fn(),
			}),
		});
		testState.isMobile = isMobile;
		testState.open = true;
		testState.tab = "deposit";
		testState.closeDepositModal.mockReset();
		body.state.mounts = 0;
		body.state.unmounts = 0;
		body.state.surface = null;
		body.state.pending = null;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	function render() {
		act(() => root.render(createElement(I18nProvider, { i18n }, createElement(DepositModalHost))));
	}

	it("keeps the one shell, its backdrop and its body while the lazy chunk loads and arrives", async () => {
		body.suspend();
		render();

		const loadingDialog = dialog();
		const loadingBackdrop = document.body.querySelector(backdrop);
		const loadingBody = document.body.querySelector('[data-slot="funds-modal-body"]');
		expect(loadingDialog).not.toBeNull();
		expect(loadingBackdrop).not.toBeNull();
		expect(fallback()?.closest('[data-slot="funds-modal-body"]')).toBe(loadingBody);
		expect(document.body.querySelector("h2")?.textContent).toBe("Deposit");
		expect(body.state.mounts).toBe(0);

		body.report(shellSurface(createElement("p", { "data-testid": "deposit-form" }, "Deposit USDC")));
		await act(async () => body.resolve());

		expect(dialog()).toBe(loadingDialog);
		expect(document.body.querySelector(backdrop)).toBe(loadingBackdrop);
		expect(document.body.querySelector('[data-slot="funds-modal-body"]')).toBe(loadingBody);
		expect(fallback()).toBeNull();
		expect(loadingBody?.querySelector('[data-testid="deposit-form"]')?.textContent).toBe("Deposit USDC");
		expect(document.body.querySelectorAll('[role="dialog"]')).toHaveLength(1);
		expect(body.state.mounts).toBe(1);
		expect(body.state.unmounts).toBe(0);
	});

	it("closes through the store while the body is still loading", () => {
		body.suspend();
		render();

		const closeButton = document.body.querySelector<HTMLButtonElement>('button[aria-label="Close"]');
		expect(closeButton).not.toBeNull();
		act(() => closeButton?.click());

		expect(testState.closeDepositModal).toHaveBeenCalledOnce();
		body.resolve();
	});

	it("hands the shell the body's tab, pending state, back button and close handler", () => {
		const onOpenChange = vi.fn();
		const onBack = vi.fn();
		body.state.surface = shellSurface(createElement("p", null, "Withdraw"), {
			tab: "withdraw",
			backButton: { disabled: false, onClick: onBack },
			onOpenChange,
		});
		render();

		expect(document.body.querySelector("h2")?.textContent).toBe("Withdraw");
		const backButton = document.body.querySelector<HTMLButtonElement>('button[aria-label="Back"]');
		expect(backButton?.parentElement?.querySelector("h2")).not.toBeNull();
		act(() => backButton?.click());
		expect(onBack).toHaveBeenCalledOnce();

		act(() => document.body.querySelector<HTMLButtonElement>('button[aria-label="Close"]')?.click());
		expect(onOpenChange).toHaveBeenCalledWith(false);
		expect(testState.closeDepositModal).not.toHaveBeenCalled();

		act(() => body.report(shellSurface(createElement("p", null, "Withdraw"), { tab: "withdraw", isPending: true })));
		expect(document.body.querySelector('button[aria-label="Close"]')).toBeNull();
		expect(document.body.querySelector('button[aria-label="Back"]')).toBeNull();
	});

	it("closes the shell when the store closes and stays closed while the body keeps reporting", async () => {
		body.suspend();
		render();
		expect(dialog()).not.toBeNull();

		act(() => setDepositModalOpen(false));
		expect(dialog()).toBeNull();

		body.report(shellSurface(createElement("p", { "data-testid": "deposit-form" }, "Deposit USDC")));
		await act(async () => body.resolve());
		expect(dialog()).toBeNull();
		expect(document.body.querySelector('[data-testid="deposit-form"]')).toBeNull();
		expect(body.state.mounts).toBe(1);

		act(() => body.report(shellSurface(createElement("p", null, "Deposit USDC"), { isPending: true })));
		expect(dialog()).toBeNull();

		act(() => setDepositModalOpen(true));
		expect(dialog()).not.toBeNull();
		expect(document.body.querySelector('button[aria-label="Close"]')).toBeNull();
	});

	it("swaps the shell for a status screen and back without remounting the body", () => {
		body.state.surface = shellSurface(createElement("p", null, "Deposit USDC"));
		render();
		const shellDialog = dialog();
		expect(shellDialog).not.toBeNull();

		act(() =>
			body.report({ kind: "status", screen: createElement("output", { "data-testid": "status-screen" }, "Confirm") }),
		);
		expect(document.body.querySelector('[data-slot="funds-modal-body"]')).toBeNull();
		expect(document.body.querySelector('[data-testid="status-screen"]')?.textContent).toBe("Confirm");

		act(() => body.report(shellSurface(createElement("p", null, "Deposit USDC"))));
		expect(dialog()).not.toBeNull();
		expect(document.body.querySelector('[data-testid="status-screen"]')).toBeNull();
		expect(body.state.mounts).toBe(1);
		expect(body.state.unmounts).toBe(0);
	});
});
