// @vitest-environment jsdom

import type { ReactNode } from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiWalletActionModal } from "@/components/api-wallet/api-wallet-action-modal";
import type { ApiWalletActionView } from "@/components/api-wallet/api-wallet-view";
import { createI18nRoot } from "./harness/react";

const modalState = vi.hoisted(() => ({
	dismissible: true,
	onOpenChange: undefined as ((open: boolean) => void) | undefined,
}));

vi.mock("@gatu/ui", () => ({
	AdaptiveModal: ({
		children,
		dismissible,
		onOpenChange,
	}: {
		children: ReactNode;
		dismissible: boolean;
		onOpenChange: (open: boolean) => void;
	}) => {
		modalState.dismissible = dismissible;
		modalState.onOpenChange = onOpenChange;
		return <div>{children}</div>;
	},
	Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
	Button: ({ children, disabled, onClick }: { children: ReactNode; disabled?: boolean; onClick?: () => void }) => (
		<button type="button" disabled={disabled} onClick={onClick}>
			{children}
		</button>
	),
	Checkbox: () => <input type="checkbox" />,
	ModalContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	ModalDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
	ModalFooter: ({ children }: { children: ReactNode }) => <footer>{children}</footer>,
	ModalHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
	ModalTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/components/api-wallet/api-wallet-copy-button", () => ({
	ApiWalletCopyButton: ({ value }: { value: string }) => <span data-copy={value} />,
}));

function createAction(overrides: Partial<ApiWalletActionView> = {}): ApiWalletActionView {
	return {
		open: true,
		kind: "authorize",
		stage: "review",
		agentName: "grid-bot",
		agentAddress: "0x2222222222222222222222222222222222222222",
		validityLabel: "30 days",
		locked: false,
		...overrides,
	};
}

describe("API wallet action modal", () => {
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

	it.each(["awaiting", "submitted", "reconciling"] as const)("locks dismissal during %s", (stage) => {
		const onClose = vi.fn();
		act(() =>
			root.render(
				<ApiWalletActionModal
					action={createAction({ stage, locked: true })}
					onClose={onClose}
					onConfirm={vi.fn()}
					onVerifyAgain={vi.fn()}
					onTogglePrivateKey={vi.fn()}
					onDownloadCredential={vi.fn()}
					onCredentialSavedChange={vi.fn()}
					onFinish={vi.fn()}
				/>,
			),
		);
		expect(modalState.dismissible).toBe(false);
		act(() => modalState.onOpenChange?.(false));
		expect(onClose).toHaveBeenCalledOnce();
	});

	it("keeps successful credentials open until download and saved acknowledgement", () => {
		const onFinish = vi.fn();
		act(() =>
			root.render(
				<ApiWalletActionModal
					action={createAction({
						stage: "done",
						result: "success",
						privateKey: `0x${"11".repeat(32)}`,
						credentialDownloaded: false,
						credentialSaved: false,
					})}
					onClose={vi.fn()}
					onConfirm={vi.fn()}
					onVerifyAgain={vi.fn()}
					onTogglePrivateKey={vi.fn()}
					onDownloadCredential={vi.fn()}
					onCredentialSavedChange={vi.fn()}
					onFinish={onFinish}
				/>,
			),
		);
		expect(modalState.dismissible).toBe(false);
		const finish = [...container.querySelectorAll("button")].find((button) => button.textContent === "Finish");
		expect(finish?.disabled).toBe(true);
	});

	it("shows a public verification reference for an unknown result", () => {
		const action = createAction({ stage: "done", result: "unknown" });
		act(() =>
			root.render(
				<ApiWalletActionModal
					action={action}
					onClose={vi.fn()}
					onConfirm={vi.fn()}
					onVerifyAgain={vi.fn()}
					onTogglePrivateKey={vi.fn()}
					onDownloadCredential={vi.fn()}
					onCredentialSavedChange={vi.fn()}
					onFinish={vi.fn()}
				/>,
			),
		);
		expect(container.textContent).toContain("Verification reference");
		expect(container.textContent).toContain(action.agentName);
		expect(container.textContent).toContain(action.agentAddress);
		expect(container.textContent).toContain("Verify again");
		expect(container.textContent).toContain("Discard local key");
	});
});
