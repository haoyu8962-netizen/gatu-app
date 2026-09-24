// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { act } from "react";
import type { Root } from "react-dom/client";
import { Toaster, toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CctpDepositTrackingNotifier } from "@/components/trade/tradebox/cctp-deposit-tracking-notifier";
import { DefinitiveDepositSourceFailureError } from "@/lib/hyperliquid/deposit-source-error";
import { createI18nRoot } from "./harness/react";

const OWNER = "0x1111111111111111111111111111111111111111";
const OTHER_OWNER = "0x2222222222222222222222222222222222222222";
const SOURCE_HASH = `0x${"a".repeat(64)}`;
const state = vi.hoisted(() => ({
	owner: "0x1111111111111111111111111111111111111111",
	isTestnet: false,
	depositModalOpen: false,
	phase: "waiting" as "waiting" | "forward-submitted" | "failed",
}));
vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({ walletAddress: state.owner, walletIntent: "external" }),
}));
vi.mock("@/stores/use-global-settings-store", () => ({ useIsTestnet: () => state.isTestnet }));
vi.mock("@/stores/use-global-modal-store", () => ({ useDepositModalOpen: () => state.depositModalOpen }));
vi.mock("@/hooks/trade/use-cctp-deposit-tracking", () => ({
	useCctpDepositTracking: () => ({
		recoveryRecord: state.owner === OWNER && !state.isTestnet ? { sourceHash: SOURCE_HASH } : null,
		trackedSourceHash: state.owner === OWNER && !state.isTestnet ? SOURCE_HASH : undefined,
		data: { status: state.phase === "forward-submitted" ? "forward-submitted" : "waiting" },
		error:
			state.phase === "failed"
				? new DefinitiveDepositSourceFailureError("source-transaction-reverted", "Reverted")
				: null,
		isError: state.phase === "failed",
	}),
}));

describe("CCTP notification presentation lifecycle with real Sonner", () => {
	let container: HTMLDivElement;
	let root: Root;
	beforeEach(() => {
		vi.useFakeTimers();
		state.owner = OWNER;
		state.isTestnet = false;
		state.depositModalOpen = false;
		state.phase = "waiting";
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});
	afterEach(async () => {
		act(() => root.unmount());
		toast.dismiss();
		await vi.runAllTimersAsync();
		container.remove();
		vi.useRealTimers();
	});
	async function renderNotifier() {
		act(() =>
			root.render(
				<>
					<Toaster />
					<CctpDepositTrackingNotifier />
				</>,
			),
		);
		await act(() => vi.advanceTimersByTimeAsync(0));
	}
	function visibleNotifications() {
		return container.querySelectorAll('[data-sonner-toast][data-removed="false"]');
	}
	it.each([
		["waiting", "Forwarding deposit"],
		["failed", "Deposit failed"],
		["forward-submitted", "Forward transaction submitted"],
	] as const)("keeps the %s notification after quickly leaving and returning to the owner", async (phase, message) => {
		state.phase = phase;
		await renderNotifier();
		await act(() => vi.advanceTimersByTimeAsync(50));
		expect(visibleNotifications()[0]?.textContent).toContain(message);
		state.owner = OTHER_OWNER;
		await renderNotifier();
		await act(() => vi.advanceTimersByTimeAsync(50));
		state.owner = OWNER;
		await renderNotifier();
		await act(() => vi.advanceTimersByTimeAsync(500));
		expect(visibleNotifications()).toHaveLength(1);
		expect(visibleNotifications()[0]?.textContent).toContain(message);
	});
	it("keeps forwarding progress after opening and closing the deposit dialog within the exit animation", async () => {
		await renderNotifier();
		await act(() => vi.advanceTimersByTimeAsync(50));
		state.depositModalOpen = true;
		await renderNotifier();
		await act(() => vi.advanceTimersByTimeAsync(50));
		state.depositModalOpen = false;
		await renderNotifier();
		await act(() => vi.advanceTimersByTimeAsync(500));
		expect(visibleNotifications()).toHaveLength(1);
		expect(visibleNotifications()[0]?.textContent).toContain("Forwarding deposit");
	});
	it("keeps one presentation while forwarding status and locale update in place", async () => {
		await renderNotifier();
		await act(() => vi.advanceTimersByTimeAsync(50));
		const notification = visibleNotifications()[0];
		state.phase = "forward-submitted";
		await renderNotifier();
		expect(visibleNotifications()).toHaveLength(1);
		expect(visibleNotifications()[0]).toBe(notification);
		expect(notification?.textContent).toContain("Forward transaction submitted");
		act(() =>
			i18n.loadAndActivate({ locale: "zh", messages: { [msg`Forward transaction submitted`.id]: "转发交易已提交" } }),
		);
		await act(() => vi.advanceTimersByTimeAsync(500));
		expect(visibleNotifications()).toHaveLength(1);
		expect(visibleNotifications()[0]).toBe(notification);
		expect(notification?.textContent).toContain("转发交易已提交");
	});
	it("keeps forwarding progress after quickly switching the network away and back", async () => {
		await renderNotifier();
		await act(() => vi.advanceTimersByTimeAsync(50));
		state.isTestnet = true;
		await renderNotifier();
		await act(() => vi.advanceTimersByTimeAsync(50));
		state.isTestnet = false;
		await renderNotifier();
		await act(() => vi.advanceTimersByTimeAsync(500));
		expect(visibleNotifications()).toHaveLength(1);
		expect(visibleNotifications()[0]?.textContent).toContain("Forwarding deposit");
	});
});
