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

	it.each(["rejected", "apiError"] as const)("exposes the done/%s retry transition as Review again", (result) => {
		const onRetry = vi.fn();
		act(() => root.render(<VaultActionModal {...props({ result, onRetry })} />));

		const retry = [...container.querySelectorAll("button")].find((button) => button.textContent === "Review again");
		expect(retry).toBeDefined();
		act(() => retry?.click());
		expect(onRetry).toHaveBeenCalledOnce();
		expect(container.textContent).not.toContain("Verify again");
	});

	it("keeps unknown results on the read-only verification path", () => {
		const onVerifyAgain = vi.fn();
		act(() => root.render(<VaultActionModal {...props({ result: "unknown", onVerifyAgain })} />));

		const verify = [...container.querySelectorAll("button")].find((button) => button.textContent === "Verify again");
		expect(verify).toBeDefined();
		expect(container.textContent).not.toContain("Review again");
		act(() => verify?.click());
		expect(onVerifyAgain).toHaveBeenCalledOnce();
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
		onRetry: vi.fn(),
		onVerifyAgain: vi.fn(),
		onClose: vi.fn(),
		...overrides,
	};
}
