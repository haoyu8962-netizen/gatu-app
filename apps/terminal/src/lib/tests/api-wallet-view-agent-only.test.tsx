// @vitest-environment jsdom

import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiWalletView, type ApiWalletViewProps } from "@/components/api-wallet/api-wallet-view";
import { createI18nRoot } from "./harness/react";

const testState = vi.hoisted(() => ({ isMobile: true }));

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => testState.isMobile }));

const REASON = "This phone uses a desktop-approved trading key. This action needs the master wallet on desktop.";
const OWNER = "0x1111111111111111111111111111111111111111";

function props(overrides: Partial<ApiWalletViewProps> = {}): ApiWalletViewProps {
	return {
		pageState: "nonMaster",
		accountAddress: OWNER,
		name: "",
		validityDays: 90,
		agents: [
			{
				id: "desktop-bot",
				address: "0x2222222222222222222222222222222222222222",
				name: "desktop-bot",
				expiresAt: null,
				expiryLabel: "Never",
				status: "active",
			},
		],
		action: null,
		canGenerate: false,
		canAuthorize: false,
		onNameChange: vi.fn(),
		onValidityChange: vi.fn(),
		onGenerate: vi.fn(),
		onAuthorize: vi.fn(),
		onRemove: vi.fn(),
		onRetry: vi.fn(),
		onConnect: vi.fn(),
		onCloseAction: vi.fn(),
		onConfirmAction: vi.fn(),
		onVerifyAgain: vi.fn(),
		onTogglePrivateKey: vi.fn(),
		onDownloadCredential: vi.fn(),
		onCredentialSavedChange: vi.fn(),
		onFinishAction: vi.fn(),
		...overrides,
	};
}

describe("API wallet view in an Agent-only session", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		testState.isMobile = true;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it.each([true, false])("shows the one desktop-required reason and no switch prompt (mobile: %s)", (isMobile) => {
		testState.isMobile = isMobile;
		const viewProps = props({ masterWalletReason: REASON });
		act(() => root.render(<ApiWalletView {...viewProps} />));

		expect(container.textContent).toContain(REASON);
		expect(container.textContent).not.toContain("Switch wallets");
		expect(container.textContent).not.toContain("Connect wallet");
		const authorize = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent === "Authorize API wallet",
		);
		expect(authorize?.disabled).toBe(true);
		const removeButtons = [...container.querySelectorAll<HTMLButtonElement>("button")].filter(
			(button) => button.textContent === "Remove",
		);
		expect(removeButtons.length).toBeGreaterThan(0);
		expect(removeButtons.every((button) => button.disabled)).toBe(true);
	});

	it("keeps the switch-wallet alert for a different connected wallet", () => {
		act(() => root.render(<ApiWalletView {...props()} />));

		expect(container.textContent).toContain("Switch wallets to continue.");
		expect(container.textContent).not.toContain(REASON);
	});
});
