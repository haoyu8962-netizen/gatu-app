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
		isSignerReady: true,
		isApprovalLoading: false,
		isBalanceLoading: false,
		isConnected: true,
		isSubmitting: false,
		onConnectWallet: vi.fn(),
		onDeposit: vi.fn(),
		onRegister: vi.fn(),
		onSubmit: vi.fn(),
		registerStatus: "idle",
		side: "buy",
		sideLabel: "Buy",
		validation: { canSubmit: false, errors: [], validationErrors: [], needsApproval: false, valid: false },
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

	it.each(["desktop", "mobile"] as const)(
		"offers deposit without Agent setup for a ready email signer on %s, preserving funding and fee gates",
		(surface) => {
			let input = createDesktopInput({
				canDeposit: true,
				depositUnavailableReason: null,
				validation: { canSubmit: false, errors: [], validationErrors: [], needsApproval: true, valid: false },
			});
			function content(): ButtonContent {
				if (surface === "desktop") return renderDesktop(input);
				return getMobileOrderButtonContent({
					...input,
					hasBalanceError: input.hasBalanceError === true,
					isBalanceLoading: input.isBalanceLoading === true,
					canSubmit: input.validation.canSubmit,
					needsApproval: input.validation.needsApproval,
					isRegistering: false,
					onApprove: input.onRegister,
					onConnect: input.onConnectWallet,
					labels: {
						connect: "Connect Wallet",
						deposit: "Deposit",
						enableTrading: "Enable Trading",
						signing: "Signing...",
					},
				});
			}

			expect(content()).toMatchObject({ text: "Deposit", disabled: false });
			content().action();
			expect(input.onDeposit).toHaveBeenCalledOnce();
			expect(input.onRegister).not.toHaveBeenCalled();

			input = { ...input, isBalanceLoading: true };
			expect(content().disabled).toBe(true);
			content().action();
			expect(input.onDeposit).toHaveBeenCalledOnce();
			expect(input.onRegister).not.toHaveBeenCalled();

			input = { ...input, isBalanceLoading: false, availableBalance: 100 };
			expect(content()).toMatchObject({ text: "Enable Trading", disabled: false });
			content().action();
			expect(input.onRegister).toHaveBeenCalledOnce();
			expect(input.onSubmit).not.toHaveBeenCalled();

			input = { ...input, validation: { ...input.validation, needsApproval: false, canSubmit: true, valid: true } };
			expect(content().disabled).toBe(false);
			content().action();
			expect(input.onSubmit).toHaveBeenCalledOnce();
		},
	);

	it("keeps explicit signer setup reachable before the funding snapshot resolves", () => {
		const input = createDesktopInput({
			isSignerReady: false,
			isBalanceLoading: true,
			validation: { canSubmit: false, errors: [], validationErrors: [], needsApproval: true, valid: false },
		});
		const content = renderDesktop(input);
		expect(content).toMatchObject({ text: "Enable Trading", disabled: false });
		content.action();
		expect(input.onRegister).toHaveBeenCalledOnce();
		expect(input.onSubmit).not.toHaveBeenCalled();
		expect(input.onDeposit).not.toHaveBeenCalled();
	});

	it("keeps a pending approval inert with the desktop-required reason in an Agent-only session", () => {
		const reason = "Approve trading with the master wallet on desktop first.";
		const input = createDesktopInput({
			availableBalance: 100,
			canApprove: false,
			approvalUnavailableReason: reason,
			validation: { canSubmit: false, errors: [], validationErrors: [], needsApproval: true, valid: false },
		});
		const desktop = renderDesktop(input);
		expect(desktop).toMatchObject({ text: "Enable Trading", disabled: true, disabledReason: reason });

		const mobile = getMobileOrderButtonContent({
			...input,
			hasBalanceError: false,
			isBalanceLoading: false,
			canSubmit: false,
			needsApproval: true,
			isRegistering: false,
			onApprove: input.onRegister,
			onConnect: input.onConnectWallet,
			labels: { connect: "Connect Wallet", deposit: "Deposit", enableTrading: "Enable Trading", signing: "Signing..." },
		});
		expect(mobile).toMatchObject({ text: "Enable Trading", disabled: true, disabledReason: reason });
		expect(renderDesktop({ ...input, canApprove: true }).disabledReason).toBeUndefined();
	});

	it.each(["loading", "error", "blocked"])("keeps the desktop action label quiet during %s and recovery", (state) => {
		const input = createDesktopInput({
			availableBalance: 100,
			validation: { canSubmit: true, errors: [], validationErrors: [], needsApproval: false, valid: true },
		});
		const pending = renderDesktop({
			...input,
			isBalanceLoading: state === "loading",
			hasBalanceError: state === "error",
			tradingBlocked: state === "blocked",
		});
		expect(pending).toMatchObject({ text: "Place Buy Order", disabled: true });
		expect(pending.disabledReason).toBeUndefined();
		expect(input.onSubmit).not.toHaveBeenCalled();
		const ready = renderDesktop(input);
		expect(ready).toMatchObject({ text: "Place Buy Order", disabled: false });
	});

	it("keeps the desktop CTA inert and exposes the unavailable reason", () => {
		const input = createDesktopInput();
		const content = renderDesktop(input);

		expect(content).toMatchObject({
			disabled: true,
			disabledReason: UNAVAILABLE_REASON,
			text: "Deposit",
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
			isSignerReady: true,
			isApprovalLoading: false,
			isBalanceLoading: false,
			isConnected: true,
			isRegistering: false,
			isSubmitting: false,
			labels: {
				connect: "Connect Wallet",
				deposit: "Deposit",
				enableTrading: "Enable Trading",
				signing: "Signing...",
			},
			needsApproval: false,
			onApprove: vi.fn(),
			onConnect: vi.fn(),
			onDeposit,
			onSubmit: vi.fn(),
			side: "buy",
			sideLabel: "Buy",
		});

		expect(content).toMatchObject({
			disabled: true,
			disabledReason: UNAVAILABLE_REASON,
			text: "Deposit",
		});
		content.action();
		expect(onDeposit).not.toHaveBeenCalled();
	});

	it("keeps Connect Wallet actionable while unresolved geo blocks later desktop actions", () => {
		const connectInput = createDesktopInput({
			isConnected: false,
			tradingBlocked: true,
		});
		const connectContent = renderDesktop(connectInput);
		expect(connectContent).toMatchObject({ disabled: false, text: "Connect Wallet" });
		expect(connectContent.disabledReason).toBeUndefined();

		const orderContent = renderDesktop(
			createDesktopInput({
				availableBalance: 10,
				tradingBlocked: true,
				validation: { canSubmit: true, errors: [], validationErrors: [], needsApproval: false, valid: true },
			}),
		);
		expect(orderContent).toMatchObject({
			disabled: true,
			text: "Place Buy Order",
		});
		expect(orderContent.disabledReason).toBeUndefined();
	});

	it("keeps Connect Wallet actionable while unresolved geo blocks later mobile actions", () => {
		const baseInput = {
			availableBalance: 0,
			canApprove: true,
			canDeposit: false,
			canSubmit: false,
			hasBalanceError: false,
			isSignerReady: true,
			isApprovalLoading: false,
			isBalanceLoading: false,
			isRegistering: false,
			isSubmitting: false,
			labels: {
				connect: "Connect Wallet",
				deposit: "Deposit",
				enableTrading: "Enable Trading",
				signing: "Signing...",
			},
			needsApproval: false,
			onApprove: vi.fn(),
			onConnect: vi.fn(),
			onDeposit: vi.fn(),
			onSubmit: vi.fn(),
			side: "buy" as const,
			sideLabel: "Buy",
			tradingBlocked: true,
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
		expect(orderContent).toMatchObject({ disabled: true, text: "Buy" });
		expect(orderContent.disabledReason).toBeUndefined();
	});
});
