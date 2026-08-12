// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WithdrawForm } from "@/components/trade/tradebox/deposit/withdraw-form";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("WithdrawForm UI", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("keeps dynamic withdrawal data and actions in the redesigned form", async () => {
		const onAmountChange = vi.fn();
		const onDestinationChange = vi.fn();
		const onSubmit = vi.fn();

		await act(async () => {
			root.render(
				<I18nProvider i18n={i18n}>
					<WithdrawForm
						amount="2.5"
						onAmountChange={onAmountChange}
						destination="0x1111111111111111111111111111111111111111"
						onDestinationChange={onDestinationChange}
						destinationRequired
						destinationError={null}
						available="12.34"
						maxAmount="12.34"
						route="arbitrum-cctp"
						routingStatus="ready"
						routeChanged={false}
						routeFee="0.2"
						activationFee="1"
						showActivationFee
						prerequisitesPending={false}
						prerequisiteError={null}
						canRetryPrerequisites={false}
						onRetryPrerequisites={vi.fn()}
						validation={{ valid: true, error: null }}
						canSubmit
						isPending={false}
						onSubmit={onSubmit}
					/>
				</I18nProvider>,
			);
		});

		const form = container.firstElementChild as HTMLElement;
		expect(form.className).toContain("font-market-close");
		expect(form.querySelector("h3")?.textContent).toBe("Withdraw USDC");
		expect(form.querySelector('[aria-hidden="true"]')?.className).toContain("size-10");

		const comboboxes = Array.from(form.querySelectorAll<HTMLButtonElement>('[role="combobox"]'));
		expect(comboboxes).toHaveLength(2);
		expect(comboboxes.every((combobox) => combobox.disabled)).toBe(true);

		const amountInput = form.querySelector<HTMLInputElement>('input[placeholder="0.00"]');
		expect(amountInput?.value).toBe("2.5");
		expect(amountInput?.getAttribute("aria-invalid")).toBeNull();

		const maxButton = Array.from(form.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
			button.textContent?.includes("Max: 12.34"),
		);
		expect(maxButton).toBeDefined();
		act(() => maxButton?.click());
		expect(onAmountChange).toHaveBeenCalledWith("12.34");

		expect(form.textContent).toContain("$0.20");
		expect(form.textContent).toContain("$1.00");
		expect(form.textContent).toContain("$2.30");

		const submitButton = Array.from(form.querySelectorAll<HTMLButtonElement>("button")).find(
			(button) => button.textContent === "Withdraw to Arbitrum",
		);
		expect(submitButton?.disabled).toBe(false);
		expect(submitButton?.className).toContain("min-h-11");
		act(() => submitButton?.click());
		expect(onSubmit).toHaveBeenCalledOnce();
	});
});
