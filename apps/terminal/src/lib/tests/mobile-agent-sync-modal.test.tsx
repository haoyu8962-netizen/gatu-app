// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { act, createElement, Fragment, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createActionError } from "@/lib/errors/action-error";
import { createI18nRoot } from "./harness/react";

const NOW_MS = 1_779_364_227_000;
const USER_ADDRESS = "0x1111111111111111111111111111111111111111";
const AGENT_PRIVATE_KEY = `0x${"ab".repeat(32)}` as const;
const AGENT_ADDRESS = "0x2222222222222222222222222222222222222222";
const AGENT_VALID_UNTIL_MS = NOW_MS + 30 * 24 * 60 * 60 * 1000;
const AGENT_NAME = `Mobile valid_until ${AGENT_VALID_UNTIL_MS}`;
const IDENTITY_CHANGED = msg`The active wallet or network changed. Review the account and try again.`;

const testState = vi.hoisted(() => ({
	approveAgent: vi.fn(),
	builderFeeKnown: true,
	needsBuilderFee: false,
	refetchBuilderFee: vi.fn(),
	onOpenChangeComplete: undefined as ((open: boolean) => void) | undefined,
	features: { enabled: true },
	hasWalletAccess: true,
	isMobile: false,
	qrToCanvas: vi.fn(),
	walletAddress: "0x1111111111111111111111111111111111111111" as `0x${string}` | undefined,
}));

function renderChildren(children: ReactNode) {
	return createElement(Fragment, null, children);
}

function Icon({ className }: { className?: string }) {
	return createElement("span", { className, "aria-hidden": true });
}

vi.mock("@lingui/react/macro", () => ({
	Trans: ({ children }: { children: ReactNode }) => renderChildren(children),
}));

vi.mock("@phosphor-icons/react", () => ({
	DeviceMobileIcon: Icon,
	QrCodeIcon: Icon,
	SealCheckIcon: Icon,
	SpinnerGapIcon: Icon,
	WarningCircleIcon: Icon,
}));

vi.mock("@/hooks/use-mobile", () => ({
	useIsMobile: () => testState.isMobile,
}));

vi.mock("@sairn/ui", () => ({
	AdaptiveModal: ({
		children,
		onOpenChange,
		onOpenChangeComplete,
		open,
		presentation,
	}: {
		children: ReactNode;
		onOpenChange: (open: boolean) => void;
		onOpenChangeComplete?: (open: boolean) => void;
		open: boolean;
		presentation?: string;
	}) => {
		testState.onOpenChangeComplete = onOpenChangeComplete;
		return open
			? createElement(
					"div",
					{ "data-presentation": presentation, role: "dialog" },
					createElement("button", { onClick: () => onOpenChange(false), type: "button" }, "Close modal"),
					children,
				)
			: null;
	},
	Button: ({
		children,
		className,
		iconLeft,
		iconRight,
		intent: _intent,
		size: _size,
		type: _type,
		variant: _variant,
		...props
	}: {
		children: ReactNode;
		className?: string;
		iconLeft?: ReactNode;
		iconRight?: ReactNode;
		intent?: string;
		size?: string;
		type?: "button" | "reset" | "submit";
		variant?: string;
		[key: string]: unknown;
	}) => createElement("button", { ...props, className, type: "button" }, iconLeft, children, iconRight),
	ModalContent: ({ children }: { children: ReactNode }) => renderChildren(children),
	ModalDescription: ({ children }: { children: ReactNode }) => createElement("p", null, children),
	ModalFooter: ({ children }: { children: ReactNode }) => createElement("footer", null, children),
	ModalHeader: ({ children }: { children: ReactNode }) => createElement("header", null, children),
	ModalTitle: ({ children }: { children: ReactNode }) => createElement("h2", null, children),
}));

vi.mock("@sairn/hl-react/signing/mobile-agent", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@sairn/hl-react/signing/mobile-agent")>();
	return {
		...actual,
		createMobileAgentApproval: () => ({
			agentNameBase: "Mobile",
			agentName: AGENT_NAME,
			agentValidUntilMs: AGENT_VALID_UNTIL_MS,
			privateKey: AGENT_PRIVATE_KEY,
			publicKey: AGENT_ADDRESS,
		}),
	};
});

vi.mock("@/config/mobile-pairing", () => ({
	MOBILE_PAIRING_FEATURES: testState.features,
}));

vi.mock("@/hooks/wallet/use-explicit-agent-approval", () => ({
	useExplicitAgentApproval: () => ({
		isPending: false,
		mutateAsync: testState.approveAgent,
	}),
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({
		hasWalletAccess: testState.hasWalletAccess,
		walletAddress: testState.walletAddress,
		walletIntent: "embedded",
	}),
}));

vi.mock("@/lib/hyperliquid", () => ({
	useHyperliquid: () => ({ env: "Mainnet" }),
	useTradingStatus: () => ({
		needsBuilderFee: testState.builderFeeKnown && testState.needsBuilderFee,
		isBuilderFeeReady: testState.builderFeeKnown && !testState.needsBuilderFee,
		refetchBuilderFee: testState.refetchBuilderFee,
	}),
}));

vi.mock("qrcode", () => ({
	toCanvas: testState.qrToCanvas,
}));

async function flushAsyncWork(times = 12) {
	await act(async () => {
		for (let index = 0; index < times; index += 1) await Promise.resolve();
	});
}

async function advanceTime(ms: number) {
	await act(async () => {
		await vi.advanceTimersByTimeAsync(ms);
	});
	await flushAsyncWork();
}

function getButton(container: HTMLElement, text: string) {
	const button = [...container.querySelectorAll("button")].find((candidate) => candidate.textContent?.includes(text));
	if (!button) throw new Error(`Button not found: ${text}`);
	return button;
}

function findButton(container: HTMLElement, text: string) {
	return [...container.querySelectorAll("button")].find((candidate) => candidate.textContent?.includes(text));
}

function dispatchPointer(target: Element, type: string) {
	target.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
}

describe("MobileAgentSyncModal", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		vi.useFakeTimers({ now: NOW_MS });
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		testState.walletAddress = USER_ADDRESS;
		testState.hasWalletAccess = true;
		testState.isMobile = false;
		testState.features.enabled = true;
		testState.approveAgent.mockReset();
		testState.approveAgent.mockResolvedValue(undefined);
		testState.builderFeeKnown = true;
		testState.needsBuilderFee = false;
		testState.refetchBuilderFee.mockReset();
		testState.refetchBuilderFee.mockImplementation(async () => ({
			isBuilderFeeReady: testState.builderFeeKnown && !testState.needsBuilderFee,
			needsBuilderFee: testState.builderFeeKnown && testState.needsBuilderFee,
		}));
		testState.qrToCanvas.mockReset();
		testState.qrToCanvas.mockResolvedValue(undefined);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		i18n.loadAndActivate({ locale: "en", messages: {} });
		vi.clearAllMocks();
		vi.useRealTimers();
	});

	async function renderModal(onOpenChange = vi.fn(), open = true) {
		const { MobileAgentSyncModal } = await import("@/components/trade/components/mobile-agent-sync-modal");
		act(() => {
			root.render(createElement(MobileAgentSyncModal, { open, onOpenChange }));
		});
		await flushAsyncWork();
		return onOpenChange;
	}

	async function approve() {
		act(() => getButton(container, "Approve mobile trading key").click());
		await flushAsyncWork();
		expect(container.textContent).toContain("Hold to reveal");
	}

	async function reveal() {
		dispatchPointer(getButton(container, "Hold to reveal"), "pointerdown");
		await advanceTime(2_000);
	}

	it("uses a drawer at the terminal mobile breakpoint", async () => {
		testState.isMobile = true;
		await renderModal();

		expect(container.querySelector('[role="dialog"]')?.getAttribute("data-presentation")).toBe("drawer");
	});

	it("signs only after the explicit approval click and keeps the QR hidden until it is revealed", async () => {
		await renderModal();

		expect(testState.approveAgent).not.toHaveBeenCalled();
		expect(container.textContent).toContain(
			"On your phone, open Sairn, tap Connect, then Link Desktop Wallet and scan this code.",
		);
		expect(container.textContent).toContain("The QR can trade but not withdraw.");
		expect(container.textContent).toContain("Approving replaces the key on a phone that is already linked.");
		expect(container.querySelector("canvas")).toBeNull();

		await approve();

		expect(testState.approveAgent).toHaveBeenCalledTimes(1);
		expect(testState.approveAgent).toHaveBeenCalledWith(
			{ agentAddress: AGENT_ADDRESS, agentName: AGENT_NAME },
			{ signal: expect.any(AbortSignal), applicationReview: "confirmed" },
		);
		expect(container.querySelector("canvas")).toBeNull();
		expect(findButton(container, "Approve mobile trading key")).toBeUndefined();
	});

	it("keeps the approve control named and disabled while the wallet signs", async () => {
		testState.approveAgent.mockImplementation(() => new Promise<void>(() => {}));
		await renderModal();
		act(() => getButton(container, "Approve mobile trading key").click());
		await flushAsyncWork();

		const button = getButton(container, "Approve mobile trading key");
		expect(button.hasAttribute("disabled")).toBe(true);
		expect(container.textContent).not.toContain("...");
		act(() => button.click());
		expect(testState.approveAgent).toHaveBeenCalledTimes(1);
	});

	it("shows an approval failure in the active language and follows a language switch", async () => {
		testState.approveAgent.mockRejectedValueOnce(createActionError("identity-changed"));
		await renderModal();
		act(() => getButton(container, "Approve mobile trading key").click());
		await flushAsyncWork();

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

	it("shows the signing failure and lets the user approve again", async () => {
		testState.approveAgent.mockRejectedValueOnce(new Error("User rejected the request"));
		await renderModal();
		act(() => getButton(container, "Approve mobile trading key").click());
		await flushAsyncWork();

		expect(container.querySelector('[role="alert"]')).not.toBeNull();
		expect(container.textContent).not.toContain("Hold to reveal");
		expect(getButton(container, "Approve mobile trading key").hasAttribute("disabled")).toBe(false);

		await approve();
		expect(testState.approveAgent).toHaveBeenCalledTimes(2);
	});

	it("reveals the QR after a two-second hold and closes the dialog after sixty seconds", async () => {
		const onOpenChange = await renderModal();
		await approve();

		const holdButton = getButton(container, "Hold to reveal");
		expect(holdButton.hasAttribute("aria-label")).toBe(false);
		const hint = document.getElementById(holdButton.getAttribute("aria-describedby") ?? "");
		expect(hint?.textContent).toBe("Hold for 2 seconds to reveal the QR code");
		for (const circle of holdButton.querySelectorAll("circle")) {
			expect(circle.getAttribute("class") ?? "").not.toContain("transition");
		}
		expect(holdButton.querySelector('[role="progressbar"]')).toBeNull();
		dispatchPointer(holdButton, "pointerdown");
		await advanceTime(1_500);
		expect(container.textContent).toContain("Keep holding for");
		expect(container.querySelector("canvas")).toBeNull();

		await advanceTime(500);
		expect(container.querySelector("canvas")).not.toBeNull();
		await vi.waitFor(() => expect(testState.qrToCanvas).toHaveBeenCalledTimes(1));
		const [, url] = testState.qrToCanvas.mock.calls[0] as [unknown, string];
		expect(url.startsWith(`${window.location.origin}/mobile-agent-sync#sairn-mobile-sync=`)).toBe(true);
		expect(url).not.toContain("k=");
		expect(container.textContent).toContain("Closes in 60s");

		await advanceTime(1_000);
		expect(container.textContent).toContain("Closes in 59s");
		expect(onOpenChange).not.toHaveBeenCalled();

		await advanceTime(59_000);
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("cancels the hold when the pointer is released early", async () => {
		await renderModal();
		await approve();

		const holdButton = getButton(container, "Hold to reveal");
		dispatchPointer(holdButton, "pointerdown");
		await advanceTime(1_000);
		dispatchPointer(holdButton, "pointerup");
		await advanceTime(1_500);

		expect(container.querySelector("canvas")).toBeNull();
		expect(testState.qrToCanvas).not.toHaveBeenCalled();
		expect(container.textContent).toContain("Hold to reveal");
	});

	it("closes the revealed QR as soon as the window loses focus", async () => {
		const onOpenChange = await renderModal();
		await approve();
		await reveal();
		expect(container.querySelector("canvas")).not.toBeNull();

		act(() => {
			window.dispatchEvent(new Event("blur"));
		});

		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("does not keep a QR revealed while the document is hidden", async () => {
		const onOpenChange = await renderModal();
		await approve();
		Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
		try {
			await reveal();
		} finally {
			Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
		}

		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("does not offer approval without the exact owner wallet", async () => {
		testState.hasWalletAccess = false;
		await renderModal();

		expect(container.textContent).toContain("Connect the selected master wallet before linking a mobile device.");
		expect(findButton(container, "Approve mobile trading key")).toBeUndefined();
		expect(testState.approveAgent).not.toHaveBeenCalled();
	});

	it("hides approval while the pairing feature is off", async () => {
		testState.features.enabled = false;
		await renderModal();

		expect(container.textContent).toContain("New mobile pairing is temporarily unavailable.");
		expect(findButton(container, "Approve mobile trading key")).toBeUndefined();
		expect(testState.approveAgent).not.toHaveBeenCalled();
	});

	it("keeps its content through the exit transition and starts idle on the next open", async () => {
		const onOpenChange = await renderModal();
		await approve();

		await renderModal(onOpenChange, false);
		expect(container.querySelector('[role="dialog"]')).toBeNull();
		act(() => testState.onOpenChangeComplete?.(false));

		await renderModal(onOpenChange, true);
		expect(container.textContent).toContain("Approve mobile trading key");
		expect(container.textContent).not.toContain("Hold to reveal");
		expect(testState.approveAgent).toHaveBeenCalledTimes(1);
	});

	it("ignores a late approval result after the dialog was closed", async () => {
		let resolveApproval: (() => void) | undefined;
		testState.approveAgent.mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					resolveApproval = resolve;
				}),
		);
		const onOpenChange = await renderModal();
		act(() => getButton(container, "Approve mobile trading key").click());
		await flushAsyncWork();
		const [, options] = testState.approveAgent.mock.calls[0] as [unknown, { signal: AbortSignal }];

		act(() => getButton(container, "Close modal").click());
		expect(onOpenChange).toHaveBeenCalledWith(false);
		expect(options.signal.aborted).toBe(true);

		act(() => resolveApproval?.());
		await flushAsyncWork();
		expect(container.textContent).not.toContain("Hold to reveal");
	});
	it("never signs a builder fee and keeps linking unavailable until trading is activated", async () => {
		testState.needsBuilderFee = true;
		await renderModal();

		const approveButton = getButton(container, "Approve mobile trading key");
		expect(approveButton.hasAttribute("disabled")).toBe(true);
		expect(container.textContent).toContain("Trading is not activated on this account yet.");
		expect(findButton(container, "builder fee")).toBeUndefined();
		act(() => approveButton.click());
		await flushAsyncWork();
		expect(testState.approveAgent).not.toHaveBeenCalled();

		testState.needsBuilderFee = false;
		await renderModal();
		expect(container.textContent).not.toContain("Trading is not activated on this account yet.");
		await approve();
		expect(testState.approveAgent).toHaveBeenCalledTimes(1);
	});

	it("does not sign the mobile key when the fresh check finds trading not activated", async () => {
		await renderModal();
		testState.refetchBuilderFee.mockImplementationOnce(async () => {
			testState.needsBuilderFee = true;
			return { isBuilderFeeReady: false, needsBuilderFee: true };
		});

		act(() => getButton(container, "Approve mobile trading key").click());
		await flushAsyncWork();

		expect(testState.approveAgent).not.toHaveBeenCalled();
		expect(getButton(container, "Approve mobile trading key").hasAttribute("disabled")).toBe(true);
		expect(container.textContent).toContain("Trading is not activated on this account yet.");
	});

	it("fails closed without signing when activation cannot be checked", async () => {
		await renderModal();
		testState.refetchBuilderFee.mockRejectedValueOnce(new Error("network"));

		act(() => getButton(container, "Approve mobile trading key").click());
		await flushAsyncWork();

		expect(testState.approveAgent).not.toHaveBeenCalled();
		expect(container.querySelector('[role="alert"]')?.textContent).toBe(
			"Could not check on Hyperliquid whether trading is activated. Nothing was signed. Try again.",
		);
	});

	it("keeps the approved key and offers another reveal when the QR cannot be drawn", async () => {
		testState.qrToCanvas.mockRejectedValueOnce(new Error("chunk"));
		await renderModal();
		await approve();
		await reveal();
		await flushAsyncWork();

		expect(container.textContent).toContain("The QR could not be drawn.");
		expect(findButton(container, "Approve mobile trading key")).toBeUndefined();

		await reveal();
		await flushAsyncWork();
		expect(container.querySelector("canvas")).not.toBeNull();
		expect(testState.qrToCanvas).toHaveBeenCalledTimes(2);
		const [, firstUrl] = testState.qrToCanvas.mock.calls[0] as [unknown, string];
		const [, secondUrl] = testState.qrToCanvas.mock.calls[1] as [unknown, string];
		expect(new URL(secondUrl).pathname).toBe(new URL(firstUrl).pathname);
		expect(testState.approveAgent).toHaveBeenCalledTimes(1);
	});
});
