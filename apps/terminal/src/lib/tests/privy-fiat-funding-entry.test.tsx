// @vitest-environment jsdom

import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createI18nRoot } from "./harness/react";

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

import { PrivyFiatFundingEntry } from "@/components/trade/tradebox/deposit/privy-fiat-funding-entry";
import { getPrivyFiatFundingOwnerKey } from "@/domain/trade/privy-fiat-funding";
import {
	isCurrentPrivyFiatFundingAttempt,
	type PrivyFiatFundingAttempt,
	readPrivyFiatFundingAttempt,
	requestPrivyFiatFunding,
	resetPrivyFiatFundingStore,
} from "@/stores/use-privy-fiat-funding-store";

describe("PrivyFiatFundingEntry", () => {
	let container: HTMLDivElement;
	let root: Root;
	const onBeforeStart = vi.fn();

	beforeEach(() => {
		testState.clientKey = OWNER.toLowerCase();
		testState.sessionMode = "wallet";
		testState.isTestnet = false;
		testState.wallets = [{ address: OWNER }];
		testState.walletSession = { walletAddress: OWNER, walletIntent: "embedded" };
		resetPrivyFiatFundingStore();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.clearAllMocks();
	});

	function render(props: { available?: boolean; embeddedWalletAddress?: string } = {}) {
		act(() =>
			root.render(
				createElement(PrivyFiatFundingEntry, {
					available: props.available ?? true,
					embeddedWalletAddress: "embeddedWalletAddress" in props ? props.embeddedWalletAddress : OWNER,
					onBeforeStart,
				}),
			),
		);
	}

	function button() {
		return [...container.querySelectorAll("button")].find((element) => element.textContent === "Buy USDC");
	}

	it("closes the deposit dialog first, then requests funding for the exact embedded owner", () => {
		const attemptsAtClose: (PrivyFiatFundingAttempt | null)[] = [];
		onBeforeStart.mockImplementation(() => attemptsAtClose.push(readPrivyFiatFundingAttempt()));
		render();
		expect(container.querySelector("[data-deposit-slot='fiat-funding']")?.getAttribute("data-wallet-kind")).toBe(
			"embedded",
		);
		expect(container.textContent).not.toContain("ETH on Arbitrum");

		act(() => button()?.click());

		expect(attemptsAtClose).toEqual([null]);
		expect(readPrivyFiatFundingAttempt()).toEqual({
			destination: { address: OWNER, walletKind: "embedded" },
			network: "mainnet",
			ownerKey: getPrivyFiatFundingOwnerKey("mainnet", OWNER),
		});
	});

	it("offers an external owner the purchase with the Arbitrum gas note", () => {
		testState.walletSession = { walletAddress: OWNER, walletIntent: "external" };
		render({ embeddedWalletAddress: undefined });

		expect(container.querySelector("[data-deposit-slot='fiat-funding']")?.getAttribute("data-wallet-kind")).toBe(
			"external",
		);
		expect(container.textContent).toContain("Depositing it needs a little ETH on Arbitrum for network fees.");
	});

	it.each([
		[
			"the owner is not the selected Hyperliquid user",
			() => {
				testState.clientKey = OTHER;
			},
		],
		[
			"the session is agent-only",
			() => {
				testState.sessionMode = "agent-only";
			},
		],
		[
			"Privy does not list the owner wallet",
			() => {
				testState.wallets = [{ address: OTHER }];
			},
		],
	])("renders nothing when %s", (_label, arrange) => {
		arrange();
		render();

		expect(container.innerHTML).toBe("");
	});

	it("renders nothing for an email session whose embedded wallet is not the owner", () => {
		render({ embeddedWalletAddress: OTHER });

		expect(container.innerHTML).toBe("");
	});

	it("keeps the action disabled while funding actions are unavailable", () => {
		render({ available: false });
		act(() => button()?.click());

		expect(button()?.disabled).toBe(true);
		expect(onBeforeStart).not.toHaveBeenCalled();
	});

	it("keeps the action disabled while another card purchase is open", () => {
		const open: PrivyFiatFundingAttempt = {
			destination: { address: OWNER, walletKind: "embedded" },
			network: "mainnet",
			ownerKey: getPrivyFiatFundingOwnerKey("mainnet", OWNER),
		};
		act(() => {
			requestPrivyFiatFunding(open);
		});
		render();
		act(() => button()?.click());

		expect(button()?.disabled).toBe(true);
		expect(onBeforeStart).not.toHaveBeenCalled();
		expect(isCurrentPrivyFiatFundingAttempt(open)).toBe(true);
	});
});
