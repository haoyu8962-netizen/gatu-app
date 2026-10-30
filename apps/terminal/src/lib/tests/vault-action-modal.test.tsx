// @vitest-environment jsdom

import type { ReactNode } from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VaultActionModal, type VaultActionModalProps } from "@/components/vaults/vault-action-modal";
import { notifyNumberFormatChange } from "@/lib/number-format-reactivity";
import { createI18nRoot } from "./harness/react";

const numberFormatSetting = vi.hoisted(() => ({ locale: "en-US" }));

vi.mock("@/stores/use-global-settings-store", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/stores/use-global-settings-store")>()),
	getResolvedFormatLocale: () => numberFormatSetting.locale,
}));

vi.mock("@sairn/ui", () => ({
	AdaptiveModal: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	Button: ({ children, disabled, onClick }: { children: ReactNode; disabled?: boolean; onClick?: () => void }) => (
		<button type="button" disabled={disabled} onClick={onClick}>
			{children}
		</button>
	),
	ModalContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	ModalDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
	ModalFooter: ({ children }: { children: ReactNode }) => <footer>{children}</footer>,
	ModalHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
	ModalTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
	TextInput: ({ error, hint, iconRight }: { error?: ReactNode; hint?: ReactNode; iconRight?: ReactNode }) => (
		<label>
			<input />
			{iconRight}
			<span data-testid="text-input-hint">{hint}</span>
			{error ? <span data-testid="text-input-error">{error}</span> : null}
		</label>
	),
}));

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

const VAULT = "0x2222222222222222222222222222222222222222" as const;
const OWNER = "0x1111111111111111111111111111111111111111" as const;

describe("Vault action modal", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		numberFormatSetting.locale = "en-US";
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it.each(["success", "rejected", "apiError"] as const)(
		"keeps the pending panel for a settled done/%s result that the page reports through a notification",
		(result) => {
			act(() => root.render(<VaultActionModal {...props({ result })} />));

			expect(container.querySelector('[role="status"]')).not.toBeNull();
			expect(container.querySelector('[role="status"] svg[data-brand-motion]')?.getAttribute("data-brand-motion")).toBe(
				"awaiting-result",
			);
			expect(container.querySelector('[role="alert"]')).toBeNull();
			expect(container.querySelector("footer button, button")).toBeNull();
			expect(container.textContent).not.toContain("Review again");
			expect(container.textContent).not.toContain("Vault withdrawal confirmed");
		},
	);

	it("keeps unknown results on the read-only verification path", () => {
		const onVerifyAgain = vi.fn();
		act(() => root.render(<VaultActionModal {...props({ result: "unknown", onVerifyAgain })} />));

		const verify = [...container.querySelectorAll("button")].find((button) => button.textContent === "Verify again");
		expect(verify).toBeDefined();
		expect(container.textContent).not.toContain("Review again");
		const motion = container.querySelector('[role="alert"] svg[data-brand-motion]');
		expect(motion?.getAttribute("data-brand-motion")).toBe("unknown");
		expect(motion?.getAttribute("data-tone")).toBe("attention");
		act(() => verify?.click());
		expect(onVerifyAgain).toHaveBeenCalledOnce();
	});

	it("shows exact owner and Vault addresses plus the documented lock context before signing", () => {
		act(() => root.render(<VaultActionModal {...props({ stage: "review", result: undefined })} />));

		const addressValues = [...container.querySelectorAll("dd")].filter((node) => node.textContent?.startsWith("0x"));
		expect(addressValues.map((node) => node.textContent)).toEqual([OWNER, VAULT]);
		expect(
			addressValues.every((node) => node.className.includes("break-all") && !node.className.includes("truncate")),
		).toBe(true);
		expect(container.textContent).toContain("four-day lock after the latest HLP deposit");
		expect(container.textContent).toContain("one-day lock for user Vaults");
	});

	it("fills Max from the verified amount and explains the minimum deposit", () => {
		const onAmountChange = vi.fn();
		act(() =>
			root.render(
				<VaultActionModal
					{...props({ stage: "input", result: undefined, amount: "3", belowMinimum: true, onAmountChange })}
				/>,
			),
		);

		expect(container.textContent).toContain("Minimum deposit is 5 USDC");
		const max = [...container.querySelectorAll("button")].find((button) => button.textContent === "Max");
		act(() => max?.click());
		expect(onAmountChange).toHaveBeenCalledWith("10");

		act(() => root.render(<VaultActionModal {...props({ stage: "input", result: undefined, maxAmount: null })} />));
		expect([...container.querySelectorAll("button")].find((button) => button.textContent === "Max")?.disabled).toBe(
			true,
		);
		expect(container.textContent).not.toContain("Minimum deposit is");
	});

	it("writes the verified balance, leader commission and reviewed amount with the number-format separators", () => {
		const hint = () => container.querySelector('[data-testid="text-input-hint"]')?.textContent;
		act(() =>
			root.render(<VaultActionModal {...props({ stage: "input", result: undefined, availableAmount: "12345.678" })} />),
		);
		expect(hint()).toBe("Verified wallet balance: $12,345.68");

		numberFormatSetting.locale = "de-DE";
		act(() => notifyNumberFormatChange());
		expect(hint()).toBe("Verified wallet balance: $12.345,68");

		act(() => root.render(<VaultActionModal {...props({ stage: "review", result: undefined, amount: "1234.5 " })} />));
		const commission = [...container.querySelectorAll("dt")].find((term) => term.textContent === "Leader commission");
		expect(commission?.nextElementSibling?.textContent).toBe("10,00%");
		const amount = [...container.querySelectorAll("dt")].find((term) => term.textContent === "Amount");
		expect(amount?.nextElementSibling?.textContent).toBe("1.234,5 USDC");

		act(() => root.render(<VaultActionModal {...props({ stage: "review", result: undefined, amount: "0005" })} />));
		expect(amount?.nextElementSibling?.textContent).toBe("5 USDC");
	});
});

function props(overrides: Partial<VaultActionModalProps> = {}): VaultActionModalProps {
	return {
		open: true,
		action: "deposit",
		stage: "done",
		result: "rejected",
		detail: {
			name: "Safety Vault",
			vaultAddress: VAULT,
			leaderCommission: "0.1",
			alwaysCloseOnWithdraw: false,
		},
		ownerAddress: OWNER,
		amount: "1",
		availableAmount: "10",
		maxAmount: "10",
		minimumAmount: "5",
		belowMinimum: false,
		canReview: false,
		canConfirm: false,
		onAmountChange: vi.fn(),
		onReview: vi.fn(),
		onBack: vi.fn(),
		onConfirm: vi.fn(),
		onVerifyAgain: vi.fn(),
		onClose: vi.fn(),
		...overrides,
	};
}
