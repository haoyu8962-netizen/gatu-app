// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { act, createElement, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { createActionError } from "@/lib/errors/action-error";
import { createI18nRoot } from "./harness/react";

const IDENTITY_CHANGED = msg`The active wallet or network changed. Review the account and try again.`;

const testState = vi.hoisted(() => ({
	agentMissingReason: null as
		| "no_local_key"
		| "remote_named_agent_exists"
		| "approval_unconfirmed"
		| "local_key_not_approved"
		| "remote_key_replaced"
		| "agent_name_mismatch"
		| "invalid_local_record"
		| null,
	canResetConnection: false,
	clientKey: "0x1111111111111111111111111111111111111111" as string,
	env: "Mainnet" as "Mainnet" | "Testnet",
	error: null as Error | null,
	failurePhase: null as "preflight" | "approval" | "persistence" | "verification" | null,
	isMobile: false,
	persistConnection: false,
	register: vi.fn(),
	resetConnection: vi.fn(),
	status: "idle" as "idle" | "approving_agent" | "verifying" | "error",
	walletIntent: "external" as "embedded" | "external",
	writePersistTradingConnection: vi.fn(),
}));

vi.mock("@/hooks/use-mobile", () => ({
	useIsMobile: () => testState.isMobile,
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({ walletIntent: testState.walletIntent }),
}));

vi.mock("@/lib/hyperliquid", () => ({
	readPersistTradingConnection: () => testState.persistConnection,
	useAgentRegistration: () => ({
		agentMissingReason: testState.agentMissingReason,
		canResetConnection: testState.canResetConnection,
		error: testState.error,
		failurePhase: testState.failurePhase,
		register: testState.register,
		resetConnection: testState.resetConnection,
		status: testState.status,
	}),
	useHyperliquid: () => ({ clientKey: testState.clientKey, env: testState.env }),
	writePersistTradingConnection: testState.writePersistTradingConnection,
}));

vi.mock("@sairn/ui", () => ({
	AdaptiveModal: ({
		className,
		children,
		onOpenChange,
		presentation,
	}: {
		className?: string;
		children: ReactNode;
		onOpenChange: (open: boolean) => void;
		presentation: string;
	}) =>
		createElement(
			"div",
			{ "data-presentation": presentation, className, role: "dialog" },
			children,
			createElement("button", { onClick: () => onOpenChange(false), type: "button" }, "Close"),
		),
	Button: ({ children, disabled, onClick }: { children: ReactNode; disabled?: boolean; onClick?: () => void }) =>
		createElement("button", { disabled, onClick, type: "button" }, children),
	Checkbox: ({
		checked,
		description,
		disabled,
		label,
		onCheckedChange,
	}: {
		checked: boolean;
		description?: ReactNode;
		disabled?: boolean;
		label: ReactNode;
		onCheckedChange: (checked: boolean) => void;
	}) =>
		createElement(
			"label",
			null,
			createElement("input", {
				checked,
				disabled,
				onChange: (event: { currentTarget: { checked: boolean } }) => onCheckedChange(event.currentTarget.checked),
				type: "checkbox",
			}),
			label,
			description,
		),
	ModalContent: ({ children }: { children: ReactNode }) => createElement("div", null, children),
	ModalDescription: ({ children }: { children: ReactNode }) => createElement("p", null, children),
	ModalFooter: ({ children }: { children: ReactNode }) => createElement("footer", null, children),
	ModalHeader: ({ children }: { children: ReactNode }) => createElement("header", null, children),
	ModalTitle: ({ children }: { children: ReactNode }) => createElement("h2", null, children),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

beforeAll(async () => {
	await import("@/components/trade/components/establish-connection-modal");
}, 60_000);

describe("EstablishConnectionModal", () => {
	let container: HTMLDivElement;
	let root: Root;
	let onClose: Mock<() => void>;
	let onConnected: Mock<() => void>;

	beforeEach(() => {
		i18n.activate("en");
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		onClose = vi.fn();
		onConnected = vi.fn();
		testState.error = null;
		testState.agentMissingReason = null;
		testState.canResetConnection = false;
		testState.clientKey = "0x1111111111111111111111111111111111111111";
		testState.env = "Mainnet";
		testState.failurePhase = null;
		testState.isMobile = false;
		testState.persistConnection = false;
		testState.register.mockReset();
		testState.register.mockResolvedValue("0x1111111111111111111111111111111111111111");
		testState.resetConnection.mockReset();
		testState.resetConnection.mockResolvedValue(undefined);
		testState.status = "idle";
		testState.walletIntent = "external";
		testState.writePersistTradingConnection.mockReset();
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		i18n.loadAndActivate({ locale: "en", messages: {} });
		vi.clearAllMocks();
	});

	async function renderModal() {
		const { EstablishConnectionModal } = await import("@/components/trade/components/establish-connection-modal");
		act(() => root.render(createElement(EstablishConnectionModal, { onClose, onConnected })));
	}

	it("uses the mobile drawer and completes only after Agent confirmation", async () => {
		testState.isMobile = true;
		await renderModal();

		const dialog = container.querySelector('[role="dialog"]');
		expect(dialog?.getAttribute("data-presentation")).toBe("drawer");
		expect(dialog?.className).not.toMatch(/rounded-(t-)?(\d+|\[)/);
		expect(dialog?.className).not.toContain("min-[1000px]");
		const connect = [...container.querySelectorAll("button")].find(
			(button) => button.textContent === "Establish Connection",
		);
		await act(async () => connect?.click());

		expect(testState.register).toHaveBeenCalledWith({
			approval: { applicationReview: "confirmed" },
			persistConnection: false,
		});
		expect(onConnected).toHaveBeenCalledOnce();
	});

	it("persists the Stay Connected preference and registers in persistent mode", async () => {
		await renderModal();

		const checkbox = container.querySelector<HTMLInputElement>('input[type="checkbox"]');
		act(() => checkbox?.click());
		expect(testState.writePersistTradingConnection).toHaveBeenCalledWith(true);

		const connect = [...container.querySelectorAll("button")].find(
			(button) => button.textContent === "Establish Connection",
		);
		await act(async () => connect?.click());

		expect(testState.register).toHaveBeenCalledWith({
			approval: { applicationReview: "confirmed" },
			persistConnection: true,
		});
		expect(container.textContent).toContain("browser profile");
	});

	it("allows dismissal and surfaces a recoverable registration error without its raw text", async () => {
		testState.error = new Error("Wallet rejected request");
		testState.status = "error";
		await renderModal();

		expect(container.querySelector('[role="alert"]')?.textContent).toBe("Connection could not be established.");
		const close = [...container.querySelectorAll("button")].find((button) => button.textContent === "Close");
		act(() => close?.click());
		expect(onClose).toHaveBeenCalledOnce();
	});

	it("explains when another same-name connection replaced this browser key", async () => {
		testState.agentMissingReason = "remote_key_replaced";
		await renderModal();

		expect(container.textContent).toContain("Trading is not connected in this browser");
		expect(container.textContent).toContain("create or replace its trading key");
	});

	it("warns before a browser with no local key replaces a same-name remote Agent", async () => {
		testState.agentMissingReason = "remote_named_agent_exists";
		await renderModal();

		expect(container.textContent).toContain("Trading is not connected in this browser");
		expect(container.textContent).toContain("create or replace its trading key");
	});

	it("uses the application dialog as the only confirmation for an embedded email wallet", async () => {
		testState.status = "approving_agent";
		testState.walletIntent = "embedded";
		await renderModal();

		expect(container.textContent).toContain("Connecting...");
		expect(container.textContent).not.toContain("Confirm in wallet");
	});

	it("clarifies that a preflight status failure did not request a signature", async () => {
		testState.error = Object.assign(new Error("Could not load agent status"), {
			name: "AgentStatusError",
			reason: "rate_limited",
		});
		testState.failurePhase = "preflight";
		testState.status = "error";
		await renderModal();

		expect(container.textContent).toContain("could not be checked safely");
		expect(container.textContent).toContain("No wallet signature was requested");
	});

	it("localizes an unknown preflight status error without exposing internal text", async () => {
		testState.error = Object.assign(new Error("Could not load agent status"), {
			name: "AgentStatusError",
			reason: "unknown",
		});
		testState.failurePhase = "preflight";
		testState.status = "error";
		await renderModal();

		expect(container.textContent).toContain("could not be checked safely");
		expect(container.textContent).toContain("No wallet signature was requested");
		expect(container.textContent).not.toContain("Could not load agent status");
	});

	it("treats every post-approval verification failure as an ambiguous result", async () => {
		testState.error = new Error("Agent registration cleanup could not be verified");
		testState.failurePhase = "verification";
		testState.status = "error";
		await renderModal();

		expect(container.textContent).toContain("It may already be approved");
		expect(container.textContent).not.toContain("Agent registration cleanup could not be verified");
	});

	it("fails closed with localized guidance when browser key storage cannot be trusted", async () => {
		testState.error = new Error("Agent key storage could not be verified");
		testState.failurePhase = "preflight";
		testState.status = "error";
		await renderModal();

		expect(container.textContent).toContain("could not be checked safely");
		expect(container.textContent).toContain("No wallet signature was requested");
		expect(container.textContent).not.toContain("Agent key storage could not be verified");
	});

	it("requires identity-bound confirmation before resetting submitted coordination", async () => {
		testState.canResetConnection = true;
		testState.error = Object.assign(new Error("The previous trading connection cannot be resumed safely"), {
			name: "AgentRegistrationResetRequiredError",
		});
		testState.failurePhase = "preflight";
		testState.status = "error";
		await renderModal();

		expect(container.textContent).toContain("no longer has the exact trading key");
		const resetButton = [...container.querySelectorAll("button")].find(
			(button) => button.textContent === "Reset trading connection",
		);
		await act(async () => resetButton?.click());
		expect(testState.resetConnection).not.toHaveBeenCalled();
		expect(container.textContent).toContain("If it was already approved");

		const confirmButton = [...container.querySelectorAll("button")].find(
			(button) => button.textContent === "Reset trading connection",
		);
		await act(async () => confirmButton?.click());
		expect(testState.resetConnection).toHaveBeenCalledOnce();
	});

	it("invalidates reset confirmation after the wallet identity changes away and back", async () => {
		testState.canResetConnection = true;
		await renderModal();

		let resetButton = [...container.querySelectorAll("button")].find(
			(button) => button.textContent === "Reset trading connection",
		);
		act(() => resetButton?.click());
		expect(container.textContent).toContain("If it was already approved");

		testState.clientKey = "0x2222222222222222222222222222222222222222";
		await renderModal();
		testState.clientKey = "0x1111111111111111111111111111111111111111";
		await renderModal();

		expect(container.textContent).not.toContain("If it was already approved");
		resetButton = [...container.querySelectorAll("button")].find(
			(button) => button.textContent === "Reset trading connection",
		);
		await act(async () => resetButton?.click());
		expect(testState.resetConnection).not.toHaveBeenCalled();
	});

	it("invalidates reset confirmation when reset eligibility changes", async () => {
		testState.canResetConnection = true;
		await renderModal();

		let resetButton = [...container.querySelectorAll("button")].find(
			(button) => button.textContent === "Reset trading connection",
		);
		act(() => resetButton?.click());
		expect(container.textContent).toContain("If it was already approved");

		testState.canResetConnection = false;
		await renderModal();
		testState.canResetConnection = true;
		await renderModal();

		expect(container.textContent).not.toContain("If it was already approved");
		resetButton = [...container.querySelectorAll("button")].find(
			(button) => button.textContent === "Reset trading connection",
		);
		await act(async () => resetButton?.click());
		expect(testState.resetConnection).not.toHaveBeenCalled();
	});

	it("keeps a reset failure visible in the confirmation step", async () => {
		testState.canResetConnection = true;
		testState.resetConnection.mockRejectedValue(new Error("Reset was blocked by active coordination"));
		await renderModal();

		let resetButton = [...container.querySelectorAll("button")].find(
			(button) => button.textContent === "Reset trading connection",
		);
		act(() => resetButton?.click());
		resetButton = [...container.querySelectorAll("button")].find(
			(button) => button.textContent === "Reset trading connection",
		);
		await act(async () => resetButton?.click());

		expect(container.querySelector('[role="alert"]')?.textContent).toBe("Trading connection could not be reset.");
		expect(container.textContent).not.toContain("Reset was blocked");
		expect(container.textContent).toContain("If it was already approved");
	});

	it("reports a reset failure that is not an Error with the translated reset message", async () => {
		testState.canResetConnection = true;
		testState.resetConnection.mockRejectedValue("coordination busy");
		await renderModal();

		let resetButton = [...container.querySelectorAll("button")].find(
			(button) => button.textContent === "Reset trading connection",
		);
		act(() => resetButton?.click());
		resetButton = [...container.querySelectorAll("button")].find(
			(button) => button.textContent === "Reset trading connection",
		);
		await act(async () => resetButton?.click());

		expect(container.querySelector('[role="alert"]')?.textContent).toBe("Trading connection could not be reset.");
	});

	it("renders an approval failure in the active language and follows a language switch", async () => {
		testState.error = createActionError("identity-changed");
		testState.failurePhase = "approval";
		testState.status = "error";
		await renderModal();

		expect(container.querySelector('[role="alert"]')?.textContent).toBe(
			"The active wallet or network changed. Review the account and try again.",
		);

		act(() =>
			i18n.loadAndActivate({
				locale: "zh",
				messages: { [IDENTITY_CHANGED.id]: "当前钱包或网络已变化。请检查账户后重试。" },
			}),
		);

		expect(container.querySelector('[role="alert"]')?.textContent).toBe("当前钱包或网络已变化。请检查账户后重试。");
	});

	it("does not mask an other-tab conflict as an ambiguous approval result", async () => {
		testState.error = new Error("A trading connection is already being established in another tab.");
		testState.failurePhase = "verification";
		testState.status = "error";
		await renderModal();

		expect(container.textContent).toContain("being established in another tab");
		expect(container.textContent).not.toContain("It may already be approved");
		expect(container.textContent).not.toContain("Reset trading connection");
	});
});
