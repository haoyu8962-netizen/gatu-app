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
	balanceError: null,
	validation: { valid: true, error: null },
	amountError: null,
	isPending: false,
	onSubmit: vi.fn(),
};

describe("deposit AmountInput accessibility", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
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
});
