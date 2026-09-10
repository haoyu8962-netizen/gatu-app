// @vitest-environment jsdom

import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	useWalletInitializationRecovery,
	WALLET_INITIALIZATION_RECOVERY_DELAY_MS,
} from "@/hooks/wallet/use-wallet-initialization-recovery";

function Probe({ scope, renderVersion }: { scope: string | null; renderVersion: number }) {
	const available = useWalletInitializationRecovery(scope);
	return <output data-recovery-available={available}>{renderVersion}</output>;
}

describe("useWalletInitializationRecovery", () => {
	let container: HTMLDivElement;
	let root: Root | undefined;

	beforeEach(() => {
		Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
		vi.useFakeTimers();
		container = document.createElement("div");
		document.body.append(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root?.unmount());
		container.remove();
		vi.useRealTimers();
	});

	function render(scope: string | null, { strict = false, renderVersion = 0 } = {}) {
		const probe = <Probe scope={scope} renderVersion={renderVersion} />;
		act(() => root?.render(strict ? <StrictMode>{probe}</StrictMode> : probe));
	}

	function advanceTime(milliseconds: number) {
		act(() => vi.advanceTimersByTime(milliseconds));
	}

	function expectAvailable(available: boolean) {
		expect(container.querySelector("output")?.getAttribute("data-recovery-available")).toBe(String(available));
	}

	it("offers recovery only after 30 seconds of unresolved initialization", () => {
		render("authentication");
		expectAvailable(false);

		advanceTime(29_999);
		expectAvailable(false);
		advanceTime(1);
		expectAvailable(true);

		advanceTime(WALLET_INITIALIZATION_RECOVERY_DELAY_MS);
		expectAvailable(true);
	});

	it("does not schedule recovery when no initialization is pending", () => {
		render(null);
		expectAvailable(false);
		expect(vi.getTimerCount()).toBe(0);

		advanceTime(WALLET_INITIALIZATION_RECOVERY_DELAY_MS * 2);
		expectAvailable(false);
	});

	it("starts a fresh delay when authentication advances to a wallet identity", () => {
		render("authentication");
		advanceTime(20_000);
		render("wallets:owner-a");

		advanceTime(10_000);
		expectAvailable(false);
		advanceTime(19_999);
		expectAvailable(false);
		advanceTime(1);
		expectAvailable(true);
	});

	it("does not restore expired recovery when switching from owner A to B and back to A", () => {
		render("wallets:owner-a");
		advanceTime(WALLET_INITIALIZATION_RECOVERY_DELAY_MS);
		expectAvailable(true);

		render("wallets:owner-b");
		expectAvailable(false);
		advanceTime(20_000);
		render("wallets:owner-a");
		expectAvailable(false);

		advanceTime(10_000);
		expectAvailable(false);
		advanceTime(19_999);
		expectAvailable(false);
		advanceTime(1);
		expectAvailable(true);
	});

	it("immediately removes recovery when initialization finishes after the delay", () => {
		render("wallets:owner-a");
		advanceTime(WALLET_INITIALIZATION_RECOVERY_DELAY_MS);
		expectAvailable(true);

		render(null);
		expectAvailable(false);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("starts a fresh delay when the same owner becomes unresolved again after recovery", () => {
		render("wallets:owner-a");
		advanceTime(WALLET_INITIALIZATION_RECOVERY_DELAY_MS);
		expectAvailable(true);
		render(null);
		expectAvailable(false);

		render("wallets:owner-a");
		expectAvailable(false);
		advanceTime(29_999);
		expectAvailable(false);
		advanceTime(1);
		expectAvailable(true);
	});

	it("cancels pending recovery when initialization finishes before the delay", () => {
		render("authentication");
		advanceTime(29_999);
		render(null);
		expectAvailable(false);
		expect(vi.getTimerCount()).toBe(0);

		advanceTime(WALLET_INITIALIZATION_RECOVERY_DELAY_MS);
		expectAvailable(false);
	});

	it("preserves elapsed time and available recovery through unrelated rerenders", () => {
		render("wallets:owner-a");
		advanceTime(15_000);
		render("wallets:owner-a", { renderVersion: 1 });
		advanceTime(14_999);
		render("wallets:owner-a", { renderVersion: 2 });
		expectAvailable(false);
		advanceTime(1);
		expectAvailable(true);

		render("wallets:owner-a", { renderVersion: 3 });
		expectAvailable(true);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("clears its pending timer on unmount", () => {
		render("authentication");
		advanceTime(15_000);
		expect(vi.getTimerCount()).toBe(1);

		act(() => root?.unmount());
		root = undefined;
		expect(vi.getTimerCount()).toBe(0);
		advanceTime(WALLET_INITIALIZATION_RECOVERY_DELAY_MS);
		expect(container.childElementCount).toBe(0);
	});

	it("retains one working timer through StrictMode effect replay and clears it on recovery", () => {
		render("wallets:owner-a", { strict: true });
		expect(vi.getTimerCount()).toBe(1);
		advanceTime(15_000);
		render("wallets:owner-a", { strict: true, renderVersion: 1 });
		expect(vi.getTimerCount()).toBe(1);
		advanceTime(14_999);
		expectAvailable(false);
		advanceTime(1);
		expectAvailable(true);

		render("wallets:owner-b", { strict: true });
		expectAvailable(false);
		expect(vi.getTimerCount()).toBe(1);
		render(null, { strict: true });
		expectAvailable(false);
		expect(vi.getTimerCount()).toBe(0);
	});
});
