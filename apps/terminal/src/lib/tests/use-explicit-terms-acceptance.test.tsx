// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useExplicitTermsAcceptance } from "@/hooks/wallet/use-explicit-terms-acceptance";

const OWNER = "0x1111111111111111111111111111111111111111" as const;
const OTHER_OWNER = "0x2222222222222222222222222222222222222222" as const;

const testState = vi.hoisted(() => ({
	resolveWallet: undefined as ((params: { address: `0x${string}`; env: "Mainnet" | "Testnet" }) => unknown) | undefined,
	walletIntent: "external" as "ambiguous" | "embedded" | "external" | "unavailable",
	connectedWalletAddress: "0x1111111111111111111111111111111111111111" as `0x${string}` | undefined,
	embeddedWalletAddress: "0x1111111111111111111111111111111111111111" as `0x${string}` | undefined,
	legalSignerOptions: undefined as { beforeSubmit?: () => void | Promise<void> } | undefined,
}));

vi.mock("@privy-io/react-auth", () => ({
	useSignTypedData: () => ({ signTypedData: vi.fn() }),
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({
		connectedWalletAddress: testState.connectedWalletAddress,
		embeddedWalletAddress: testState.embeddedWalletAddress,
		walletIntent: testState.walletIntent,
	}),
}));

vi.mock("@/lib/hyperliquid", () => ({
	useTermsAcceptance: (options: { resolveWallet?: typeof testState.resolveWallet }) => {
		testState.resolveWallet = options.resolveWallet;
		return { mutate: vi.fn() };
	},
}));

vi.mock("@/lib/wallet/privy-legal-signer", () => ({
	createPrivyLegalSigner: (options: { beforeSubmit?: () => void | Promise<void> }) => {
		testState.legalSignerOptions = options;
		return { kind: "embedded-signer" };
	},
}));

function Probe() {
	useExplicitTermsAcceptance();
	return null;
}

describe("useExplicitTermsAcceptance", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		testState.resolveWallet = undefined;
		testState.walletIntent = "external";
		testState.connectedWalletAddress = OWNER;
		testState.embeddedWalletAddress = OWNER;
		testState.legalSignerOptions = undefined;
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.clearAllMocks();
	});

	function renderHook() {
		act(() => {
			root.render(createElement(Probe));
		});
		if (!testState.resolveWallet) throw new Error("Terms wallet resolver was not registered");
		return testState.resolveWallet;
	}

	it.each(["ambiguous", "unavailable"] as const)("fails closed for a %s Privy wallet identity", (walletIntent) => {
		testState.walletIntent = walletIntent;
		const resolveWallet = renderHook();

		expect(() => resolveWallet({ address: OWNER, env: "Mainnet" })).toThrow(
			"The active Privy login wallet cannot be verified for terms acceptance.",
		);
	});

	it("leaves exact external-wallet resolution to the SDK", () => {
		const resolveWallet = renderHook();

		expect(resolveWallet({ address: OWNER, env: "Mainnet" })).toBeUndefined();
	});

	it("returns the explicit Privy signer only for an embedded-wallet intent", () => {
		testState.walletIntent = "embedded";
		const resolveWallet = renderHook();

		expect(resolveWallet({ address: OWNER, env: "Mainnet" })).toEqual({ kind: "embedded-signer" });
	});

	it("revalidates the exact embedded wallet after the Privy signature completes", () => {
		testState.walletIntent = "embedded";
		const resolveWallet = renderHook();
		resolveWallet({ address: OWNER, env: "Mainnet" });
		const guard = testState.legalSignerOptions?.beforeSubmit;
		if (!guard) throw new Error("Post-sign wallet guard was not registered");

		testState.connectedWalletAddress = OTHER_OWNER;
		renderHook();

		expect(() => guard()).toThrow("The email wallet changed before terms acceptance.");
	});
});
