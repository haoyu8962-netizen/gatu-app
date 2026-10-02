// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { I18nProvider } from "@lingui/react";
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type CardFundingSession, setCardFundingSession, signInCardFundingOwner } from "./harness/card-funding-session";
import { installSonnerClock } from "./harness/sonner-clock";

const OWNER = "0xabcdefabcdefabcdefabcdefabcdefabcdef1234";
const OTHER = "0x2222222222222222222222222222222222222222";
const SANDBOX_NOTE = "This was a sandbox test: no card was charged and no USDC will arrive.";

const testState = vi.hoisted(() => ({ fund: vi.fn() }));

vi.mock("@privy-io/react-auth", async () => {
	const { useCardFundingSession } = await import("./harness/card-funding-session");
	return {
		useFiatOnramp: () => ({ fund: testState.fund }),
		useModalStatus: () => ({ isOpen: useCardFundingSession().privyWindowOpen }),
		useWallets: () => ({ ready: true, wallets: useCardFundingSession().privyWallets }),
	};
});
vi.mock("@/hooks/wallet/use-wallet-session", async () => {
	const { useCardFundingSession } = await import("./harness/card-funding-session");
	return { useWalletSession: useCardFundingSession };
});
vi.mock("@/lib/hyperliquid", async () => {
	const { useCardFundingSession } = await import("./harness/card-funding-session");
	return { useHyperliquid: useCardFundingSession };
});
vi.mock("@/stores/use-global-settings-store", async (importOriginal) => {
	const { useCardFundingSession } = await import("./harness/card-funding-session");
	return {
		...(await importOriginal<typeof import("@/stores/use-global-settings-store")>()),
		useIsTestnet: () => useCardFundingSession().isTestnet,
	};
});

import { PrivyFiatFundingHost } from "@/components/trade/tradebox/privy-fiat-funding-host";
import { Toaster } from "@/components/ui/sonner";
import { getPrivyFiatFundingOwnerKey } from "@/domain/trade/privy-fiat-funding-owner-key";
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

function createPaymentMethodError(declineReason: string) {
	return Object.assign(new Error("The card was declined. Try another Visa or Mastercard."), {
		name: "StripePaymentMethodError",
		declineReason,
	});
}

function Harness({ showHost = true }: { showHost?: boolean }) {
	return (
		<StrictMode>
			<I18nProvider i18n={i18n}>
				<Toaster />
				{showHost && <PrivyFiatFundingHost />}
			</I18nProvider>
		</StrictMode>
	);
}

describe("PrivyFiatFundingHost", () => {
	let container: HTMLDivElement;
	let root: Root;
	let clock: ReturnType<typeof installSonnerClock>;
	let pending: ReturnType<typeof deferred<unknown>>;

	beforeEach(async () => {
		clock = installSonnerClock();
		i18n.loadAndActivate({ locale: "en", messages: {} });
		signInCardFundingOwner(OWNER);
		pending = deferred<unknown>();
		testState.fund.mockReset();
		testState.fund.mockImplementation(() => pending.promise);
		resetPrivyFiatFundingStore();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		await act(async () => root.render(<Harness />));
	});

	afterEach(async () => {
		await act(async () => {
			toast.dismiss();
		});
		await clock.settle();
		act(() => root.unmount());
		container.remove();
		clock.uninstall();
		vi.clearAllMocks();
	});

	function cards() {
		return [...container.querySelectorAll<HTMLElement>("[data-privy-fiat-funding-notice]")];
	}

	function toasts() {
		return container.querySelectorAll("[data-sonner-toast]");
	}

	async function request(attempt: PrivyFiatFundingAttempt): Promise<boolean> {
		let accepted = false;
		await act(async () => {
			accepted = requestPrivyFiatFunding(attempt);
		});
		return accepted;
	}

	async function endFlow(outcome: { resolve?: unknown; reject?: unknown }) {
		const flow = pending;
		pending = deferred<unknown>();
		await act(async () => {
			if ("reject" in outcome) flow.reject(outcome.reject);
			else flow.resolve(outcome.resolve);
			await flow.promise.catch(() => undefined);
		});
	}

	async function purchase(outcome: { resolve?: unknown; reject?: unknown }, attempt = createAttempt()) {
		await request(attempt);
		await endFlow(outcome);
		await clock.timers();
		return attempt;
	}

	async function switchSession(next: Partial<CardFundingSession>) {
		await act(async () => setCardFundingSession(next));
	}

	async function dismiss(card: HTMLElement) {
		const button = card.querySelector<HTMLButtonElement>('button[aria-label="Dismiss"]');
		if (!button) throw new Error("Expected the notice's dismiss button");
		await act(async () => button.click());
	}

	it("opens Privy's onramp once with the exact owner as the Arbitrum USDC destination", async () => {
		await request(createAttempt());

		expect(testState.fund).toHaveBeenCalledTimes(1);
		expect(testState.fund).toHaveBeenCalledWith({
			source: { defaultAsset: "usd" },
			destination: { address: OWNER, chain: "eip155:42161", asset: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" },
			environment: "production",
			defaultAmount: "100",
		});
		expect(await request(createAttempt())).toBe(false);
	});

	it("reports a confirmed purchase without claiming arrival, frees the next attempt and closes on its own", async () => {
		const attempt = await purchase({ resolve: { status: "confirmed" } });

		expect(cards()).toHaveLength(1);
		const [card] = cards();
		expect(card.dataset.privyFiatFundingNotice).toBe("confirmed");
		expect(card.querySelector("[data-status-glyph]")?.getAttribute("data-status-glyph")).toBe("success");
		expect(card.querySelector('[role="status"]')?.textContent).toBe(
			"Card purchase confirmedUSDC is on its way to your wallet on Arbitrum. Open Deposit once it arrives.",
		);
		expect(isCurrentPrivyFiatFundingAttempt(attempt)).toBe(false);
		expect(await request(createAttempt())).toBe(true);

		await clock.timers(9_900);
		expect(cards()).toHaveLength(1);
		await clock.timers(200);
		await clock.settle();
		expect(toasts()).toHaveLength(0);
		await switchSession({ clientKey: OTHER });
		await switchSession({ clientKey: OWNER.toLowerCase() });
		await clock.settle();
		expect(toasts()).toHaveLength(0);
	});

	it("keeps a submitted purchase on screen as uncertain, with the gas note on its own line for an external wallet", async () => {
		await act(async () => signInCardFundingOwner(OWNER, "external"));
		await purchase({ resolve: { status: "submitted" } }, createAttempt("external"));

		const [card] = cards();
		expect(card.dataset.privyFiatFundingNotice).toBe("submitted");
		expect(card.querySelector("[data-status-glyph]")?.getAttribute("data-status-glyph")).toBe("unknown");
		expect([...card.querySelectorAll("p")].map((line) => line.textContent)).toEqual([
			"Card purchase submitted",
			"The payment provider is still processing it. USDC arrives in your wallet on Arbitrum when it completes; then open Deposit.",
			"Depositing it needs a little ETH on Arbitrum for network fees.",
		]);
		expect(card.querySelector('[role="alert"]')).toBeNull();

		await clock.timers(600_000);
		await clock.settle();
		expect(cards()).toHaveLength(1);
	});

	it("stays silent when the user leaves the flow", async () => {
		await purchase({ reject: new Error("User exited flow") });
		await clock.settle();

		expect(toasts()).toHaveLength(0);
		expect(await request(createAttempt())).toBe(true);
	});

	it("reports an unrecognized rejection as an unknown status without the provider's raw text", async () => {
		await purchase({ reject: new Error("stripe: card_declined do_not_honor") });

		const [card] = cards();
		expect(card.dataset.privyFiatFundingNotice).toBe("unknown");
		expect(card.textContent).toContain("Card purchase status unknown");
		expect(container.textContent).not.toContain("card_declined");
		expect(card.querySelector('[role="alert"]')).toBeNull();
		await clock.timers(600_000);
		expect(cards()).toHaveLength(1);
	});

	it("reports a definite provider failure as an error that closes on its own", async () => {
		await purchase({ reject: new Error("Unable to start payment session") });

		const [card] = cards();
		expect(card.dataset.privyFiatFundingNotice).toBe("failed");
		expect(card.querySelector("[data-status-glyph]")?.getAttribute("data-status-glyph")).toBe("error");
		expect(card.querySelector('[role="alert"]')?.textContent).toBe(
			"Card purchase did not completeIf you were charged, check the payment provider's email before trying again.",
		);
		expect(container.textContent).not.toContain("payment session");
		await clock.timers(10_100);
		await clock.settle();
		expect(toasts()).toHaveLength(0);
	});

	it("reports a provider cancellation and a refused card as failed, and an unproven decline as unknown", async () => {
		await purchase({ reject: new Error("Transaction cancelled") });
		await purchase({ reject: createPaymentMethodError("card_declined") });
		await purchase({ reject: createPaymentMethodError("processing_error") });

		expect(cards().map((card) => card.dataset.privyFiatFundingNotice)).toEqual(["unknown", "failed", "failed"]);
	});

	it("ends the attempt as an unknown status when Privy throws before returning a promise", async () => {
		testState.fund.mockImplementation(() => {
			throw new Error("fund is not ready");
		});
		const attempt = createAttempt();
		await request(attempt);
		await clock.timers();

		expect(isCurrentPrivyFiatFundingAttempt(attempt)).toBe(false);
		expect(cards().map((card) => card.dataset.privyFiatFundingNotice)).toEqual(["unknown"]);
		expect(container.textContent).not.toContain("fund is not ready");
	});

	it("starts a purchase once when it first mounts with the request already waiting", async () => {
		await act(async () => root.render(<Harness showHost={false} />));
		await request(createAttempt());
		expect(testState.fund).not.toHaveBeenCalled();

		await act(async () => root.render(<Harness />));

		expect(testState.fund).toHaveBeenCalledTimes(1);
	});

	it("does not open Privy when the owner changed before the host started the attempt", async () => {
		await switchSession({ clientKey: OTHER });
		const attempt = createAttempt();
		await request(attempt);

		expect(testState.fund).not.toHaveBeenCalled();
		expect(isCurrentPrivyFiatFundingAttempt(attempt)).toBe(false);
	});

	it("does not open Privy for an attempt made on the other network", async () => {
		await switchSession({ clientKey: OWNER, isTestnet: true });
		const attempt = createAttempt("embedded", "mainnet");
		await request(attempt);

		expect(testState.fund).not.toHaveBeenCalled();
		expect(isCurrentPrivyFiatFundingAttempt(attempt)).toBe(false);
	});

	it("holds a late result for its owner and shows it only when that owner is current again", async () => {
		const attempt = createAttempt();
		await request(attempt);
		await switchSession({ clientKey: OTHER });
		const published = toast.getHistory().length;
		await endFlow({ resolve: { status: "confirmed" } });
		await clock.settle();

		expect(toast.getHistory()).toHaveLength(published);
		expect(toasts()).toHaveLength(0);
		expect(container.textContent).not.toContain("Card purchase");
		expect(isCurrentPrivyFiatFundingAttempt(attempt)).toBe(false);

		await switchSession({ clientKey: OWNER.toLowerCase() });
		await clock.timers();
		expect(cards().map((card) => card.dataset.privyFiatFundingNotice)).toEqual(["confirmed"]);
	});

	it("hides a shown notice at once for another owner or network and shows it again on return", async () => {
		await purchase({ reject: new Error("Could not confirm payment status yet.") });
		const firstId = toast.getToasts()[0]?.id;
		expect(String(firstId)).toMatch(/^privy-fiat-funding:\d+$/);

		await switchSession({ clientKey: OTHER });
		expect(cards()).toHaveLength(0);
		expect(container.textContent).not.toContain("Card purchase");
		await clock.settle();
		expect(toasts()).toHaveLength(0);

		await switchSession({ clientKey: OWNER.toLowerCase() });
		await clock.timers();
		expect(cards().map((card) => card.dataset.privyFiatFundingNotice)).toEqual(["unknown"]);
		expect(toast.getToasts().map((shown) => shown.id)).not.toContain(firstId);

		await switchSession({ isTestnet: true });
		expect(cards()).toHaveLength(0);
		await clock.settle();
		expect(toasts()).toHaveLength(0);
		await switchSession({ isTestnet: false });
		await clock.timers();
		expect(cards()).toHaveLength(1);
	});

	it("stops rendering a notice in the same commit as the identity change", async () => {
		await purchase({ resolve: { status: "submitted" } });
		expect(cards()).toHaveLength(1);

		act(() => setCardFundingSession({ clientKey: OTHER }));

		expect(cards()).toHaveLength(0);
		expect(container.textContent).not.toContain("Card purchase");
	});

	it("shows nothing when Sonner inserts a notice after it was withdrawn for another owner", async () => {
		await request(createAttempt());
		await endFlow({ reject: new Error("Could not confirm payment status yet.") });
		expect(toasts()).toHaveLength(0);

		await switchSession({ clientKey: OTHER });
		// Sonner removes through two animation frames but inserts from a timer.
		await clock.runFrames();
		await clock.runFrames();
		await clock.timers();
		expect(cards()).toHaveLength(0);
		expect(container.textContent).not.toContain("Card purchase");

		await clock.settle();
		await clock.timers(600_000);
		expect(toasts()).toHaveLength(0);

		await switchSession({ clientKey: OWNER.toLowerCase() });
		await clock.timers();
		expect(cards().map((card) => card.dataset.privyFiatFundingNotice)).toEqual(["unknown"]);
	});

	it("shows a notice exactly once after a rapid owner round trip that outruns Sonner", async () => {
		await request(createAttempt());
		await endFlow({ resolve: { status: "submitted" } });
		await switchSession({ clientKey: OTHER });
		await switchSession({ clientKey: OWNER.toLowerCase() });
		await clock.runFrames();
		await clock.runFrames();
		await clock.timers();
		await clock.settle();

		expect(cards().map((card) => card.dataset.privyFiatFundingNotice)).toEqual(["submitted"]);
		expect(toasts()).toHaveLength(1);
		await clock.timers(600_000);
		expect(cards()).toHaveLength(1);
	});

	it("keeps a notice when the owner leaves and returns before the host could withdraw it", async () => {
		await purchase({ resolve: { status: "submitted" } });

		act(() => setCardFundingSession({ clientKey: OTHER }));
		act(() => setCardFundingSession({ clientKey: OWNER.toLowerCase() }));
		await clock.settle();

		expect(cards().map((card) => card.dataset.privyFiatFundingNotice)).toEqual(["submitted"]);
		expect(toasts()).toHaveLength(1);
		await clock.timers(600_000);
		await switchSession({ clientKey: OTHER });
		await switchSession({ clientKey: OWNER.toLowerCase() });
		await clock.settle();
		expect(cards().map((card) => card.dataset.privyFiatFundingNotice)).toEqual(["submitted"]);
	});

	it("lets Sonner measure every shown notice again after a language change, also the ones behind", async () => {
		await purchase({ reject: new Error("Could not confirm payment status yet.") });
		await purchase({ resolve: { status: "submitted" } });
		await clock.timers();
		const contents = () => toast.getToasts().map((entry) => ("jsx" in entry ? entry.jsx : null));
		const published = contents();

		await act(async () => i18n.loadAndActivate({ locale: "zh", messages: {} }));
		await clock.timers();

		const translated = contents();
		expect(translated).toHaveLength(2);
		expect(translated[0]).not.toBe(published[0]);
		expect(translated[1]).not.toBe(published[1]);
		await clock.timers(600_000);
		expect(cards()).toHaveLength(2);
	});

	it("does not publish a withdrawn notice again when its layout report was still waiting", async () => {
		await purchase({ resolve: { status: "submitted" } });
		const id = toast.getToasts()[0]?.id;
		const published = toast.getHistory().find((entry) => entry.id === id);
		if (!published || !("jsx" in published)) throw new Error("Expected the notice's toast");

		act(() => i18n.loadAndActivate({ locale: "zh", messages: {} }));
		act(() => setCardFundingSession({ clientKey: OTHER }));
		await clock.settle();

		const kept = toast.getHistory().find((entry) => entry.id === id);
		expect(kept && "jsx" in kept ? kept.jsx : null).toBe(published.jsx);
		expect(toasts()).toHaveLength(0);
	});

	it("removes its notices when the host unmounts, even before Sonner inserted them", async () => {
		await purchase({ resolve: { status: "submitted" } });
		await request(createAttempt());
		await endFlow({ reject: new Error("Could not confirm payment status yet.") });

		await act(async () => root.render(<Harness showHost={false} />));
		expect(cards()).toHaveLength(0);
		await clock.runFrames();
		await clock.runFrames();
		await clock.timers();
		expect(cards()).toHaveLength(0);
		await clock.settle();
		await clock.timers(600_000);
		expect(toasts()).toHaveLength(0);

		await act(async () => root.render(<Harness />));
		await clock.timers();
		expect(cards().map((card) => card.dataset.privyFiatFundingNotice)).toEqual(["unknown", "submitted"]);
	});

	it("keeps several notices apart: closing one leaves the other, also across an owner round trip", async () => {
		await purchase({ reject: new Error("Could not confirm payment status yet.") });
		await purchase({ resolve: { status: "submitted" } });
		expect(cards().map((card) => card.dataset.privyFiatFundingNotice)).toEqual(["submitted", "unknown"]);

		const unknown = cards().find((card) => card.dataset.privyFiatFundingNotice === "unknown");
		if (!unknown) throw new Error("Expected the unknown status notice");
		await dismiss(unknown);
		await clock.settle();
		expect(cards().map((card) => card.dataset.privyFiatFundingNotice)).toEqual(["submitted"]);

		await switchSession({ clientKey: OTHER });
		await clock.settle();
		expect(toasts()).toHaveLength(0);
		await switchSession({ clientKey: OWNER.toLowerCase() });
		await clock.settle();
		expect(cards().map((card) => card.dataset.privyFiatFundingNotice)).toEqual(["submitted"]);
	});

	it("keeps a notice the user closed closed through owner and language changes", async () => {
		await purchase({ resolve: { status: "submitted" } });
		await dismiss(cards()[0]);
		await clock.settle();
		expect(toasts()).toHaveLength(0);

		await switchSession({ clientKey: OTHER });
		await switchSession({ clientKey: OWNER.toLowerCase() });
		await act(async () => i18n.loadAndActivate({ locale: "zh", messages: {} }));
		await clock.settle();

		expect(toasts()).toHaveLength(0);
	});

	it("ignores the callbacks of a withdrawn presentation after the notice is shown again", async () => {
		await purchase({ resolve: { status: "submitted" } });
		const previous = toast.getToasts()[0];
		if (!previous || !("onDismiss" in previous)) throw new Error("Expected the first presentation");

		await switchSession({ clientKey: OTHER });
		await switchSession({ clientKey: OWNER.toLowerCase() });
		await clock.settle();
		await act(async () => {
			previous.onDismiss?.(previous);
			previous.onAutoClose?.(previous);
		});
		await clock.settle();
		expect(cards().map((card) => card.dataset.privyFiatFundingNotice)).toEqual(["submitted"]);

		await switchSession({ clientKey: OTHER });
		await switchSession({ clientKey: OWNER.toLowerCase() });
		await clock.settle();
		expect(cards().map((card) => card.dataset.privyFiatFundingNotice)).toEqual(["submitted"]);
	});

	it("retranslates a shown notice in place and lets Sonner measure it again without shortening its time", async () => {
		await purchase({ resolve: { status: "confirmed" } });
		await clock.timers();
		const shown = toasts()[0];
		const published = toast.getToasts()[0];
		await clock.timers(6_000);

		await act(async () =>
			i18n.loadAndActivate({
				locale: "zh",
				messages: { [msg`Card purchase confirmed`.id]: "银行卡购买已确认" },
			}),
		);

		expect(cards()[0].textContent).toContain("银行卡购买已确认");
		expect(cards()[0].textContent).not.toContain("Card purchase confirmed");
		await clock.timers();
		const republished = toast.getToasts()[0];
		if (!("jsx" in published) || !("jsx" in republished)) throw new Error("Expected custom notice content");
		expect(republished.id).toBe(published.id);
		expect(republished.jsx).not.toBe(published.jsx);
		expect(republished.duration).toBe(published.duration);
		expect(toasts()[0]).toBe(shown);
		await clock.timers(9_800);
		expect(cards()).toHaveLength(1);
		await clock.timers(300);
		await clock.settle();
		expect(toasts()).toHaveLength(0);
	});

	it("leaves the time Sonner paused for a hovered stack alone when the language changes", async () => {
		await purchase({ resolve: { status: "confirmed" } });
		await clock.timers(1_000);
		const stack = container.querySelector("[data-sonner-toaster]");
		if (!stack) throw new Error("Expected Sonner's toast list");

		await act(async () => {
			stack.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
		});
		expect(toasts()[0].getAttribute("data-expanded")).toBe("true");
		await clock.timers(30_000);
		await act(async () => i18n.loadAndActivate({ locale: "zh", messages: {} }));
		await clock.timers();
		expect(cards()).toHaveLength(1);

		await act(async () => {
			stack.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
		});
		expect(toasts()[0].getAttribute("data-expanded")).toBe("false");
		await clock.timers(8_800);
		expect(cards()).toHaveLength(1);
		await clock.timers(400);
		await clock.settle();
		expect(toasts()).toHaveLength(0);
	});

	it("frees the purchase entry when Privy's window closes, before Privy settles, and still reports the result", async () => {
		const first = deferred<unknown>();
		const second = deferred<unknown>();
		testState.fund.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);
		const closed = createAttempt();
		await request(closed);
		await switchSession({ privyWindowOpen: true });
		expect(isCurrentPrivyFiatFundingAttempt(closed)).toBe(true);

		await switchSession({ privyWindowOpen: false });
		expect(isCurrentPrivyFiatFundingAttempt(closed)).toBe(false);
		const next = createAttempt();
		expect(await request(next)).toBe(true);
		expect(testState.fund).toHaveBeenCalledTimes(2);

		await act(async () => {
			first.resolve({ status: "submitted" });
			await first.promise;
		});
		await clock.timers();
		expect(cards().map((card) => card.dataset.privyFiatFundingNotice)).toEqual(["submitted"]);
		expect(isCurrentPrivyFiatFundingAttempt(next)).toBe(true);

		await act(async () => {
			second.reject(new Error("User exited flow"));
			await second.promise.catch(() => undefined);
		});
		expect(isCurrentPrivyFiatFundingAttempt(next)).toBe(false);
		expect(cards()).toHaveLength(1);
	});

	it("keeps the purchase entry locked until Privy's window was open for this purchase", async () => {
		await switchSession({ privyWindowOpen: true });
		await switchSession({ privyWindowOpen: false });
		const attempt = createAttempt();
		await request(attempt);
		await act(async () => i18n.loadAndActivate({ locale: "zh", messages: {} }));
		await clock.timers(60_000);

		expect(isCurrentPrivyFiatFundingAttempt(attempt)).toBe(true);
		expect(await request(createAttempt())).toBe(false);
	});

	it("frees the entry when Privy closes its window without ending the flow, and asks for a reload when Privy still holds it", async () => {
		testState.fund
			.mockImplementationOnce(() => new Promise(() => undefined))
			.mockImplementationOnce(() => Promise.reject(new Error("Existing fiat onramp flow in progress")));
		const abandoned = createAttempt();
		await request(abandoned);
		await switchSession({ privyWindowOpen: true });
		await switchSession({ privyWindowOpen: false });
		await clock.timers();

		expect(isCurrentPrivyFiatFundingAttempt(abandoned)).toBe(false);
		expect(toasts()).toHaveLength(0);

		const next = createAttempt();
		expect(await request(next)).toBe(true);
		await clock.timers();

		expect(isCurrentPrivyFiatFundingAttempt(next)).toBe(false);
		const [card] = cards();
		expect(card.dataset.privyFiatFundingNotice).toBe("busy");
		expect(card.querySelector("[data-status-glyph]")?.getAttribute("data-status-glyph")).toBe("warning");
		expect(card.querySelector('[role="status"]')?.textContent).toBe(
			"An earlier card purchase is still open on this page. Reload the page, then try again.",
		);
		expect(await request(createAttempt())).toBe(true);
	});

	it.each([
		["fell back to a trading key of the same owner", { sessionMode: "agent-only", walletAddress: undefined }],
		["lost the owner wallet from Privy's connected wallets", { privyWallets: [{ address: OTHER }] }],
		["now signs with an external wallet", { walletIntent: "external", embeddedWalletAddress: undefined }],
		["has another embedded wallet", { embeddedWalletAddress: OTHER }],
	] satisfies [string, Partial<CardFundingSession>][])(
		"does not open Privy when the session %s while the host was loading",
		async (_label, change) => {
			await act(async () => root.render(<Harness showHost={false} />));
			const attempt = createAttempt();
			await request(attempt);
			await switchSession(change);

			await act(async () => root.render(<Harness />));
			await clock.timers();

			expect(testState.fund).not.toHaveBeenCalled();
			expect(isCurrentPrivyFiatFundingAttempt(attempt)).toBe(false);
			expect(cards().map((card) => card.dataset.privyFiatFundingNotice)).toEqual(["wallet-changed"]);
			expect(cards()[0].querySelector('[role="alert"]')?.textContent).toBe(
				"Your wallet session changed, so the card purchase did not open. Reconnect your wallet and try again.",
			);
			expect(await request(createAttempt())).toBe(true);
		},
	);

	it("counts a result's time on screen only while it is in front, so it cannot expire unseen", async () => {
		await purchase({ resolve: { status: "confirmed" } });
		await purchase({ resolve: { status: "submitted" } });
		await clock.timers(600_000);
		await clock.settle();
		expect(cards().map((card) => card.dataset.privyFiatFundingNotice)).toEqual(["submitted", "confirmed"]);

		await dismiss(cards()[0]);
		await clock.settle();
		expect(cards().map((card) => card.dataset.privyFiatFundingNotice)).toEqual(["confirmed"]);
		await clock.timers(8_000);
		expect(cards()).toHaveLength(1);
		await clock.timers(2_100);
		await clock.settle();
		expect(toasts()).toHaveLength(0);

		await switchSession({ clientKey: OTHER });
		await switchSession({ clientKey: OWNER.toLowerCase() });
		await clock.settle();
		expect(toasts()).toHaveLength(0);
	});

	it("opens Privy once and still reports the result when the host mounts again during a purchase", async () => {
		await request(createAttempt());
		expect(testState.fund).toHaveBeenCalledTimes(1);

		await act(async () => root.render(<Harness showHost={false} />));
		await act(async () => root.render(<Harness />));
		expect(testState.fund).toHaveBeenCalledTimes(1);

		await endFlow({ resolve: { status: "submitted" } });
		await clock.timers();
		expect(cards().map((card) => card.dataset.privyFiatFundingNotice)).toEqual(["submitted"]);
	});

	it("keeps a result that arrives while no host is mounted and shows it when one mounts", async () => {
		await request(createAttempt());
		await act(async () => root.render(<Harness showHost={false} />));
		await endFlow({ reject: new Error("Could not confirm payment status yet.") });
		await clock.settle();
		expect(toasts()).toHaveLength(0);

		await act(async () => root.render(<Harness />));
		await clock.timers();
		expect(cards().map((card) => card.dataset.privyFiatFundingNotice)).toEqual(["unknown"]);
	});

	it("runs the sandbox for a testnet owner and says that nothing was charged or sent", async () => {
		await switchSession({ isTestnet: true });
		await purchase({ resolve: { status: "confirmed" } }, createAttempt("embedded", "testnet"));
		expect(testState.fund.mock.calls[0][0].environment).toBe("sandbox");
		await purchase(
			{ reject: new Error("Could not confirm payment status yet.") },
			createAttempt("embedded", "testnet"),
		);

		expect(cards().map((card) => card.dataset.privyFiatFundingNotice)).toEqual(["unknown", "confirmed"]);
		for (const card of cards()) {
			expect([...card.querySelectorAll("p")].map((line) => line.textContent).slice(1)).toEqual([SANDBOX_NOTE]);
		}
		expect(container.textContent).not.toContain("on its way");
		expect(container.textContent).not.toContain("Open Deposit");
		expect(container.textContent).not.toContain("If you paid");

		await clock.timers(10_100);
		await clock.settle();
		expect(cards().map((card) => card.dataset.privyFiatFundingNotice)).toEqual(["confirmed"]);
		await clock.timers(10_100);
		await clock.settle();
		expect(toasts()).toHaveLength(0);
	});
});
