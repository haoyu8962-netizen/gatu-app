// @vitest-environment jsdom

import type { HyperliquidOwnerSigner } from "@sairn/hl-react";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useExplicitTermsAcceptance } from "@/hooks/wallet/use-explicit-terms-acceptance";

const OWNER = "0x1111111111111111111111111111111111111111" as const;
const OTHER_OWNER = "0x2222222222222222222222222222222222222222" as const;

const testState = vi.hoisted(() => ({
	resolveWallet: undefined as ((params: { address: `0x${string}`; env: "Mainnet" | "Testnet" }) => unknown) | undefined,
	assertSigningSessionCurrent: undefined as
		| ((params: { address: `0x${string}`; env: "Mainnet" | "Testnet" }) => void)
		| undefined,
	ownerSigner: null as HyperliquidOwnerSigner | null,
	walletIntent: "external" as "ambiguous" | "embedded" | "external" | "unavailable",
	connectedWalletAddress: "0x1111111111111111111111111111111111111111" as `0x${string}` | undefined,
	embeddedWalletAddress: "0x1111111111111111111111111111111111111111" as `0x${string}` | undefined,
	legalSignerOptions: undefined as { beforeSubmit?: () => void } | undefined,
}));

vi.mock("@sairn/hl-react", () => ({
	useHyperliquidOwnerSigner: () => testState.ownerSigner,
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
	useTermsAcceptance: (options: {
		resolveWallet?: typeof testState.resolveWallet;
		assertSigningSessionCurrent?: typeof testState.assertSigningSessionCurrent;
	}) => {
		testState.resolveWallet = options.resolveWallet;
		testState.assertSigningSessionCurrent = options.assertSigningSessionCurrent;
		return { mutate: vi.fn() };
	},
}));

vi.mock("@/lib/wallet/privy-legal-signer", () => ({
	createPrivyLegalSigner: (options: { beforeSubmit?: () => void }) => {
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
		testState.assertSigningSessionCurrent = undefined;
		testState.ownerSigner = {
			ownerAddress: OWNER,
			wallet: { getAddresses: async () => [OWNER], getChainId: async () => 42161, signTypedData: vi.fn() },
			assertCurrent: vi.fn(),
		};
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
		testState.ownerSigner = null;
		const resolveWallet = renderHook();

		expect(resolveWallet({ address: OWNER, env: "Mainnet" })).toBeUndefined();
	});

	it("returns the explicit Privy signer only for an embedded-wallet intent", () => {
		testState.walletIntent = "embedded";
		const resolveWallet = renderHook();

		expect(resolveWallet({ address: OWNER, env: "Mainnet" })).toEqual({ kind: "embedded-signer" });
		expect(testState.ownerSigner?.assertCurrent).toHaveBeenCalledOnce();
	});

	it("fails closed for email terms acceptance without an owner provider", () => {
		testState.ownerSigner = null;
		testState.walletIntent = "embedded";
		const resolveWallet = renderHook();

		expect(() => resolveWallet({ address: OWNER, env: "Mainnet" })).toThrow(
			"exact email signing session is unavailable",
		);
		expect(testState.legalSignerOptions).toBeUndefined();
	});

	it("fails closed while the owner provider has no usable wallet", () => {
		testState.ownerSigner = { ownerAddress: OWNER, wallet: null, assertCurrent: vi.fn() };
		testState.walletIntent = "embedded";
		const resolveWallet = renderHook();

		expect(() => resolveWallet({ address: OWNER, env: "Mainnet" })).toThrow(
			"exact email signing session is unavailable",
		);
		expect(testState.legalSignerOptions).toBeUndefined();
	});

	it("invalidates both the signing and final submission guards after same-owner reauthentication", () => {
		testState.walletIntent = "embedded";
		let epoch = 1;
		const assertOriginal = vi.fn(() => {
			if (epoch !== 1) throw new Error("owner session changed");
		});
		if (!testState.ownerSigner) throw new Error("Owner fixture missing");
		testState.ownerSigner.assertCurrent = assertOriginal;
		const resolveWallet = renderHook();
		resolveWallet({ address: OWNER, env: "Mainnet" });
		const signingGuard = testState.legalSignerOptions?.beforeSubmit;
		const submissionGuard = testState.assertSigningSessionCurrent;

		testState.ownerSigner = null;
		epoch += 1;
		renderHook();
		testState.ownerSigner = {
			ownerAddress: OWNER,
			wallet: { getAddresses: async () => [OWNER], getChainId: async () => 42161, signTypedData: vi.fn() },
			assertCurrent: vi.fn(),
		};
		const currentResolver = renderHook();

		expect(() => signingGuard?.()).toThrow("owner session changed");
		expect(() => submissionGuard?.({ address: OWNER, env: "Mainnet" })).toThrow("owner session changed");
		expect(currentResolver({ address: OWNER, env: "Mainnet" })).toEqual({ kind: "embedded-signer" });
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
