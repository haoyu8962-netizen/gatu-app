// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { I18nProvider } from "@lingui/react";
import { act, createElement, isValidElement, type ReactNode, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
const toastMocks = vi.hoisted(() => ({ dismiss: vi.fn(), error: vi.fn(), success: vi.fn(), warning: vi.fn() }));

vi.mock("sonner", () => ({ toast: toastMocks }));
vi.mock("@privy-io/react-auth", () => ({ useFiatOnramp: () => ({ fund: testState.fund }) }));
vi.mock("@/lib/hyperliquid", async () => {
	const { useSyncExternalStore } = await import("react");
	return { useHyperliquid: () => ({ clientKey: useSyncExternalStore(identity.subscribe, identity.get) }) };
});
vi.mock("@/stores/use-global-settings-store", () => ({ useIsTestnet: () => testState.isTestnet }));

import { PrivyFiatFundingHost } from "@/components/trade/tradebox/privy-fiat-funding-host";
import { getPrivyFiatFundingOwnerKey } from "@/domain/trade/privy-fiat-funding-owner-key";
import {
	isCurrentPrivyFiatFundingAttempt,
	type PrivyFiatFundingAttempt,
	requestPrivyFiatFunding,
	resetPrivyFiatFundingStore,
} from "@/stores/use-privy-fiat-funding-store";

function descriptionText(node: ReactNode): string {
	return isValidElement(node) ? renderToStaticMarkup(node).replace(/<[^>]+>/g, "|") : String(node ?? "");
}

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

function createAttempt(
	walletKind: "embedded" | "external" = "embedded",
	network: "mainnet" | "testnet" = "mainnet",
): PrivyFiatFundingAttempt {
	return {
		destination: { address: OWNER, walletKind },
		network,
		ownerKey: getPrivyFiatFundingOwnerKey(network, OWNER),
	};
}

interface PublishedNotice {
	id: string;
	onDismiss: () => void;
	onAutoClose: () => void;
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
		root = createRoot(container);
		mountHost();
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		act(() => i18n.loadAndActivate({ locale: "en", messages: {} }));
		vi.clearAllMocks();
	});

	function mountHost() {
		act(() =>
			root.render(
				createElement(StrictMode, null, createElement(I18nProvider, { i18n }, createElement(PrivyFiatFundingHost))),
			),
		);
	}

	function remountHost() {
		act(() => root.unmount());
		root = createRoot(container);
	}

	function published(mock: typeof toastMocks.warning, call = 0): PublishedNotice {
		return mock.mock.calls[call][1] as PublishedNotice;
	}

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
			source: { defaultAsset: "usd" },
			destination: { address: OWNER, chain: "eip155:42161", asset: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" },
			environment: "production",
			defaultAmount: "100",
		});
		expect(request(createAttempt())).toBe(false);
	});

	it("reports a confirmed purchase without claiming arrival and frees the next attempt", async () => {
		const attempt = createAttempt();
		request(attempt);
		await settle({ resolve: { status: "confirmed" } });

		expect(toastMocks.success).toHaveBeenCalledTimes(1);
		const [title, options] = toastMocks.success.mock.calls[0];
		expect(title).toBe("Card purchase confirmed");
		expect(options).toMatchObject({ duration: 10_000, closeButton: false });
		expect(descriptionText(options.description)).toContain(
			"USDC is on its way to your wallet on Arbitrum. Open Deposit once it arrives.",
		);
		expect(isCurrentPrivyFiatFundingAttempt(attempt)).toBe(false);
		testState.fund.mockImplementation(() => new Promise(() => {}));
		expect(request(createAttempt())).toBe(true);
	});

	it("keeps a submitted purchase on screen as uncertain, with the gas note on its own line for an external wallet", async () => {
		request(createAttempt("external"));
		await settle({ resolve: { status: "submitted" } });

		expect(toastMocks.success).not.toHaveBeenCalled();
		expect(toastMocks.warning).toHaveBeenCalledTimes(1);
		const [title, options] = toastMocks.warning.mock.calls[0];
		expect(title).toBe("Card purchase submitted");
		expect(options).toMatchObject({ duration: Number.POSITIVE_INFINITY, closeButton: true });
		expect(options.icon).toBeDefined();
		const text = descriptionText(options.description);
		expect(text).toContain("still processing");
		expect(text).toContain("|Depositing it needs a little ETH on Arbitrum for network fees.|");
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

	it("reports an unrecognized rejection as an unknown status without the provider's raw text", async () => {
		request(createAttempt());
		await settle({ reject: new Error("stripe: card_declined do_not_honor") });

		expect(toastMocks.error).not.toHaveBeenCalled();
		expect(toastMocks.warning).toHaveBeenCalledTimes(1);
		const [title, options] = toastMocks.warning.mock.calls[0];
		expect(title).toBe("Card purchase status unknown");
		expect(options).toMatchObject({ duration: Number.POSITIVE_INFINITY, closeButton: true });
		expect(descriptionText(options.description)).not.toContain("card_declined");
	});

	it("reports a definite provider failure as an error", async () => {
		request(createAttempt());
		await settle({ reject: new Error("Unable to start payment session") });

		expect(toastMocks.error).toHaveBeenCalledTimes(1);
		expect(toastMocks.error.mock.calls[0][0]).toBe("Card purchase did not complete");
		expect(descriptionText(toastMocks.error.mock.calls[0][1].description)).not.toContain("payment session");
	});

	it("does not open Privy when the owner changed before the host started the attempt", () => {
		act(() => identity.set(OTHER));
		const attempt = createAttempt();
		request(attempt);

		expect(testState.fund).not.toHaveBeenCalled();
		expect(isCurrentPrivyFiatFundingAttempt(attempt)).toBe(false);
	});

	it("reports a provider cancellation and a declined card as a purchase that did not complete", async () => {
		request(createAttempt());
		await settle({ reject: new Error("Transaction cancelled") });
		expect(toastMocks.error).toHaveBeenCalledTimes(1);
		expect(toastMocks.error.mock.calls[0][0]).toBe("Card purchase did not complete");

		pending = deferred<unknown>();
		request(createAttempt());
		const declined = new Error("The card was declined. Try another Visa or Mastercard.");
		declined.name = "StripePaymentMethodError";
		await settle({ reject: declined });
		expect(toastMocks.error).toHaveBeenCalledTimes(2);
		expect(toastMocks.warning).not.toHaveBeenCalled();
	});

	it("ends the attempt as an unknown status when Privy throws before returning a promise", async () => {
		testState.fund.mockImplementation(() => {
			throw new Error("fund is not ready");
		});
		const attempt = createAttempt();
		request(attempt);
		await act(async () => {
			await Promise.resolve();
		});

		expect(isCurrentPrivyFiatFundingAttempt(attempt)).toBe(false);
		expect(toastMocks.warning).toHaveBeenCalledTimes(1);
		expect(toastMocks.warning.mock.calls[0][0]).toBe("Card purchase status unknown");
	});

	it("starts a purchase once when it first mounts with the request already waiting", () => {
		remountHost();
		request(createAttempt());
		mountHost();

		expect(testState.fund).toHaveBeenCalledTimes(1);
	});

	it("holds a late result for its owner and shows it only when that owner is current again", async () => {
		const attempt = createAttempt();
		request(attempt);
		act(() => identity.set(OTHER));
		await settle({ resolve: { status: "confirmed" } });

		expect(toastMocks.success).not.toHaveBeenCalled();
		expect(isCurrentPrivyFiatFundingAttempt(attempt)).toBe(false);

		act(() => identity.set(OWNER.toLowerCase()));
		expect(toastMocks.success).toHaveBeenCalledTimes(1);
		expect(toastMocks.success.mock.calls[0][0]).toBe("Card purchase confirmed");
	});

	it("withdraws a shown notice while another owner is current and shows it again on return", async () => {
		request(createAttempt());
		await settle({ reject: new Error("Could not confirm payment status yet.") });
		const first = published(toastMocks.warning);
		expect(first.id).toMatch(/^privy-fiat-funding:\d+$/);

		act(() => identity.set(OTHER));
		expect(toastMocks.dismiss).toHaveBeenCalledWith(first.id);
		expect(toastMocks.warning).toHaveBeenCalledTimes(1);

		first.onDismiss();
		act(() => identity.set(OWNER.toLowerCase()));
		expect(toastMocks.warning).toHaveBeenCalledTimes(2);
		expect(published(toastMocks.warning, 1).id).not.toBe(first.id);
		expect(toastMocks.warning.mock.calls[1][0]).toBe("Card purchase status unknown");
	});

	it("keeps a notice the user closed closed through owner and language changes", async () => {
		request(createAttempt());
		await settle({ resolve: { status: "submitted" } });
		act(() => published(toastMocks.warning).onDismiss());

		act(() => identity.set(OTHER));
		act(() => identity.set(OWNER.toLowerCase()));
		act(() => i18n.loadAndActivate({ locale: "zh", messages: {} }));

		expect(toastMocks.warning).toHaveBeenCalledTimes(1);
		expect(toastMocks.dismiss).not.toHaveBeenCalled();
	});

	it("retranslates a shown notice in place when the language changes", async () => {
		request(createAttempt());
		await settle({ reject: new Error("Unable to check payment status. Please try again.") });
		const first = published(toastMocks.warning);

		act(() =>
			i18n.loadAndActivate({
				locale: "zh",
				messages: { [msg`Card purchase status unknown`.id]: "银行卡购买状态未知" },
			}),
		);

		expect(toastMocks.warning).toHaveBeenCalledTimes(2);
		expect(toastMocks.warning.mock.calls[1][0]).toBe("银行卡购买状态未知");
		expect(published(toastMocks.warning, 1).id).toBe(first.id);
	});

	it("runs the sandbox for a testnet owner", () => {
		testState.isTestnet = true;
		act(() => identity.set(OWNER));
		request(createAttempt("embedded", "testnet"));

		expect(testState.fund).toHaveBeenCalledTimes(1);
		expect(testState.fund.mock.calls[0][0].environment).toBe("sandbox");
	});

	it("does not open Privy for an attempt made on the other network", () => {
		testState.isTestnet = true;
		act(() => identity.set(OWNER));
		const attempt = createAttempt("embedded", "mainnet");
		request(attempt);

		expect(testState.fund).not.toHaveBeenCalled();
		expect(isCurrentPrivyFiatFundingAttempt(attempt)).toBe(false);
	});
});
