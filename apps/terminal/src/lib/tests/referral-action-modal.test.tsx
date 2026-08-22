// @vitest-environment jsdom

import type { ReactNode } from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReferralActionModal } from "@/components/referrals/referral-action-modal";
import { createI18nRoot } from "@/lib/tests/harness/react";

vi.mock("@gatu/ui", () => ({
	AdaptiveModal: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	Button: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
		<button type="button" onClick={onClick}>
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
vi.mock("@/lib/number-format-reactivity", () => ({ useNumberFormatRevision: () => 0 }));

describe("ReferralActionModal invitation flow", () => {
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

	it("shows a deep-linked code for review without submitting it automatically", async () => {
		const onSubmit = vi.fn().mockResolvedValue(undefined);
		await act(async () => {
			root.render(
				<ReferralActionModal
					action="apply"
					claimableRewards={[]}
					initialCode="gatuappweb3"
					onClose={vi.fn()}
					onSubmit={onSubmit}
				/>,
			);
		});

		expect(container.textContent).toContain("gatuappweb3");
		expect(onSubmit).not.toHaveBeenCalled();

		const confirm = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Confirm");
		if (!confirm) throw new Error("Confirm button was not rendered");
		await act(async () => {
			confirm.click();
		});

		expect(onSubmit).toHaveBeenCalledExactlyOnceWith("apply", "gatuappweb3");
	});

	it("keeps a deep-linked code locked when the secondary action is selected", async () => {
		const onClose = vi.fn();
		const onSubmit = vi.fn().mockResolvedValue(undefined);
		await act(async () => {
			root.render(
				<ReferralActionModal
					action="apply"
					claimableRewards={[]}
					initialCode="ExactCode"
					onClose={onClose}
					onSubmit={onSubmit}
				/>,
			);
		});

		expect(container.querySelector("input")).toBeNull();
		const cancel = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Cancel");
		if (!cancel) throw new Error("Cancel button was not rendered");
		await act(async () => cancel.click());

		expect(onClose).toHaveBeenCalledOnce();
		expect(onSubmit).not.toHaveBeenCalled();
		expect(container.querySelector("input")).toBeNull();
	});
});
