// @vitest-environment jsdom

import { act, createElement, StrictMode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createI18nRoot } from "./harness/react";

const OWNER = "0xabcdefabcdefabcdefabcdefabcdefabcdef1234";
const OTHER = "0x2222222222222222222222222222222222222222";

const identity = vi.hoisted(() => {
	let clientKey = "";
	const listeners = new Set<() => void>();
	return {
		get: () => clientKey,
		set(next: string) {
			clientKey = next;
			for (const listener of listeners) listener();
		},
		subscribe(listener: () => void) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	};
});
const testState = vi.hoisted(() => ({ fund: vi.fn(), isTestnet: false }));
const toastMocks = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), warning: vi.fn() }));

vi.mock("sonner", () => ({ toast: toastMocks }));
vi.mock("@privy-io/react-auth", () => ({ useFiatOnramp: () => ({ fund: testState.fund }) }));
vi.mock("@/lib/hyperliquid", async () => {
	const { useSyncExternalStore } = await import("react");
	return { useHyperliquid: () => ({ clientKey: useSyncExternalStore(identity.subscribe, identity.get) }) };
});
vi.mock("@/stores/use-global-settings-store", () => ({ useIsTestnet: () => testState.isTestnet }));

import { PrivyFiatFundingHost } from "@/components/trade/tradebox/privy-fiat-funding-host";
import { getPrivyFiatFundingOwnerKey } from "@/domain/trade/privy-fiat-funding";
import {
	isCurrentPrivyFiatFundingAttempt,
	type PrivyFiatFundingAttempt,
	requestPrivyFiatFunding,
	resetPrivyFiatFundingStore,
} from "@/stores/use-privy-fiat-funding-store";

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((onResolve, onReject) => {
		resolve = onResolve;
		reject = onReject;
	});
	return { promise, resolve, reject };
}

function request(attempt: PrivyFiatFundingAttempt): boolean {
	let accepted = false;
	act(() => {
		accepted = requestPrivyFiatFunding(attempt);
	});
	return accepted;
}

function createAttempt(walletKind: "embedded" | "external" = "embedded"): PrivyFiatFundingAttempt {
	return {
		destination: { address: OWNER, walletKind },
		network: "mainnet",
		ownerKey: getPrivyFiatFundingOwnerKey("mainnet", OWNER),
	};
}

describe("PrivyFiatFundingHost", () => {
	let container: HTMLDivElement;
	let root: Root;
	let pending: ReturnType<typeof deferred<unknown>>;

	beforeEach(() => {
		identity.set(OWNER.toLowerCase());
		testState.isTestnet = false;
		pending = deferred<unknown>();
		testState.fund.mockReset();
		testState.fund.mockImplementation(() => pending.promise);
		resetPrivyFiatFundingStore();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		act(() => root.render(createElement(StrictMode, null, createElement(PrivyFiatFundingHost))));
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.clearAllMocks();
	});

	async function settle(outcome: { resolve?: unknown; reject?: unknown }) {
		await act(async () => {
			if ("reject" in outcome) pending.reject(outcome.reject);
			else pending.resolve(outcome.resolve);
			await pending.promise.catch(() => undefined);
		});
	}

	it("opens Privy's onramp once with the exact owner as the Arbitrum USDC destination", () => {
		request(createAttempt());

		expect(testState.fund).toHaveBeenCalledTimes(1);
		expect(testState.fund).toHaveBeenCalledWith({
			source: {},
			destination: { address: OWNER, chain: "eip155:42161", asset: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" },
			environment: "production",
		});
		expect(request(createAttempt())).toBe(false);
	});

	it("reports a confirmed purchase without claiming arrival and frees the next attempt", async () => {
		const attempt = createAttempt();
		request(attempt);
		await settle({ resolve: { status: "confirmed" } });

		expect(toastMocks.success).toHaveBeenCalledWith("Card purchase confirmed", {
			description: "USDC is on its way to your wallet on Arbitrum. Open Deposit once it arrives.",
			duration: 10_000,
		});
		expect(isCurrentPrivyFiatFundingAttempt(attempt)).toBe(false);
		testState.fund.mockImplementation(() => new Promise(() => {}));
		expect(request(createAttempt())).toBe(true);
	});

	it("reports a submitted purchase as uncertain and adds the gas note for an external wallet", async () => {
		request(createAttempt("external"));
		await settle({ resolve: { status: "submitted" } });

		expect(toastMocks.success).not.toHaveBeenCalled();
		expect(toastMocks.warning).toHaveBeenCalledTimes(1);
		const [title, options] = toastMocks.warning.mock.calls[0];
		expect(title).toBe("Card purchase submitted");
		expect(options.description).toContain("still processing");
		expect(options.description).toContain("ETH on Arbitrum");
		expect(options.icon).toBeDefined();
	});

	it("stays silent when the user leaves the flow", async () => {
		request(createAttempt());
		await settle({ reject: new Error("User exited flow") });

		expect(toastMocks.success).not.toHaveBeenCalled();
		expect(toastMocks.warning).not.toHaveBeenCalled();
		expect(toastMocks.error).not.toHaveBeenCalled();
		testState.fund.mockImplementation(() => new Promise(() => {}));
		expect(request(createAttempt())).toBe(true);
	});

	it("never shows the provider's raw error text", async () => {
		request(createAttempt());
		await settle({ reject: new Error("stripe: card_declined do_not_honor") });

		expect(toastMocks.error).toHaveBeenCalledTimes(1);
		expect(JSON.stringify(toastMocks.error.mock.calls[0])).not.toContain("card_declined");
	});

	it("drops the result of an attempt whose owner is no longer current", async () => {
		const attempt = createAttempt();
		request(attempt);
		act(() => identity.set(OTHER));
		await settle({ resolve: { status: "confirmed" } });

		expect(toastMocks.success).not.toHaveBeenCalled();
		expect(isCurrentPrivyFiatFundingAttempt(attempt)).toBe(false);
	});

	it("runs the sandbox on testnet", () => {
		request({ ...createAttempt(), network: "testnet" });

		expect(testState.fund.mock.calls[0][0].environment).toBe("sandbox");
	});
});
