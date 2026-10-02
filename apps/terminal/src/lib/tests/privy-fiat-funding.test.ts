import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { MessageDescriptor } from "@lingui/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolvePrivyFiatFundingFeatureFlags } from "@/config/privy-fiat-funding-flags";
import {
	classifyPrivyFiatFundingError,
	classifyPrivyFiatFundingResult,
	createPrivyFiatFundingRequest,
	PRIVY_FIAT_FUNDING_ASSET,
	PRIVY_FIAT_FUNDING_BACK_NAVIGATION_ERROR,
	PRIVY_FIAT_FUNDING_BUSY_MESSAGE,
	PRIVY_FIAT_FUNDING_CARD_DECLINE_REASONS,
	PRIVY_FIAT_FUNDING_CHAIN,
	PRIVY_FIAT_FUNDING_FAILURE_MESSAGES,
	PRIVY_FIAT_FUNDING_PAYMENT_METHOD_ERROR,
	PRIVY_FIAT_FUNDING_UNCONFIRMED_MESSAGES,
	PRIVY_FIAT_FUNDING_UNPROVEN_DECLINE_REASONS,
	PRIVY_FIAT_FUNDING_USER_EXIT_MESSAGE,
	resolvePrivyFiatFundingDestination,
} from "@/domain/trade/privy-fiat-funding";
import { getPrivyFiatFundingOwnerKey } from "@/domain/trade/privy-fiat-funding-owner-key";
import {
	STATUS_GLYPH_ERROR,
	STATUS_GLYPH_SUCCESS,
	STATUS_GLYPH_UNKNOWN,
	STATUS_GLYPH_WARNING,
} from "@/lib/brand/status-glyph.gen";
import {
	getPrivyFiatFundingFeedback,
	getPrivyFiatFundingNoticeGlyph,
	isPersistentPrivyFiatFundingNotice,
	type PrivyFiatFundingNotice,
	type PrivyFiatFundingNoticeKind,
} from "@/lib/trade/privy-fiat-funding-feedback";
import {
	finishPrivyFiatFunding,
	isCurrentPrivyFiatFundingAttempt,
	type PrivyFiatFundingAttempt,
	requestPrivyFiatFunding,
	resetPrivyFiatFundingStore,
} from "@/stores/use-privy-fiat-funding-store";

const OWNER = "0xabcdefabcdefabcdefabcdefabcdefabcdef1234";
const OWNER_CHECKSUM_CASE = "0xABCDEFabcdefABCDEFabcdefABCDEFabcdef1234";
const OTHER = "0x2222222222222222222222222222222222222222";
const PRIVY_DIST = resolve(__dirname, "../../../node_modules/@privy-io/react-auth/dist/esm");

function readPrivyFiatOnrampScreen(): string {
	return readdirSync(PRIVY_DIST)
		.filter((name) => name.startsWith("FiatOnrampScreen-") && name.endsWith(".mjs"))
		.map((name) => readFileSync(resolve(PRIVY_DIST, name), "utf8"))
		.join("\n");
}

/**
 * Runs the expression the installed SDK uses to decide how `fund()` settles when its window
 * closes, over the states that matter here. Matching it as text cannot notice a changed operand;
 * evaluating it can.
 */
function evaluatePrivyFiatOnrampCloseRule(screen: string): Record<string, unknown> {
	const rule =
		/\(\(\{state:\w+,error:\w+,isLoading:\w+\}\)=>.*?:\{type:"failure",error:Error\("User exited flow"\)\}\)(?=\(\{state:)/.exec(
			screen,
		)?.[0];
	if (!rule) throw new Error("The installed Privy SDK no longer contains the expected close rule");
	const decide = new Function(`return ${rule}`)() as (input: {
		state: { status: string; step?: string };
		error: unknown;
		isLoading: boolean;
	}) => { type: string; value?: unknown; error?: unknown };
	const cases = {
		"an error is on screen": { state: { status: "provider-success" }, error: "shown error", isLoading: false },
		"the provider reported success": { state: { status: "provider-success" }, error: null, isLoading: false },
		"the provider is confirming": { state: { status: "provider-confirming" }, error: null, isLoading: false },
		"the Stripe checkout is being confirmed": {
			state: { status: "stripe-flow", step: "confirm-checkout" },
			error: null,
			isLoading: true,
		},
		"the Stripe checkout is waiting for the user": {
			state: { status: "stripe-flow", step: "confirm-checkout" },
			error: null,
			isLoading: false,
		},
		"the Stripe payment step is loading": {
			state: { status: "stripe-flow", step: "payment" },
			error: null,
			isLoading: true,
		},
		"the amount is being chosen": { state: { status: "select-amount" }, error: null, isLoading: false },
	};
	return Object.fromEntries(
		Object.entries(cases).map(([label, input]) => {
			const decision = decide(input);
			return [label, decision.error instanceof Error ? { ...decision, error: decision.error.message } : decision];
		}),
	);
}

const embeddedSession = {
	clientKey: OWNER,
	sessionMode: "wallet" as const,
	walletIntent: "embedded" as const,
	sessionWalletAddress: OWNER,
	embeddedWalletAddress: OWNER,
	privyWalletAddresses: [OWNER, OTHER],
};

describe("card funding destination", () => {
	it("pays out to the exact embedded owner of an email session", () => {
		expect(resolvePrivyFiatFundingDestination(embeddedSession)).toEqual({ address: OWNER, walletKind: "embedded" });
	});

	it("pays out to the exact external owner and matches addresses case-insensitively", () => {
		expect(
			resolvePrivyFiatFundingDestination({
				...embeddedSession,
				clientKey: OWNER.toLowerCase(),
				walletIntent: "external",
				sessionWalletAddress: OWNER_CHECKSUM_CASE,
				embeddedWalletAddress: undefined,
			}),
		).toEqual({ address: OWNER_CHECKSUM_CASE, walletKind: "external" });
	});

	it.each([
		["the session owner differs from the selected Hyperliquid user", { clientKey: OTHER }],
		["the session is agent-only", { sessionMode: "agent-only" as const }],
		["the session is disconnected", { sessionMode: "disconnected" as const }],
		["the session wallet is missing", { sessionWalletAddress: undefined }],
		["Privy does not list the wallet", { privyWalletAddresses: [OTHER] }],
		["the embedded wallet is not the owner", { embeddedWalletAddress: OTHER }],
		["the embedded wallet is unknown", { embeddedWalletAddress: undefined }],
		["the wallet intent is ambiguous", { walletIntent: "ambiguous" as const }],
		["the wallet intent is unavailable", { walletIntent: "unavailable" as const }],
	])("offers nothing when %s", (_label, override) => {
		expect(resolvePrivyFiatFundingDestination({ ...embeddedSession, ...override })).toBeNull();
	});

	it("never falls back to another connected wallet", () => {
		expect(
			resolvePrivyFiatFundingDestination({
				...embeddedSession,
				walletIntent: "external",
				sessionWalletAddress: OTHER,
				privyWalletAddresses: [OWNER, OTHER],
			}),
		).toBeNull();
	});
});

describe("card funding request", () => {
	it("asks for Arbitrum USDC at the exact owner in production on Mainnet, opening at 100 US dollars", () => {
		expect(PRIVY_FIAT_FUNDING_CHAIN).toBe("eip155:42161");
		expect(PRIVY_FIAT_FUNDING_ASSET).toBe("0xaf88d065e77c8cC2239327C5EDb3A432268e5831");
		expect(createPrivyFiatFundingRequest({ address: OWNER, walletKind: "external" }, "mainnet")).toEqual({
			source: { defaultAsset: "usd" },
			destination: { address: OWNER, chain: "eip155:42161", asset: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" },
			environment: "production",
			defaultAmount: "100",
		});
	});

	it("runs the provider sandbox on testnet against the same Mainnet destination", () => {
		const request = createPrivyFiatFundingRequest({ address: OWNER, walletKind: "embedded" }, "testnet");
		expect(request.environment).toBe("sandbox");
		expect(request.destination.chain).toBe("eip155:42161");
	});

	it("keys an attempt by network and lower-cased owner", () => {
		expect(getPrivyFiatFundingOwnerKey("mainnet", OWNER_CHECKSUM_CASE)).toBe(`mainnet:${OWNER.toLowerCase()}`);
		expect(getPrivyFiatFundingOwnerKey("testnet", OWNER)).not.toBe(getPrivyFiatFundingOwnerKey("mainnet", OWNER));
	});
});

describe("card funding outcomes", () => {
	it("treats only a confirmed status as confirmed and anything else that resolved as submitted", () => {
		expect(classifyPrivyFiatFundingResult({ status: "confirmed" })).toBe("confirmed");
		expect(classifyPrivyFiatFundingResult({ status: "submitted" })).toBe("submitted");
		expect(classifyPrivyFiatFundingResult({ status: "unexpected" })).toBe("submitted");
		expect(classifyPrivyFiatFundingResult(undefined)).toBe("submitted");
	});

	it("separates a user exit, a flow already in progress, a definite failure and an unknown status", () => {
		const back = new Error("Back navigation");
		back.name = PRIVY_FIAT_FUNDING_BACK_NAVIGATION_ERROR;
		expect(classifyPrivyFiatFundingError(back)).toBe("cancelled");
		expect(classifyPrivyFiatFundingError(new Error(PRIVY_FIAT_FUNDING_USER_EXIT_MESSAGE))).toBe("cancelled");
		expect(classifyPrivyFiatFundingError(new Error(PRIVY_FIAT_FUNDING_BUSY_MESSAGE))).toBe("busy");
		for (const message of PRIVY_FIAT_FUNDING_FAILURE_MESSAGES) {
			expect(classifyPrivyFiatFundingError(new Error(message))).toBe("failed");
		}
		for (const message of PRIVY_FIAT_FUNDING_UNCONFIRMED_MESSAGES) {
			expect(classifyPrivyFiatFundingError(new Error(message))).toBe("unknown");
		}
		expect(classifyPrivyFiatFundingError(new Error("Transaction pending"))).toBe("unknown");
		expect(classifyPrivyFiatFundingError(new Error("stripe: network error after confirm"))).toBe("unknown");
		expect(classifyPrivyFiatFundingError("Card declined")).toBe("unknown");
	});

	function createPaymentMethodError(declineReason?: unknown) {
		return Object.assign(new Error("The card was declined. Try another Visa or Mastercard."), {
			name: PRIVY_FIAT_FUNDING_PAYMENT_METHOD_ERROR,
			declineReason,
		});
	}

	it("treats a payment method error as a definite failure only for a reason that proves the card was refused", () => {
		for (const reason of PRIVY_FIAT_FUNDING_CARD_DECLINE_REASONS) {
			expect(classifyPrivyFiatFundingError(createPaymentMethodError(reason))).toBe("failed");
		}
		for (const reason of [
			...PRIVY_FIAT_FUNDING_UNPROVEN_DECLINE_REASONS,
			"declined_after_capture",
			"insufficient_liquidity",
			"",
			undefined,
			null,
			7,
		]) {
			expect(classifyPrivyFiatFundingError(createPaymentMethodError(reason))).toBe("unknown");
		}
	});

	it("keeps a refund notice as an unknown status", () => {
		expect(
			classifyPrivyFiatFundingError(
				new Error(
					"We could not complete your purchase. Any charge will be refunded — contact support if it does not appear within a few days.",
				),
			),
		).toBe("unknown");
	});

	it("relies on the error texts the installed Privy SDK actually throws", () => {
		const bundles = readdirSync(PRIVY_DIST)
			.filter((name) => name.endsWith(".mjs"))
			.map((name) => readFileSync(resolve(PRIVY_DIST, name), "utf8"))
			.join("\n");
		expect(bundles).toContain(`Error("${PRIVY_FIAT_FUNDING_USER_EXIT_MESSAGE}")`);
		expect(bundles).toContain(`this.name="${PRIVY_FIAT_FUNDING_BACK_NAVIGATION_ERROR}"`);
		expect(bundles).toContain(`Error("${PRIVY_FIAT_FUNDING_BUSY_MESSAGE}")`);
		for (const message of [...PRIVY_FIAT_FUNDING_FAILURE_MESSAGES, ...PRIVY_FIAT_FUNDING_UNCONFIRMED_MESSAGES]) {
			if (message.startsWith("Transaction ")) {
				expect(bundles).toMatch(/Error\(`Transaction \$\{[^}]*\?\?"failed"\}`\)/);
				expect(bundles).toContain(`"${message.slice("Transaction ".length)}"===e.status`);
			} else {
				expect(bundles).toContain(`Error("${message}")`);
			}
		}
		expect(bundles).toContain(`this.declineReason=e,this.name="${PRIVY_FIAT_FUNDING_PAYMENT_METHOD_ERROR}"`);
	});

	it("classifies every decline reason the installed Privy SDK has a message for", () => {
		const screen = readPrivyFiatOnrampScreen();
		const messages = /\{card_declined:[^{}]*\}/.exec(screen)?.[0] ?? "";
		const reasons = [...messages.matchAll(/(?:^\{|,)([a-z_]+):/g)].map((match) => match[1]);
		expect(reasons.length).toBeGreaterThan(0);
		expect([...reasons].sort()).toEqual(
			[...PRIVY_FIAT_FUNDING_CARD_DECLINE_REASONS, ...PRIVY_FIAT_FUNDING_UNPROVEN_DECLINE_REASONS].sort(),
		);
	});

	it("relies on how the installed Privy SDK ends a flow that the user closes", () => {
		expect(evaluatePrivyFiatOnrampCloseRule(readPrivyFiatOnrampScreen())).toEqual({
			"an error is on screen": { type: "failure", error: "shown error" },
			"the provider reported success": { type: "success", value: { status: "confirmed" } },
			"the provider is confirming": { type: "success", value: { status: "submitted" } },
			"the Stripe checkout is being confirmed": { type: "success", value: { status: "submitted" } },
			"the Stripe checkout is waiting for the user": { type: "failure", error: "User exited flow" },
			"the Stripe payment step is loading": { type: "failure", error: "User exited flow" },
			"the amount is being chosen": { type: "failure", error: "User exited flow" },
		});
	});

	it.each([
		[
			"the Stripe checkout no longer counts as submitted",
			/"stripe-flow"===\w+\.status&&"confirm-checkout"===\w+\.step&&\w+/,
			"!1",
		],
		["a confirming provider no longer counts as submitted", /"provider-confirming"===\w+\.status/, "!1"],
		["a shown error no longer wins", /\w+\?\{type:"failure",error:\w+\}:/, ""],
	])("would notice if %s in the installed Privy SDK", (_label, operand, replacement) => {
		const screen = readPrivyFiatOnrampScreen();
		const changed = screen.replace(operand, replacement);
		expect(changed).not.toBe(screen);
		expect(evaluatePrivyFiatOnrampCloseRule(changed)).not.toEqual(evaluatePrivyFiatOnrampCloseRule(screen));
	});
});

describe("card funding flags", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.resetModules();
	});

	it.each([
		[undefined, false],
		["", false],
		["false", false],
		["TRUE", false],
		["True", false],
		[" true", false],
		["1", false],
		["yes", false],
		["true", true],
	])("turns a network on only for the exact string true: %j", (value, enabled) => {
		expect(resolvePrivyFiatFundingFeatureFlags({ VITE_PRIVY_FIAT_FUNDING_MAINNET_ENABLED: value })).toEqual({
			mainnet: enabled,
			testnet: false,
		});
		expect(resolvePrivyFiatFundingFeatureFlags({ VITE_PRIVY_FIAT_FUNDING_TESTNET_ENABLED: value })).toEqual({
			mainnet: false,
			testnet: enabled,
		});
	});

	it.each([
		["true", "false", true, false],
		["false", "true", false, true],
		["true", "true", true, true],
		["false", "false", false, false],
	])(
		"reads each network from its own flag at runtime: mainnet %s, testnet %s",
		async (mainnet, testnet, onMainnet, onTestnet) => {
			vi.stubEnv("VITE_PRIVY_FIAT_FUNDING_MAINNET_ENABLED", mainnet);
			vi.stubEnv("VITE_PRIVY_FIAT_FUNDING_TESTNET_ENABLED", testnet);
			vi.resetModules();
			const { isPrivyFiatFundingEnabled, PRIVY_FIAT_FUNDING_FEATURES } = await import("@/config/privy-fiat-funding");

			expect(PRIVY_FIAT_FUNDING_FEATURES).toEqual({ mainnet: onMainnet, testnet: onTestnet });
			expect(isPrivyFiatFundingEnabled(false)).toBe(onMainnet);
			expect(isPrivyFiatFundingEnabled(true)).toBe(onTestnet);
		},
	);
});

describe("card funding attempt store", () => {
	function createAttempt(): PrivyFiatFundingAttempt {
		return {
			destination: { address: OWNER, walletKind: "embedded" },
			network: "mainnet",
			ownerKey: getPrivyFiatFundingOwnerKey("mainnet", OWNER),
		};
	}

	afterEach(() => {
		resetPrivyFiatFundingStore();
	});

	it("holds one attempt at a time and lets only that attempt end itself", () => {
		const first = createAttempt();
		const second = createAttempt();
		expect(requestPrivyFiatFunding(first)).toBe(true);
		expect(requestPrivyFiatFunding(second)).toBe(false);

		finishPrivyFiatFunding(second);
		expect(isCurrentPrivyFiatFundingAttempt(first)).toBe(true);

		finishPrivyFiatFunding(first);
		expect(requestPrivyFiatFunding(second)).toBe(true);
		finishPrivyFiatFunding(first);
		expect(isCurrentPrivyFiatFundingAttempt(second)).toBe(true);
	});
});

describe("card funding feedback", () => {
	const translate = (descriptor: MessageDescriptor) => descriptor.message ?? descriptor.id;
	const KINDS: PrivyFiatFundingNoticeKind[] = ["busy", "confirmed", "failed", "submitted", "unavailable", "unknown"];
	const SANDBOX_NOTE = "This was a sandbox test: no card was charged and no USDC will arrive.";

	function createNotice(kind: PrivyFiatFundingNoticeKind, overrides: Partial<PrivyFiatFundingNotice> = {}) {
		return {
			kind,
			network: "mainnet",
			ownerKey: getPrivyFiatFundingOwnerKey("mainnet", OWNER),
			walletKind: "embedded",
			...overrides,
		} satisfies PrivyFiatFundingNotice;
	}

	it("never claims arrival and adds the gas note as its own line only for external wallets", () => {
		const embedded = getPrivyFiatFundingFeedback(createNotice("confirmed"), translate);
		const external = getPrivyFiatFundingFeedback(createNotice("confirmed", { walletKind: "external" }), translate);
		expect(embedded.tone).toBe("success");
		expect(embedded.descriptionLines).toEqual([
			"USDC is on its way to your wallet on Arbitrum. Open Deposit once it arrives.",
		]);
		expect(external.descriptionLines).toEqual([
			"USDC is on its way to your wallet on Arbitrum. Open Deposit once it arrives.",
			"Depositing it needs a little ETH on Arbitrum for network fees.",
		]);
	});

	it("keeps results that may follow a charge on screen as an unknown status, never as an error", () => {
		for (const kind of KINDS) {
			const notice = createNotice(kind);
			const uncertain = kind === "submitted" || kind === "unknown";
			expect(isPersistentPrivyFiatFundingNotice(notice)).toBe(uncertain);
			expect(getPrivyFiatFundingFeedback(notice, translate).tone === "uncertain").toBe(uncertain);
			expect(getPrivyFiatFundingNoticeGlyph(notice) === STATUS_GLYPH_UNKNOWN).toBe(uncertain);
		}
		expect(getPrivyFiatFundingFeedback(createNotice("unknown"), translate).title).toBe("Card purchase status unknown");
	});

	it("reports a definite failure as an error and a busy flow as a warning", () => {
		expect(getPrivyFiatFundingFeedback(createNotice("busy"), translate)).toEqual({
			tone: "warning",
			title: "A card purchase is already open. Finish or close it first.",
			descriptionLines: [],
		});
		expect(getPrivyFiatFundingNoticeGlyph(createNotice("busy"))).toBe(STATUS_GLYPH_WARNING);
		expect(getPrivyFiatFundingFeedback(createNotice("failed", { walletKind: "external" }), translate)).toEqual({
			tone: "error",
			title: "Card purchase did not complete",
			descriptionLines: ["If you were charged, check the payment provider's email before trying again."],
		});
		expect(getPrivyFiatFundingNoticeGlyph(createNotice("failed"))).toBe(STATUS_GLYPH_ERROR);
		expect(getPrivyFiatFundingNoticeGlyph(createNotice("confirmed"))).toBe(STATUS_GLYPH_SUCCESS);
	});

	it("reports a purchase window that could not load as an error without a provider hint", () => {
		for (const network of ["mainnet", "testnet"] as const) {
			expect(getPrivyFiatFundingFeedback(createNotice("unavailable", { network }), translate)).toEqual({
				tone: "error",
				title: "Card purchase could not open. Check your connection and try again.",
				descriptionLines: [],
			});
		}
	});

	it("tells a sandbox purchase apart: nothing was charged, nothing arrives and nothing stays on screen", () => {
		for (const kind of ["confirmed", "submitted", "unknown", "failed"] as const) {
			for (const walletKind of ["embedded", "external"] as const) {
				const notice = createNotice(kind, { network: "testnet", walletKind });
				const feedback = getPrivyFiatFundingFeedback(notice, translate);
				expect(feedback.descriptionLines).toEqual([SANDBOX_NOTE]);
				expect(feedback.title).toBe(getPrivyFiatFundingFeedback(createNotice(kind), translate).title);
				expect(isPersistentPrivyFiatFundingNotice(notice)).toBe(false);
			}
		}
		for (const kind of KINDS) {
			const lines = getPrivyFiatFundingFeedback(createNotice(kind), translate).descriptionLines;
			expect(lines).not.toContain(SANDBOX_NOTE);
		}
	});
});
