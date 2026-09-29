// @vitest-environment jsdom

import type { ReactNode } from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VaultActionModal, type VaultActionModalProps } from "@/components/vaults/vault-action-modal";
import { createI18nRoot } from "./harness/react";

vi.mock("@gatu/ui", () => ({
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
	TextInput: () => <input />,
}));

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

const VAULT = "0x2222222222222222222222222222222222222222" as const;
const OWNER = "0x1111111111111111111111111111111111111111" as const;

describe("Vault action modal", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
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
