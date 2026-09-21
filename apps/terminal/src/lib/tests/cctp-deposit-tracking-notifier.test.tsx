// @vitest-environment jsdom

import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DefinitiveDepositSourceFailureError } from "@/lib/hyperliquid/deposit-source-error";
import { createI18nRoot } from "./harness/react";

const SOURCE_HASH = `0x${"a".repeat(64)}`;
const EXTERNAL_WALLET = "0x1111111111111111111111111111111111111111";
const EMBEDDED_WALLET = "0x2222222222222222222222222222222222222222";

const testState = vi.hoisted(() => ({
	depositModalOpen: false,
	trackingOptions: null as Record<string, unknown> | null,
	tracking: {
		data: undefined as { status: "waiting" | "forward-submitted" } | undefined,
		error: null as Error | null,
		isError: false,
		recoveryRecord: null as { sourceHash: string } | null,
		trackedSourceHash: undefined as string | undefined,
	},
	walletSession: {
		walletAddress: "0x1111111111111111111111111111111111111111" as string | undefined,
		embeddedWalletAddress: undefined as string | undefined,
		walletIntent: "external" as "external" | "embedded",
	},
}));
const toastMocks = vi.hoisted(() => ({ dismiss: vi.fn(), error: vi.fn(), loading: vi.fn(), success: vi.fn() }));

vi.mock("sonner", () => ({ toast: toastMocks }));
vi.mock("@/hooks/trade/use-cctp-deposit-tracking", () => ({
	useCctpDepositTracking: (options: Record<string, unknown>) => {
		testState.trackingOptions = options;
		return testState.tracking;
	},
}));
vi.mock("@/hooks/wallet/use-wallet-session", () => ({ useWalletSession: () => testState.walletSession }));
vi.mock("@/stores/use-global-modal-store", () => ({ useDepositModalOpen: () => testState.depositModalOpen }));
vi.mock("@/stores/use-global-settings-store", () => ({ useIsTestnet: () => false }));

import { CctpDepositTrackingNotifier } from "@/components/trade/tradebox/cctp-deposit-tracking-notifier";

describe("CctpDepositTrackingNotifier", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		testState.depositModalOpen = false;
		testState.trackingOptions = null;
		testState.tracking = {
			data: undefined,
			error: null,
			isError: false,
			recoveryRecord: null,
			trackedSourceHash: undefined,
		};
		testState.walletSession = {
			walletAddress: EXTERNAL_WALLET,
			embeddedWalletAddress: undefined,
			walletIntent: "external",
		};
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.clearAllMocks();
	});

	function render() {
		act(() => root.render(createElement(CctpDepositTrackingNotifier)));
	}

	function trackWaitingDeposit() {
		testState.tracking.recoveryRecord = { sourceHash: SOURCE_HASH };
		testState.tracking.trackedSourceHash = SOURCE_HASH;
		testState.tracking.data = { status: "waiting" };
	}

	it("stays silent while nothing is being tracked", () => {
		render();

		expect(toastMocks.loading).not.toHaveBeenCalled();
		expect(testState.trackingOptions).toMatchObject({ owner: EXTERNAL_WALLET, poll: true });
	});

	it("keeps one persistent notification for a deposit that is still forwarding", () => {
		trackWaitingDeposit();
		render();
		render();

		expect(toastMocks.loading).toHaveBeenCalledWith(
			"Forwarding deposit",
			expect.objectContaining({ id: `cctp-deposit:${SOURCE_HASH}`, duration: Number.POSITIVE_INFINITY }),
		);
		expect(testState.trackingOptions).toMatchObject({ poll: true, removeOnForwardSubmitted: true });
	});

	it("turns the same notification into the result once Circle forwards the deposit", () => {
		trackWaitingDeposit();
		render();
		testState.tracking.data = { status: "forward-submitted" };
		render();
		testState.tracking = { ...testState.tracking, data: undefined, recoveryRecord: null, trackedSourceHash: undefined };
		render();

		expect(toastMocks.success).toHaveBeenCalledExactlyOnceWith(
			"Forward transaction submitted",
			expect.objectContaining({ id: `cctp-deposit:${SOURCE_HASH}` }),
		);
		expect(toastMocks.dismiss).not.toHaveBeenCalled();
	});

	it("keeps a definitive source failure on screen until it is dismissed", () => {
		trackWaitingDeposit();
		render();
		testState.tracking.error = new DefinitiveDepositSourceFailureError("source-transaction-reverted", "Reverted");
		testState.tracking.isError = true;
		render();
		render();

		expect(toastMocks.error).toHaveBeenCalledExactlyOnceWith(
			"Deposit failed",
			expect.objectContaining({
				closeButton: true,
				duration: Number.POSITIVE_INFINITY,
				id: `cctp-deposit:${SOURCE_HASH}`,
			}),
		);
	});

	it("leaves the status to the deposit dialog while it is open and resumes after it closes", () => {
		trackWaitingDeposit();
		render();
		expect(toastMocks.loading).toHaveBeenCalledOnce();

		testState.depositModalOpen = true;
		render();
		expect(toastMocks.dismiss).toHaveBeenCalledExactlyOnceWith(`cctp-deposit:${SOURCE_HASH}`);
		expect(testState.trackingOptions).toMatchObject({ poll: false, removeOnForwardSubmitted: false });

		testState.depositModalOpen = false;
		render();
		expect(toastMocks.loading).toHaveBeenCalledTimes(2);
	});

	it("dismisses the progress notification when the tracked record disappears", () => {
		trackWaitingDeposit();
		render();
		testState.tracking = { ...testState.tracking, data: undefined, recoveryRecord: null, trackedSourceHash: undefined };
		render();

		expect(toastMocks.dismiss).toHaveBeenCalledExactlyOnceWith(`cctp-deposit:${SOURCE_HASH}`);
	});

	it("reads an embedded wallet's record without polling or removing it", () => {
		testState.walletSession = {
			walletAddress: EXTERNAL_WALLET,
			embeddedWalletAddress: EMBEDDED_WALLET,
			walletIntent: "embedded",
		};
		trackWaitingDeposit();
		render();

		expect(testState.trackingOptions).toMatchObject({
			owner: EMBEDDED_WALLET,
			poll: false,
			removeOnForwardSubmitted: false,
		});
		expect(toastMocks.loading).toHaveBeenCalledOnce();
	});
});
