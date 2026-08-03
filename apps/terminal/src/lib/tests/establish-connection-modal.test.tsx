// @vitest-environment jsdom

import { act, createElement, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { createI18nRoot } from "./harness/react";

const testState = vi.hoisted(() => ({
	error: null as Error | null,
	isMobile: false,
	persistConnection: false,
	register: vi.fn(),
	status: "idle" as "idle" | "approving_agent" | "verifying" | "error",
	writePersistTradingConnection: vi.fn(),
}));

vi.mock("@/hooks/use-mobile", () => ({
	useIsMobile: () => testState.isMobile,
}));

vi.mock("@/lib/hyperliquid", () => ({
	readPersistTradingConnection: () => testState.persistConnection,
	useAgentRegistration: () => ({
		error: testState.error,
		register: testState.register,
		status: testState.status,
	}),
	writePersistTradingConnection: testState.writePersistTradingConnection,
}));

vi.mock("@/lib/errors/format", () => ({
	formatExchangeActionError: (error: Error) => error.message,
}));

vi.mock("@gatu/ui", () => ({
	AdaptiveModal: ({
		children,
		onOpenChange,
		presentation,
	}: {
		children: ReactNode;
		onOpenChange: (open: boolean) => void;
		presentation: string;
	}) =>
		createElement(
			"div",
			{ "data-presentation": presentation, role: "dialog" },
			children,
			createElement("button", { onClick: () => onOpenChange(false), type: "button" }, "Close"),
		),
	Button: ({ children, disabled, onClick }: { children: ReactNode; disabled?: boolean; onClick?: () => void }) =>
		createElement("button", { disabled, onClick, type: "button" }, children),
	Checkbox: ({
		checked,
		disabled,
		label,
		onCheckedChange,
	}: {
		checked: boolean;
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
		),
	ModalContent: ({ children }: { children: ReactNode }) => createElement("div", null, children),
	ModalFooter: ({ children }: { children: ReactNode }) => createElement("footer", null, children),
	ModalHeader: ({ children }: { children: ReactNode }) => createElement("header", null, children),
	ModalTitle: ({ children }: { children: ReactNode }) => createElement("h2", null, children),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("EstablishConnectionModal", () => {
	let container: HTMLDivElement;
	let root: Root;
	let onClose: Mock<() => void>;
	let onConnected: Mock<() => void>;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		onClose = vi.fn();
		onConnected = vi.fn();
		testState.error = null;
		testState.isMobile = false;
		testState.persistConnection = false;
		testState.register.mockReset();
		testState.register.mockResolvedValue("0x1111111111111111111111111111111111111111");
		testState.status = "idle";
		testState.writePersistTradingConnection.mockReset();
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.clearAllMocks();
	});

	async function renderModal() {
		const { EstablishConnectionModal } = await import("@/components/trade/components/establish-connection-modal");
		act(() => root.render(createElement(EstablishConnectionModal, { onClose, onConnected })));
	}

	it("uses the mobile drawer and completes only after Agent confirmation", async () => {
		testState.isMobile = true;
		await renderModal();

		expect(container.querySelector('[role="dialog"]')?.getAttribute("data-presentation")).toBe("drawer");
		const connect = [...container.querySelectorAll("button")].find(
			(button) => button.textContent === "Establish Connection",
		);
		await act(async () => connect?.click());

		expect(testState.register).toHaveBeenCalledWith({ persistConnection: false });
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

		expect(testState.register).toHaveBeenCalledWith({ persistConnection: true });
	});

	it("allows dismissal and surfaces a recoverable registration error", async () => {
		testState.error = new Error("Wallet rejected request");
		testState.status = "error";
		await renderModal();

		expect(container.querySelector('[role="alert"]')?.textContent).toContain("Wallet rejected request");
		const close = [...container.querySelectorAll("button")].find((button) => button.textContent === "Close");
		act(() => close?.click());
		expect(onClose).toHaveBeenCalledOnce();
	});
});
