// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const OWNER = "0xabcdefabcdefabcdefabcdefabcdefabcdef1234";
const OTHER = "0x2222222222222222222222222222222222222222";

const testState = vi.hoisted(() => ({
	clientKey: "",
	sessionMode: "wallet" as "agent-only" | "disconnected" | "wallet",
	isTestnet: false,
	wallets: [] as { address: string }[],
	walletSession: {
		walletAddress: undefined as string | undefined,
		walletIntent: "embedded" as "ambiguous" | "embedded" | "external" | "unavailable",
	},
}));

vi.mock("@privy-io/react-auth", () => ({ useWallets: () => ({ ready: true, wallets: testState.wallets }) }));
vi.mock("@/hooks/wallet/use-wallet-session", () => ({ useWalletSession: () => testState.walletSession }));
vi.mock("@/lib/hyperliquid", () => ({
	useHyperliquid: () => ({ clientKey: testState.clientKey, sessionMode: testState.sessionMode }),
}));
vi.mock("@/stores/use-global-settings-store", () => ({ useIsTestnet: () => testState.isTestnet }));

import { getPrivyFiatFundingOwnerKey } from "@/domain/trade/privy-fiat-funding";
import { type PrivyFiatFundingOffer, usePrivyFiatFundingOffer } from "@/hooks/trade/use-privy-fiat-funding-offer";
import {
	isCurrentPrivyFiatFundingAttempt,
	type PrivyFiatFundingAttempt,
	readPrivyFiatFundingAttempt,
	requestPrivyFiatFunding,
	resetPrivyFiatFundingStore,
} from "@/stores/use-privy-fiat-funding-store";

describe("usePrivyFiatFundingOffer", () => {
	let container: HTMLDivElement;
	let root: Root;
	let offer: PrivyFiatFundingOffer | null;
	const onBeforeStart = vi.fn();

	function Probe(props: { enabled: boolean; available: boolean; embeddedWalletAddress: string | undefined }) {
		offer = usePrivyFiatFundingOffer({ ...props, onBeforeStart });
		return null;
	}

	function render(props: { enabled?: boolean; available?: boolean; embeddedWalletAddress?: string } = {}) {
		act(() =>
			root.render(
				createElement(Probe, {
					enabled: props.enabled ?? true,
					available: props.available ?? true,
					embeddedWalletAddress: "embeddedWalletAddress" in props ? props.embeddedWalletAddress : OWNER,
				}),
			),
		);
	}

	beforeEach(() => {
		testState.clientKey = OWNER.toLowerCase();
		testState.sessionMode = "wallet";
		testState.isTestnet = false;
		testState.wallets = [{ address: OWNER }];
		testState.walletSession = { walletAddress: OWNER, walletIntent: "embedded" };
		resetPrivyFiatFundingStore();
		offer = null;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.clearAllMocks();
	});

	it("closes the caller first, then requests funding for the exact embedded owner", () => {
		const attemptsAtClose: (PrivyFiatFundingAttempt | null)[] = [];
		onBeforeStart.mockImplementation(() => attemptsAtClose.push(readPrivyFiatFundingAttempt()));
		render();
		expect(offer).toMatchObject({ walletKind: "embedded", disabled: false });

		act(() => offer?.start());

		expect(attemptsAtClose).toEqual([null]);
		expect(readPrivyFiatFundingAttempt()).toEqual({
			destination: { address: OWNER, walletKind: "embedded" },
			network: "mainnet",
			ownerKey: getPrivyFiatFundingOwnerKey("mainnet", OWNER),
		});
	});

	it("offers an external owner and keys a testnet attempt by network", () => {
		testState.walletSession = { walletAddress: OWNER, walletIntent: "external" };
		testState.isTestnet = true;
		render({ embeddedWalletAddress: undefined });
		expect(offer?.walletKind).toBe("external");

		act(() => offer?.start());

		expect(readPrivyFiatFundingAttempt()).toMatchObject({
			network: "testnet",
			ownerKey: getPrivyFiatFundingOwnerKey("testnet", OWNER),
		});
	});

	it.each([
		[
			"the build flag is off",
			() => {
				testState.clientKey = OWNER.toLowerCase();
			},
			{ enabled: false },
		],
		[
			"the owner is not the selected Hyperliquid user",
			() => {
				testState.clientKey = OTHER;
			},
			{},
		],
		[
			"the session is agent-only",
			() => {
				testState.sessionMode = "agent-only";
			},
			{},
		],
		[
			"Privy does not list the owner wallet",
			() => {
				testState.wallets = [{ address: OTHER }];
			},
			{},
		],
		["the embedded wallet is not the owner", () => {}, { embeddedWalletAddress: OTHER }],
	])("offers nothing when %s", (_label, arrange, props) => {
		arrange();
		render(props);

		expect(offer).toBeNull();
	});

	it("stays disabled and requests nothing while funding actions are unavailable", () => {
		render({ available: false });
		expect(offer?.disabled).toBe(true);

		act(() => offer?.start());

		expect(onBeforeStart).not.toHaveBeenCalled();
		expect(readPrivyFiatFundingAttempt()).toBeNull();
	});

	it("stays disabled while another card purchase is open", () => {
		const open: PrivyFiatFundingAttempt = {
			destination: { address: OWNER, walletKind: "embedded" },
			network: "mainnet",
			ownerKey: getPrivyFiatFundingOwnerKey("mainnet", OWNER),
		};
		act(() => {
			requestPrivyFiatFunding(open);
		});
		render();
		expect(offer?.disabled).toBe(true);

		act(() => offer?.start());

		expect(onBeforeStart).not.toHaveBeenCalled();
		expect(isCurrentPrivyFiatFundingAttempt(open)).toBe(true);
	});
});
