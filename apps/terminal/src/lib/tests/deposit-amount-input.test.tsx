// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AmountInput } from "@/components/trade/tradebox/deposit/amount-input";
import { createI18nRoot } from "./harness/react";

const defaultProps = {
	amount: "",
	onAmountChange: vi.fn(),
	maxAmount: "10",
	balance: "10.00",
	balanceStatus: "success" as const,
	validation: { valid: true, error: null },
	amountError: null,
	isPending: false,
	onSubmit: vi.fn(),
};

describe("deposit AmountInput accessibility", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		vi.clearAllMocks();
		i18n.loadAndActivate({ locale: "en", messages: {} });
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("associates a visible validation helper with the invalid amount input", () => {
		act(() => {
			root.render(
				createElement(AmountInput, {
					...defaultProps,
					validation: { valid: false, error: "Enter a valid deposit amount" },
					amountError: "Enter a valid deposit amount",
				}),
			);
		});

		const input = container.querySelector("input");
		expect(input?.getAttribute("aria-invalid")).toBe("true");
		const helperId = input?.getAttribute("aria-describedby");
		expect(helperId).toBeTruthy();
		const helper = helperId ? document.getElementById(helperId) : null;
		expect(helper?.getAttribute("role")).toBe("alert");
		expect(helper?.textContent).toContain("Enter a valid deposit amount");
	});

	it("disables submission for an operational error without marking the amount as invalid", () => {
		act(() => {
			root.render(
				createElement(AmountInput, {
					...defaultProps,
					validation: { valid: false, error: "The deposit route is unavailable" },
				}),
			);
		});

		const input = container.querySelector("input");
		expect(input?.hasAttribute("aria-describedby")).toBe(false);
		expect(input?.hasAttribute("aria-invalid")).toBe(false);
		const submitButton = [...container.querySelectorAll("button")].find((button) => button.textContent === "Deposit");
		expect(submitButton?.disabled).toBe(true);
		expect(container.querySelector('[role="alert"]')).toBeNull();
	});

	it("does not expose a description, invalid state, or alert without an error", () => {
		act(() => root.render(createElement(AmountInput, defaultProps)));

		const input = container.querySelector("input");
		expect(input?.hasAttribute("aria-describedby")).toBe(false);
		expect(input?.hasAttribute("aria-invalid")).toBe(false);
		expect(container.querySelector('[role="alert"]')).toBeNull();
	});

	it.each(["idle", "loading", "error"] as const)(
		"keeps %s quiet and preserves the draft through recovery",
		(balanceStatus) => {
			const props = { ...defaultProps, amount: "7.123456", balanceStatus, amountError: "Insufficient balance" };
			act(() => root.render(createElement(AmountInput, props)));
			const input = container.querySelector("input");
			const submit = [...container.querySelectorAll("button")].find((button) => button.textContent === "Deposit");
			expect(input?.value).toBe("7.123456");
			expect(input?.disabled).toBe(true);
			expect(submit?.disabled).toBe(true);
			expect(container.querySelector('[role="alert"]')).toBeNull();
			expect(container.textContent).toContain("-- USDC");
			expect(container.textContent).not.toMatch(/Loading|Unavailable|Insufficient balance/);
			act(() => submit?.click());
			expect(defaultProps.onSubmit).not.toHaveBeenCalled();
			act(() => root.render(createElement(AmountInput, { ...props, balanceStatus: "success", amountError: null })));
			expect(container.querySelector("input")).toBe(input);
			expect(input?.value).toBe("7.123456");
			expect(input?.disabled).toBe(false);
			expect(submit?.disabled).toBe(false);
			expect(container.textContent).toContain("10.00 USDC");
		},
	);
});
