// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WithdrawForm } from "@/components/trade/tradebox/deposit/withdraw-form";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("WithdrawForm UI", () => {
	let container: HTMLDivElement;
	let root: Root;
	async function renderForm(overrides: Partial<ComponentProps<typeof WithdrawForm>> = {}) {
		const props: ComponentProps<typeof WithdrawForm> = {
			amount: "2.50",
			onAmountChange: vi.fn(),
			destination: "",
			onDestinationChange: vi.fn(),
			destinationRequired: false,
			destinationError: null,
			available: "12.34",
			maxAmount: "12.34",
			route: "arbitrum-cctp",
			routingStatus: "ready",
			routeChanged: false,
			routeFee: "0.20",
			activationFee: "0",
			showActivationFee: false,
			prerequisitesPending: false,
			prerequisiteError: null,
			canRetryPrerequisites: false,
			onRetryPrerequisites: vi.fn(),
			validation: { valid: true, error: null },
			canSubmit: true,
			isPending: false,
			onSubmit: vi.fn(),
			...overrides,
		};
		await act(async () => {
			root.render(
				<I18nProvider i18n={i18n}>
					<WithdrawForm {...props} />
				</I18nProvider>,
			);
		});
		return props;
	}

	function getButton(text: string) {
		const button = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((element) =>
			element.textContent?.startsWith(text),
		);
		expect(button).toBeDefined();
		return button as HTMLButtonElement;
	}

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
		expect(form.querySelector("h3")?.textContent).toBe("Withdraw USDC to Arbitrum");
		expect(form.querySelectorAll('[role="combobox"]')).toHaveLength(0);
		expect(form.querySelector('[data-slot="funds-route-details"]')?.textContent).toContain("Arbitrum (CCTP)");
		expect(form.textContent).toContain("Minimum");
		expect(form.textContent).toContain("Depends on network confirmation");

		const amountInput = form.querySelector<HTMLInputElement>('input[placeholder="0.00"]');
		expect(amountInput?.value).toBe("2.5");
		expect(amountInput?.getAttribute("aria-invalid")).toBeNull();
		const destinationInput = form.querySelector<HTMLInputElement>('input[aria-label="Destination address"]');
		expect(destinationInput?.dir).toBe("ltr");
		expect(destinationInput?.getAttribute("autocapitalize")).toBe("none");

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

	it.each([
		["12.349999", "12.34"],
		["999999999999.999999", "999999999999.99"],
	])("floors the exact Max balance %s to the configured two decimal places", async (maxAmount, expected) => {
		const { onAmountChange } = await renderForm({ maxAmount });
		act(() => getButton("Max:").click());
		expect(onAmountChange).toHaveBeenCalledExactlyOnceWith(expected);
	});

	it.each(["loading", "error", "unknown"] as const)(
		"keeps passive route %s quiet, preserves the draft and blocks submission until recovery",
		async (routingStatus) => {
			const pending = routingStatus === "loading";
			const props = await renderForm({ routingStatus, prerequisitesPending: pending, canSubmit: false });
			const input = container.querySelector<HTMLInputElement>('input[placeholder="0.00"]');
			expect(input?.value).toBe("2.50");
			expect(container.querySelector('[role="alert"]')).toBeNull();
			expect(container.textContent).not.toContain("Checking the current");
			expect(container.textContent).not.toContain("Unable to verify");
			expect(container.textContent).not.toContain("Processing");
			expect(container.textContent).not.toContain("Arbitrum (CCTP)");
			expect(container.textContent).not.toContain("$0.20");
			expect(container.firstElementChild?.getAttribute("aria-busy")).toBe(String(pending));
			expect(getButton("Withdraw").disabled).toBe(true);
			act(() => getButton("Withdraw").click());
			expect(props.onSubmit).not.toHaveBeenCalled();
			if (!pending) {
				act(() => getButton("Retry").click());
				expect(props.onRetryPrerequisites).toHaveBeenCalledOnce();
			}
			await renderForm({ ...props, routingStatus: "ready", prerequisitesPending: false, canSubmit: true });
			expect(container.querySelector('input[placeholder="0.00"]')).toBe(input);
			expect(input?.value).toBe("2.50");
			expect(getButton("Withdraw").disabled).toBe(false);
			expect(container.textContent).toContain("Arbitrum (CCTP)");
			expect(container.textContent).toContain("$0.20");
		},
	);

	it("offers a neutral retry for passive prerequisites and keeps its action label during refresh", async () => {
		const props = await renderForm({ canSubmit: false, canRetryPrerequisites: true });
		expect(container.querySelector('[role="alert"]')).toBeNull();
		act(() => getButton("Retry").click());
		expect(props.onRetryPrerequisites).toHaveBeenCalledOnce();
		await renderForm({ ...props, prerequisitesPending: true });
		expect(getButton("Retry").disabled).toBe(true);
		expect(getButton("Withdraw").disabled).toBe(true);
		expect(container.textContent).not.toContain("Processing");
	});

	it.each([
		{ routingPreflightFailed: true, routingStatus: "error" as const, expected: "Unable to verify the current" },
		{ routeChanged: true, expected: "The Hyperliquid withdrawal route changed" },
		{ prerequisiteError: "Withdrawal eligibility check failed after submission", expected: "Withdrawal eligibility" },
	])("retains requested-action feedback: $expected", async ({ expected, ...overrides }) => {
		await renderForm({ ...overrides, canSubmit: false });
		expect(container.querySelector('[role="alert"]')?.textContent).toContain(expected);
		expect(getButton("Withdraw").disabled).toBe(true);
	});

	it("keeps the button name and only disables it during an actual withdrawal attempt", async () => {
		const { onSubmit } = await renderForm({ isPending: true });
		expect(container.textContent).not.toContain("Processing");
		expect(container.querySelector(".animate-spin")).toBeNull();
		expect(getButton("Withdraw").disabled).toBe(true);
		act(() => getButton("Withdraw").click());
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it("preserves the exact protocol minimum instead of rounding it down", async () => {
		await renderForm({ routeFee: "0.200001" });
		expect(container.textContent).toContain("Minimum 0.400002 USDC");
	});

	it("shows the exact external owner destination read-only with a persistent label", async () => {
		const destination = "0x1111111111111111111111111111111111111111";
		await renderForm({ destination, destinationRequired: false });
		const input = container.querySelector<HTMLInputElement>('input[aria-label="Destination address"]');
		expect(input?.value).toBe(destination);
		expect(input?.readOnly).toBe(true);
		expect(input?.dir).toBe("ltr");
		expect(container.querySelector(`label[for="${input?.id}"]`)?.textContent).toBe("Destination address");
	});
});
