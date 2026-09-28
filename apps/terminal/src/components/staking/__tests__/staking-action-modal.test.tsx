// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { i18n } from "@lingui/core";
import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createI18nRoot } from "@/lib/tests/harness/react";
import { StakingActionModal } from "../staking-action-modal";

const OWNER = "0x1111111111111111111111111111111111111111" as const;
const EXCEEDS_BALANCE = "Amount exceeds the verified available balance.";
const EXCEEDS_BALANCE_ZH = "金额超过已验证的可用余额。";

function messageId(message: string): string {
	return createHash("sha256").update(`${message}\x1f`).digest("base64").slice(0, 6);
}

function changeInput(input: HTMLInputElement, value: string) {
	const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
	setter?.call(input, value);
	input.dispatchEvent(new Event("input", { bubbles: true }));
}

function amountInput(): HTMLInputElement {
	const input = document.body.querySelector<HTMLInputElement>('input[inputmode="decimal"]');
	if (!input) throw new Error("Missing amount input");
	return input;
}

function button(label: string): HTMLButtonElement {
	const match = [...document.body.querySelectorAll("button")].find((candidate) => candidate.textContent === label);
	if (!match) throw new Error(`Missing button: ${label}`);
	return match;
}

describe("StakingActionModal amount errors", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		Object.defineProperty(window, "matchMedia", {
			configurable: true,
			value: vi.fn().mockReturnValue({ addEventListener: vi.fn(), matches: false, removeEventListener: vi.fn() }),
		});
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		i18n.loadAndActivate({ locale: "en", messages: {} });
	});

	function renderModal(maxAmount: string) {
		act(() =>
			root.render(
				<StakingActionModal
					action={{ kind: "cDeposit", maxAmount }}
					ownerAddress={OWNER}
					open
					isMobile={false}
					onOpenChange={vi.fn()}
					onSubmit={vi.fn()}
				/>,
			),
		);
	}

	it.each([
		["", "8", "Enter an amount."],
		["1.123456789", "8", "Use a valid HYPE amount with no more than eight decimal places."],
		["0", "8", "Amount must be greater than zero."],
		["9", "8", EXCEEDS_BALANCE],
		["100000000", "1000000000", "Amount is too large to submit safely."],
	])("explains why %s cannot be reviewed", (amount, maxAmount, message) => {
		renderModal(maxAmount);
		act(() => changeInput(amountInput(), amount));
		act(() => button("Review").click());

		expect(document.body.textContent).toContain(message);
	});

	it("translates the visible amount error when the language changes", () => {
		renderModal("8");
		const input = amountInput();
		act(() => changeInput(input, "9"));
		act(() => button("Review").click());
		expect(document.body.textContent).toContain(EXCEEDS_BALANCE);

		act(() => i18n.loadAndActivate({ locale: "zh", messages: { [messageId(EXCEEDS_BALANCE)]: EXCEEDS_BALANCE_ZH } }));

		expect(document.body.textContent).toContain(EXCEEDS_BALANCE_ZH);
		expect(document.body.textContent).not.toContain(EXCEEDS_BALANCE);
		expect(amountInput()).toBe(input);
		expect(input.value).toBe("9");
	});
});
