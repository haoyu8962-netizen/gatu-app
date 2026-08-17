// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { i18n } from "@lingui/core";
import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getMobileOrderButtonContent } from "@/components/trade/mobile/mobile-trade-view";
import type { ButtonContent } from "@/lib/trade/types";
import { type ButtonContentInput, useButtonContent } from "@/lib/trade/use-button-content";
import { createI18nRoot } from "./harness/react";

const DEPOSIT_UNAVAILABLE = "Deposit unavailable";
const UNAVAILABLE_REASON = "Deposits from external wallets are not enabled on Mainnet.";
const TRADING_UNAVAILABLE_REASON = "Checking regional availability. Trading is temporarily unavailable.";

function getMessageId(message: string): string {
	return createHash("sha256").update(`${message}\x1f`).digest("base64").slice(0, 6);
}

function createDesktopInput(overrides: Partial<ButtonContentInput> = {}): ButtonContentInput {
	return {
		availableBalance: 0,
		canApprove: true,
		canDeposit: false,
		depositUnavailableReason: UNAVAILABLE_REASON,
		hasBalanceError: false,
		isAgentReady: true,
		isApprovalLoading: false,
		isBalanceLoading: false,
		isConnected: true,
		isSubmitting: false,
		isSwitchingChain: false,
		needsChainSwitch: false,
		onConnectWallet: vi.fn(),
		onDeposit: vi.fn(),
		onRegister: vi.fn(),
		onSubmit: vi.fn(),
		registerStatus: "idle",
		side: "buy",
		sideLabel: "Buy",
		switchChain: vi.fn(),
		validation: { canSubmit: false, errors: [], needsApproval: false, valid: false },
		...overrides,
	};
}

describe("Deposit order CTA", () => {
	let container: HTMLDivElement;
	let observed: ButtonContent | null;
	let root: Root;

	beforeEach(() => {
		i18n.loadAndActivate({
			locale: "en",
			messages: {
				[getMessageId("Deposit")]: "Deposit",
				[getMessageId(DEPOSIT_UNAVAILABLE)]: DEPOSIT_UNAVAILABLE,
			},
		});
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		observed = null;
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	function DesktopProbe({ input }: { input: ButtonContentInput }) {
		observed = useButtonContent(input);
		return null;
	}

	function renderDesktop(input: ButtonContentInput): ButtonContent {
		act(() => root.render(<DesktopProbe input={input} />));
		if (!observed) throw new Error("Desktop CTA content was not observed");
		return observed;
	}

	it("keeps the desktop CTA inert and exposes the unavailable reason", () => {
		const input = createDesktopInput();
		const content = renderDesktop(input);

		expect(content).toMatchObject({
			disabled: true,
			disabledReason: UNAVAILABLE_REASON,
			text: DEPOSIT_UNAVAILABLE,
		});
		content.action();
		expect(input.onDeposit).not.toHaveBeenCalled();
	});

	it("keeps the mobile CTA inert and exposes the unavailable reason", () => {
		const onDeposit = vi.fn();
		const content = getMobileOrderButtonContent({
			availableBalance: 0,
			canApprove: true,
			canDeposit: false,
			canSubmit: false,
			depositUnavailableReason: UNAVAILABLE_REASON,
			hasBalanceError: false,
			isAgentReady: true,
			isApprovalLoading: false,
			isBalanceLoading: false,
			isConnected: true,
			isRegistering: false,
			isSubmitting: false,
			isSwitchingChain: false,
			labels: {
				balanceError: "Failed to load balances.",
				connect: "Connect Wallet",
				deposit: "Deposit",
				depositUnavailable: DEPOSIT_UNAVAILABLE,
				enableTrading: "Enable Trading",
				loading: "Loading...",
				signing: "Signing...",
				switchChain: "Switch to Arbitrum",
				switching: "Switching...",
			},
			needsApproval: false,
			needsChainSwitch: false,
			onApprove: vi.fn(),
			onConnect: vi.fn(),
			onDeposit,
			onSubmit: vi.fn(),
			onSwitchChain: vi.fn(),
			side: "buy",
			sideLabel: "Buy",
		});

		expect(content).toMatchObject({
			disabled: true,
			disabledReason: UNAVAILABLE_REASON,
			text: DEPOSIT_UNAVAILABLE,
		});
		content.action();
		expect(onDeposit).not.toHaveBeenCalled();
	});

	it("keeps Connect Wallet actionable while unresolved geo blocks later desktop actions", () => {
		const connectInput = createDesktopInput({
			isConnected: false,
			tradingUnavailableReason: TRADING_UNAVAILABLE_REASON,
		});
		const connectContent = renderDesktop(connectInput);
		expect(connectContent).toMatchObject({ disabled: false, text: "Connect Wallet" });
		expect(connectContent.disabledReason).toBeUndefined();

		const orderContent = renderDesktop(
			createDesktopInput({
				availableBalance: 10,
				tradingUnavailableReason: TRADING_UNAVAILABLE_REASON,
				validation: { canSubmit: true, errors: [], needsApproval: false, valid: true },
			}),
		);
		expect(orderContent).toMatchObject({
			disabled: true,
			disabledReason: TRADING_UNAVAILABLE_REASON,
			text: "Place Buy Order",
		});
	});

	it("keeps Connect Wallet actionable while unresolved geo blocks later mobile actions", () => {
		const baseInput = {
			availableBalance: 0,
			canApprove: true,
			canDeposit: false,
			canSubmit: false,
			hasBalanceError: false,
			isAgentReady: true,
			isApprovalLoading: false,
			isBalanceLoading: false,
			isRegistering: false,
			isSubmitting: false,
			isSwitchingChain: false,
			labels: {
				balanceError: "Failed to load balances.",
				connect: "Connect Wallet",
				deposit: "Deposit",
				depositUnavailable: DEPOSIT_UNAVAILABLE,
				enableTrading: "Enable Trading",
				loading: "Loading...",
				signing: "Signing...",
				switchChain: "Switch to Arbitrum",
				switching: "Switching...",
			},
			needsApproval: false,
			needsChainSwitch: false,
			onApprove: vi.fn(),
			onConnect: vi.fn(),
			onDeposit: vi.fn(),
			onSubmit: vi.fn(),
			onSwitchChain: vi.fn(),
			side: "buy" as const,
			sideLabel: "Buy",
			tradingUnavailableReason: TRADING_UNAVAILABLE_REASON,
		};
		const connectContent = getMobileOrderButtonContent({ ...baseInput, isConnected: false });
		expect(connectContent).toMatchObject({ disabled: false, text: "Connect Wallet" });
		expect(connectContent.disabledReason).toBeUndefined();

		const orderContent = getMobileOrderButtonContent({
			...baseInput,
			availableBalance: 10,
			canSubmit: true,
			isConnected: true,
		});
		expect(orderContent).toMatchObject({
			disabled: true,
			disabledReason: TRADING_UNAVAILABLE_REASON,
			text: "Buy",
		});
	});
});
