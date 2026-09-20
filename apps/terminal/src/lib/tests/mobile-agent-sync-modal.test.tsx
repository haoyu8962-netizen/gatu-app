// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { i18n } from "@lingui/core";
import { act, createElement, Fragment, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { privateKeyToAccount } from "viem/accounts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	clearDesktopApprovalRecovery,
	getDesktopApprovalRecovery,
	hasDesktopApprovalRecovery,
} from "@/lib/mobile-sync/desktop-approval-recovery";
import { createI18nRoot } from "./harness/react";

const NOW_MS = 1_779_364_227_000;
const USER_ADDRESS = "0x1111111111111111111111111111111111111111";
const SECOND_USER_ADDRESS = "0x1212121212121212121212121212121212121212";
const BUILDER_ADDRESS = "0xfF0524C825F6e4Ae67F8746729e5E861575C503A";
const AGENT_ADDRESS = "0x2222222222222222222222222222222222222222";
const AGENT_PRIVATE_KEY = `0x${"ab".repeat(32)}`;
const AGENT_VALID_UNTIL_MS = NOW_MS + 30 * 24 * 60 * 60 * 1000;
const AGENT_NAME = `Mobile valid_until ${AGENT_VALID_UNTIL_MS}`;
const OLD_AGENT_PRIVATE_KEY = `0x${"ef".repeat(32)}` as const;
const OLD_AGENT_ADDRESS = privateKeyToAccount(OLD_AGENT_PRIVATE_KEY).address;
const REVOKE_AGENT_ADDRESS = "0x4444444444444444444444444444444444444444";
const REVOKE_AGENT_PRIVATE_KEY = `0x${"cd".repeat(32)}`;
const REVOKE_VALID_UNTIL_MS = NOW_MS + 10 * 60 * 1000;
const REVOKE_AGENT_NAME = `Mobile valid_until ${REVOKE_VALID_UNTIL_MS}`;
const SYNC_EXPIRES_AT_MS = NOW_MS + 4_000 + 2 * 60 * 1000;
const PHONE_LINK = "https://app.gatu.test/mobile-agent-sync#ht-mobile-sync=encoded-envelope&k=encoded-key";
const NO_BALANCE_MESSAGE = "No balance on Hyperliquid. Deposit first.";
const ACCOUNT_CHECK_FAILED_MESSAGE =
	"Could not check this account on Hyperliquid. Nothing was signed. Retry the check.";
const NO_BALANCE_MESSAGE_AR = "لا يوجد رصيد في Hyperliquid. أودِع أولاً.";
const APPROVAL_RECHECK_MESSAGE =
	"The approval could not be rechecked. The QR remains hidden until read-only verification succeeds.";
const APPROVAL_RECHECK_MESSAGE_AR = "تعذّرت إعادة التحقق من الموافقة. سيظل رمز QR مخفيًا حتى ينجح التحقق للقراءة فقط.";
const PHONE_JOURNEY_INSTRUCTION =
	"On your phone, open gatu, tap Connect, then Link Desktop Wallet and scan this code, or scan it with your phone camera.";

function getMessageId(message: string): string {
	return createHash("sha256").update(`${message}\x1f`).digest("base64").slice(0, 6);
}

const EMPTY_CLEARINGHOUSE_STATE = {
	assetPositions: [],
	marginSummary: { accountValue: "0", totalNtlPos: "0", totalRawUsd: "0" },
	withdrawable: "0",
};

const testState = vi.hoisted(() => ({
	approveAgent: vi.fn(),
	captureRegistrationLease: vi.fn(),
	cleanupAgentRegistrationIfMatches: vi.fn(),
	builderDexClearinghouseState: vi.fn(),
	builderFeeRefetch: vi.fn(),
	maxBuilderFee: 10,
	clearinghouseRefetch: vi.fn(),
	clearinghouseState: {
		assetPositions: [],
		marginSummary: { accountValue: "1", totalNtlPos: "0", totalRawUsd: "1" },
		withdrawable: "1",
	},
	createMobileAgentSyncUrl: vi.fn(),
	extraAgents: [] as Array<{ address: `0x${string}`; name: string; validUntil: number | null }>,
	extraAgentsError: null as Error | null,
	extraAgentsRefetch: vi.fn(),
	features: {
		createAndReveal: true,
		importFromQr: true,
		legacyLinkInput: false as const,
	},
	hasWalletAccess: true,
	isMobile: false,
	localAgent: null as Record<string, unknown> | null,
	perpDexs: vi.fn(),
	qrToCanvas: vi.fn(),
	registrationLeaseCurrent: true,
	spotRefetch: vi.fn(),
	spotState: { balances: [] as Array<{ hold?: string; total?: string }> },
	walletAddress: "0x1111111111111111111111111111111111111111" as `0x${string}` | undefined,
	writeClipboard: vi.fn(),
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

vi.mock("@lingui/core/macro", () => ({
	msg: (strings: TemplateStringsArray | string, ...values: unknown[]) => {
		if (typeof strings === "string") return strings;
		return strings.reduce((message, part, index) => `${message}${part}${values[index] ?? ""}`, "");
	},
	t: (strings: TemplateStringsArray | string, ...values: unknown[]) => {
		if (typeof strings === "string") return strings;
		return strings.reduce((message, part, index) => `${message}${part}${values[index] ?? ""}`, "");
	},
}));

vi.mock("@phosphor-icons/react", () => ({
	CheckIcon: Icon,
	DeviceMobileIcon: Icon,
	QrCodeIcon: Icon,
	ShieldCheckIcon: Icon,
	SpinnerGapIcon: Icon,
	WarningCircleIcon: Icon,
}));

vi.mock("@/hooks/use-mobile", () => ({
	useIsMobile: () => testState.isMobile,
}));

vi.mock("@gatu/ui", () => ({
	AdaptiveModal: ({
		children,
		onOpenChange,
		open,
		presentation,
	}: {
		children: ReactNode;
		onOpenChange: (open: boolean) => void;
		open: boolean;
		presentation?: string;
	}) =>
		open
			? createElement(
					"div",
					{ "data-presentation": presentation, role: "dialog" },
					createElement("button", { onClick: () => onOpenChange(false), type: "button" }, "Close modal"),
					children,
				)
			: null,
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

vi.mock("@gatu/hl-react/signing/mobile-agent", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@gatu/hl-react/signing/mobile-agent")>();
	return {
		...actual,
		createMobileAgentApproval: () => ({
			agentNameBase: "Mobile",
			agentName: AGENT_NAME,
			agentValidUntilMs: AGENT_VALID_UNTIL_MS,
			privateKey: AGENT_PRIVATE_KEY,
			publicKey: AGENT_ADDRESS,
		}),
		createMobileAgentRevocationApproval: () => ({
			agentNameBase: "Mobile",
			agentName: REVOKE_AGENT_NAME,
			agentValidUntilMs: REVOKE_VALID_UNTIL_MS,
			privateKey: REVOKE_AGENT_PRIVATE_KEY,
			publicKey: REVOKE_AGENT_ADDRESS,
		}),
	};
});

vi.mock("@gatu/hl-react", () => ({
	cleanupAgentRegistrationIfMatches: testState.cleanupAgentRegistrationIfMatches,
}));

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
	}),
}));

vi.mock("@/lib/hyperliquid", () => ({
	captureAgentRegistrationExecutionLease: testState.captureRegistrationLease,
	isAgentRegistrationExecutionLeaseCurrent: () => Promise.resolve(testState.registrationLeaseCurrent),
	isBuilderFeeApproved: (maxBuilderFee: number | undefined, requiredFee: number | string | undefined) =>
		maxBuilderFee !== undefined && requiredFee !== undefined && maxBuilderFee >= Number(requiredFee),
	useAgentWalletStorage: () => testState.localAgent,
	useHyperliquid: () => ({
		env: "Mainnet",
		builderConfig: { b: BUILDER_ADDRESS, f: 10 },
		info: { clearinghouseState: testState.builderDexClearinghouseState, perpDexs: testState.perpDexs },
	}),
	useInfo: (method: string) => {
		if (method === "extraAgents") {
			return {
				data: testState.extraAgents,
				error: testState.extraAgentsError,
				refetch: testState.extraAgentsRefetch,
			};
		}
		if (method === "maxBuilderFee") {
			return {
				data: testState.maxBuilderFee,
				error: null,
				refetch: testState.builderFeeRefetch,
			};
		}
		if (method === "spotClearinghouseState") {
			return {
				data: testState.spotState,
				error: null,
				refetch: testState.spotRefetch,
			};
		}
		return {
			data: testState.clearinghouseState,
			error: null,
			refetch: testState.clearinghouseRefetch,
		};
	},
}));

vi.mock("@/lib/mobile-sync/sync-core", () => ({
	createMobileAgentSyncUrl: testState.createMobileAgentSyncUrl,
	MOBILE_SYNC_QR_VISIBLE_MS: 60_000,
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

function dispatchPointer(target: Element, type: string) {
	target.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
}

function approvedRemoteAgent() {
	return {
		address: AGENT_ADDRESS as `0x${string}`,
		name: "Mobile",
		validUntil: AGENT_VALID_UNTIL_MS,
	};
}

function replacementRemoteAgent() {
	return {
		address: REVOKE_AGENT_ADDRESS as `0x${string}`,
		name: "Mobile",
		validUntil: REVOKE_VALID_UNTIL_MS,
	};
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
		testState.features.createAndReveal = true;
		testState.features.importFromQr = true;
		testState.approveAgent.mockReset();
		testState.approveAgent.mockResolvedValue(undefined);
		testState.captureRegistrationLease.mockReset();
		testState.captureRegistrationLease.mockReturnValue({
			epoch: {
				env: "Mainnet",
				owner: USER_ADDRESS,
				epoch: "11111111-1111-4111-8111-111111111111",
			},
		});
		testState.cleanupAgentRegistrationIfMatches.mockReset();
		testState.cleanupAgentRegistrationIfMatches.mockResolvedValue({
			status: "cleaned",
			activeOwnerCleanupIncomplete: false,
		});
		testState.maxBuilderFee = 10;
		testState.perpDexs.mockReset();
		testState.perpDexs.mockResolvedValue([null, { name: "xyz" }, { name: "flx" }]);
		testState.builderDexClearinghouseState.mockReset();
		testState.builderDexClearinghouseState.mockResolvedValue(EMPTY_CLEARINGHOUSE_STATE);
		testState.builderFeeRefetch.mockReset();
		testState.builderFeeRefetch.mockImplementation(async () => ({
			data: testState.maxBuilderFee,
			error: null,
		}));
		clearDesktopApprovalRecovery("Mainnet", USER_ADDRESS);
		clearDesktopApprovalRecovery("Mainnet", SECOND_USER_ADDRESS);
		testState.clearinghouseState = {
			assetPositions: [],
			marginSummary: { accountValue: "1", totalNtlPos: "0", totalRawUsd: "1" },
			withdrawable: "1",
		};
		testState.clearinghouseRefetch.mockReset();
		testState.clearinghouseRefetch.mockImplementation(async () => ({
			data: testState.clearinghouseState,
			error: null,
		}));
		testState.createMobileAgentSyncUrl.mockReset();
		testState.createMobileAgentSyncUrl.mockResolvedValue({
			agentAddress: AGENT_ADDRESS,
			agentName: AGENT_NAME,
			agentValidUntilMs: AGENT_VALID_UNTIL_MS,
			encodedKey: "encoded-key",
			expiresAtMs: SYNC_EXPIRES_AT_MS,
			syncId: "A".repeat(22),
			url: PHONE_LINK,
		});
		testState.extraAgents = [approvedRemoteAgent()];
		testState.extraAgentsError = null;
		testState.extraAgentsRefetch.mockReset();
		testState.extraAgentsRefetch.mockImplementation(async () => ({
			data: testState.extraAgents,
			error: testState.extraAgentsError,
		}));
		testState.localAgent = null;
		testState.qrToCanvas.mockReset();
		testState.registrationLeaseCurrent = true;
		testState.qrToCanvas.mockResolvedValue(undefined);
		testState.spotState = { balances: [] };
		testState.spotRefetch.mockReset();
		testState.spotRefetch.mockImplementation(async () => ({
			data: testState.spotState,
			error: null,
		}));
		testState.writeClipboard.mockReset();
		Object.defineProperty(window, "location", {
			configurable: true,
			value: new URL("https://app.gatu.test/trade"),
		});
		Object.defineProperty(document, "visibilityState", {
			configurable: true,
			value: "visible",
		});
		vi.spyOn(document, "hasFocus").mockReturnValue(true);
		Object.defineProperty(navigator, "clipboard", {
			configurable: true,
			value: { writeText: testState.writeClipboard },
		});
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.clearAllMocks();
		vi.useRealTimers();
		Reflect.deleteProperty(navigator, "clipboard");
	});

	async function renderModal(onOpenChange = vi.fn()) {
		const { MobileAgentSyncModal } = await import("@/components/trade/components/mobile-agent-sync-modal");
		act(() => {
			root.render(createElement(MobileAgentSyncModal, { open: true, onOpenChange }));
		});
		await flushAsyncWork();
		return onOpenChange;
	}

	async function approve() {
		expect(testState.approveAgent).not.toHaveBeenCalled();
		expect(container.textContent).toContain("Approve a mobile trading key");
		expect(getButton(container, "Approve mobile trading key").hasAttribute("disabled")).toBe(false);

		act(() => getButton(container, "Approve mobile trading key").click());
		await flushAsyncWork();
		expect(container.textContent).toContain("Trading key approved");
	}

	it("uses a drawer at the terminal mobile breakpoint", async () => {
		testState.isMobile = true;
		await renderModal();

		expect(container.querySelector('[role="dialog"]')?.getAttribute("data-presentation")).toBe("drawer");
	});

	it("runs the read-only preflight on open and signs only after the explicit approval click", async () => {
		await renderModal();

		expect(testState.clearinghouseRefetch).toHaveBeenCalledTimes(1);
		expect(testState.spotRefetch).toHaveBeenCalledTimes(1);
		expect(testState.builderFeeRefetch).toHaveBeenCalledTimes(1);
		expect(testState.approveAgent).not.toHaveBeenCalled();
		expect(container.textContent).toContain(
			"Approve a trading key on this desktop and move it to your phone only through the QR code.",
		);
		expect(container.textContent).toContain("cannot withdraw or send funds out of Hyperliquid");
		expect(container.textContent).toContain("The private key is created on this desktop and embedded in the QR code.");
		expect(container.textContent).toContain("Anyone who scans or captures the QR can trade as this Agent.");
		expect(container.textContent).toContain("Approving a new mobile key replaces the previous mobile key.");
		expect(container.textContent).toContain("Replaces the current mobile key 0x2222...2222");
		await approve();

		expect(testState.approveAgent).toHaveBeenCalledTimes(1);
		expect(testState.approveAgent).toHaveBeenCalledWith(
			{
				agentAddress: AGENT_ADDRESS,
				agentName: AGENT_NAME,
			},
			{ signal: expect.any(AbortSignal) },
		);
		expect(testState.extraAgentsRefetch).toHaveBeenCalled();
		expect(testState.createMobileAgentSyncUrl).not.toHaveBeenCalled();
		expect(container.textContent).toContain("Press and hold for 4 seconds");
		expect(getDesktopApprovalRecovery("Mainnet", USER_ADDRESS)?.phase).toBe("approved-unrevealed");
	});

	it("never signs after a failed balance preflight", async () => {
		testState.clearinghouseState = EMPTY_CLEARINGHOUSE_STATE;
		await renderModal();

		expect(container.textContent).toContain("No balance on Hyperliquid. Deposit first.");
		expect(testState.builderDexClearinghouseState.mock.calls.map(([params]) => params)).toEqual([
			{ user: USER_ADDRESS, dex: "xyz" },
			{ user: USER_ADDRESS, dex: "flx" },
		]);
		expect(testState.approveAgent).not.toHaveBeenCalled();
	});

	it("accepts an owner whose only balance sits on a builder dex", async () => {
		testState.clearinghouseState = EMPTY_CLEARINGHOUSE_STATE;
		testState.builderDexClearinghouseState.mockImplementation(async ({ dex }: { dex: string }) =>
			dex === "flx"
				? { ...EMPTY_CLEARINGHOUSE_STATE, marginSummary: { accountValue: "25", totalNtlPos: "0", totalRawUsd: "25" } }
				: EMPTY_CLEARINGHOUSE_STATE,
		);
		await renderModal();

		expect(container.querySelector('[role="alert"]')).toBeNull();
		expect(getButton(container, "Approve mobile trading key").hasAttribute("disabled")).toBe(false);
		expect(testState.approveAgent).not.toHaveBeenCalled();
	});

	it("skips the builder dex reads when the default dex already shows a balance", async () => {
		await renderModal();

		expect(getButton(container, "Approve mobile trading key").hasAttribute("disabled")).toBe(false);
		expect(testState.perpDexs).not.toHaveBeenCalled();
		expect(testState.builderDexClearinghouseState).not.toHaveBeenCalled();
	});

	it("skips the builder dex reads when only spot shows a balance", async () => {
		testState.clearinghouseState = EMPTY_CLEARINGHOUSE_STATE;
		testState.spotState = { balances: [{ hold: "0", total: "12.5" }] };
		await renderModal();

		expect(getButton(container, "Approve mobile trading key").hasAttribute("disabled")).toBe(false);
		expect(testState.perpDexs).not.toHaveBeenCalled();
	});

	it.each([
		["a builder dex request fails", () => testState.builderDexClearinghouseState.mockRejectedValue(new Error("boom"))],
		["the dex list request fails", () => testState.perpDexs.mockRejectedValue(new Error("boom"))],
		["a builder dex answers without a snapshot", () => testState.builderDexClearinghouseState.mockResolvedValue(null)],
		["a builder dex answers with an empty object", () => testState.builderDexClearinghouseState.mockResolvedValue({})],
		[
			"a builder dex answers with an amount that is not a decimal",
			() =>
				testState.builderDexClearinghouseState.mockResolvedValue({ ...EMPTY_CLEARINGHOUSE_STATE, withdrawable: "bad" }),
		],
		["the dex list is not a list", () => testState.perpDexs.mockResolvedValue({})],
	])("never reports an empty account when %s", async (_name, arrange) => {
		testState.clearinghouseState = EMPTY_CLEARINGHOUSE_STATE;
		arrange();
		await renderModal();

		expect(container.textContent).not.toContain("No balance on Hyperliquid. Deposit first.");
		expect(container.querySelector('[role="alert"]')?.textContent).toBe(ACCOUNT_CHECK_FAILED_MESSAGE);
		expect(container.textContent).not.toContain("boom");
		expect(getButton(container, "Retry check").hasAttribute("disabled")).toBe(false);
		expect(testState.approveAgent).not.toHaveBeenCalled();
	});

	it("never reports an empty account when the default dex answers without a usable snapshot", async () => {
		testState.clearinghouseState = { assetPositions: [], withdrawable: "0" } as typeof testState.clearinghouseState;
		await renderModal();

		expect(container.textContent).not.toContain("No balance on Hyperliquid. Deposit first.");
		expect(container.querySelector('[role="alert"]')?.textContent).toBe(ACCOUNT_CHECK_FAILED_MESSAGE);
	});

	it("drops a builder dex answer that arrives after the dialog closed", async () => {
		testState.clearinghouseState = EMPTY_CLEARINGHOUSE_STATE;
		const answers: Array<(state: typeof EMPTY_CLEARINGHOUSE_STATE) => void> = [];
		testState.builderDexClearinghouseState.mockImplementation(
			() =>
				new Promise<typeof EMPTY_CLEARINGHOUSE_STATE>((resolve) => {
					answers.push(resolve);
				}),
		);
		const onOpenChange = await renderModal();
		const signal = testState.perpDexs.mock.calls[0]?.[0] as AbortSignal;
		expect(signal.aborted).toBe(false);

		const { MobileAgentSyncModal } = await import("@/components/trade/components/mobile-agent-sync-modal");
		act(() => {
			root.render(createElement(MobileAgentSyncModal, { open: false, onOpenChange }));
		});
		expect(signal.aborted).toBe(true);

		expect(answers).toHaveLength(2);
		for (const answer of answers) answer(EMPTY_CLEARINGHOUSE_STATE);
		await flushAsyncWork();
		expect(container.textContent).not.toContain("No balance on Hyperliquid. Deposit first.");
		expect(testState.approveAgent).not.toHaveBeenCalled();
	});

	it("retranslates an existing preflight error when the locale changes", async () => {
		testState.clearinghouseState = {
			assetPositions: [],
			marginSummary: { accountValue: "0", totalNtlPos: "0", totalRawUsd: "0" },
			withdrawable: "0",
		};
		await renderModal();

		const alert = container.querySelector('[role="alert"]');
		expect(alert?.textContent).toContain(NO_BALANCE_MESSAGE);

		act(() => {
			i18n.loadAndActivate({
				locale: "ar",
				messages: { [getMessageId(NO_BALANCE_MESSAGE)]: NO_BALANCE_MESSAGE_AR },
			});
		});

		expect(alert?.textContent).toContain(NO_BALANCE_MESSAGE_AR);
		expect(alert?.textContent).not.toContain(NO_BALANCE_MESSAGE);
		expect(testState.approveAgent).not.toHaveBeenCalled();
	});

	it("never creates a phone key until the desktop builder fee is approved", async () => {
		testState.maxBuilderFee = 9;
		await renderModal();

		expect(testState.builderFeeRefetch).toHaveBeenCalledTimes(1);
		expect(getButton(container, "Retry check").hasAttribute("disabled")).toBe(false);
		expect(container.textContent).toContain(
			"Enable trading and approve the builder fee on this desktop before linking a phone.",
		);
		expect(testState.approveAgent).not.toHaveBeenCalled();
		expect(testState.createMobileAgentSyncUrl).not.toHaveBeenCalled();
	});

	it("rechecks the builder fee immediately before creating the approval", async () => {
		await renderModal();
		expect(container.textContent).toContain("Approve a mobile trading key");

		testState.maxBuilderFee = 0;
		act(() => getButton(container, "Approve mobile trading key").click());
		await flushAsyncWork();

		expect(testState.builderFeeRefetch).toHaveBeenCalledTimes(2);
		expect(container.textContent).toContain(
			"Enable trading and approve the builder fee on this desktop before linking a phone.",
		);
		expect(testState.approveAgent).not.toHaveBeenCalled();
		expect(hasDesktopApprovalRecovery("Mainnet", USER_ADDRESS)).toBe(false);
	});

	it("does not expose creation to an agent-only session", async () => {
		testState.walletAddress = undefined;
		testState.hasWalletAccess = false;
		await renderModal();

		expect(container.textContent).toContain("Wallet approval unavailable");
		expect(getButton(container, "Approve mobile trading key").hasAttribute("disabled")).toBe(true);
		expect(testState.clearinghouseRefetch).not.toHaveBeenCalled();
		expect(testState.builderFeeRefetch).not.toHaveBeenCalled();
		expect(testState.approveAgent).not.toHaveBeenCalled();
	});

	it("shows no replacement line when the extraAgents snapshot is missing or failed", async () => {
		testState.extraAgents = [];
		await renderModal();
		expect(container.textContent).not.toContain("Replaces the current mobile key");

		act(() => root.unmount());
		root = createI18nRoot(container);
		testState.extraAgents = [approvedRemoteAgent()];
		testState.extraAgentsError = new Error("network unavailable");
		await renderModal();
		expect(container.textContent).not.toContain("Replaces the current mobile key");
		expect(container.textContent).not.toContain("network unavailable");
	});

	it("labels the primary button with the wallet prompt while the signature is pending", async () => {
		let resolveApproval: (() => void) | undefined;
		testState.approveAgent.mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					resolveApproval = resolve;
				}),
		);
		await renderModal();
		act(() => getButton(container, "Approve mobile trading key").click());
		await flushAsyncWork();

		const pendingButton = getButton(container, "Approve QR code with wallet...");
		expect(pendingButton.hasAttribute("disabled")).toBe(true);
		expect(container.textContent).not.toContain("Approve in wallet...");

		act(() => resolveApproval?.());
		await flushAsyncWork();
		expect(container.textContent).toContain("Trading key approved");
	});

	it("retries the read-only preflight from the primary button after a failed check", async () => {
		testState.clearinghouseState = {
			assetPositions: [],
			marginSummary: { accountValue: "0", totalNtlPos: "0", totalRawUsd: "0" },
			withdrawable: "0",
		};
		await renderModal();
		expect(container.textContent).toContain(NO_BALANCE_MESSAGE);
		expect(testState.clearinghouseRefetch).toHaveBeenCalledTimes(1);

		testState.clearinghouseState = {
			assetPositions: [],
			marginSummary: { accountValue: "1", totalNtlPos: "0", totalRawUsd: "1" },
			withdrawable: "1",
		};
		act(() => getButton(container, "Retry check").click());
		await flushAsyncWork();

		expect(testState.clearinghouseRefetch).toHaveBeenCalledTimes(2);
		expect(container.textContent).not.toContain(NO_BALANCE_MESSAGE);
		expect(getButton(container, "Approve mobile trading key").hasAttribute("disabled")).toBe(false);
		expect(testState.approveAgent).not.toHaveBeenCalled();
	});

	it("reveals only after a continuous four-second hold and renders directly to canvas", async () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch");
		await import("qrcode");
		await renderModal();
		await approve();
		expect(container.textContent).toContain(
			"This QR enables trading on your phone, but not deposits or withdrawals. Do not share the QR or screenshots of it with anyone. Make sure you are not sharing your screen.",
		);
		expect(container.textContent).toContain(PHONE_JOURNEY_INSTRUCTION);
		expect(container.textContent).not.toContain("Do not photograph");
		const holdButton = getButton(container, "Press and hold for 4 seconds");
		const ring = holdButton.querySelector('[role="progressbar"]');
		expect(ring?.getAttribute("aria-valuenow")).toBe("0");
		expect(ring?.getAttribute("aria-valuemax")).toBe("100");
		const ringSvg = ring?.querySelector("svg");
		expect(ringSvg?.getAttribute("aria-hidden")).toBe("true");
		const ringCircles = ringSvg?.querySelectorAll("circle") ?? [];
		expect(ringCircles).toHaveLength(2);
		expect(Number(ringCircles[1]?.getAttribute("stroke-dashoffset"))).toBeCloseTo(2 * Math.PI * 10, 5);
		expect(container.querySelector('[role="timer"]')).toBeNull();

		act(() => dispatchPointer(holdButton, "pointerdown"));
		await advanceTime(3_999);
		expect(testState.createMobileAgentSyncUrl).not.toHaveBeenCalled();
		expect(testState.qrToCanvas).not.toHaveBeenCalled();

		await advanceTime(1);

		expect(testState.extraAgentsRefetch.mock.calls.length).toBeGreaterThanOrEqual(2);
		expect(testState.createMobileAgentSyncUrl).toHaveBeenCalledWith({
			agentName: AGENT_NAME,
			agentPrivateKey: AGENT_PRIVATE_KEY,
			agentValidUntilMs: AGENT_VALID_UNTIL_MS,
			appOrigin: "https://app.gatu.test",
			env: "Mainnet",
			nowMs: NOW_MS + 4_000,
			userAddress: USER_ADDRESS,
		});
		expect(testState.qrToCanvas).toHaveBeenCalledWith(
			expect.any(HTMLCanvasElement),
			PHONE_LINK,
			expect.objectContaining({
				errorCorrectionLevel: "L",
				margin: 1,
				width: 320,
			}),
		);
		expect(fetchSpy).not.toHaveBeenCalled();
		expect(container.querySelector('canvas[aria-label="Phone access QR code"]')).not.toBeNull();
		expect(container.querySelector("a[href]")).toBeNull();
		expect(container.innerHTML).not.toContain(PHONE_LINK);
		expect(container.textContent).not.toContain("Copy phone link");
		expect(testState.writeClipboard).not.toHaveBeenCalled();
		expect(hasDesktopApprovalRecovery("Mainnet", USER_ADDRESS)).toBe(false);
		expect(container.textContent).toContain(PHONE_JOURNEY_INSTRUCTION);
		expect(container.textContent).not.toContain("closes automatically within 60 seconds");
		const timer = container.querySelector('[role="timer"]');
		expect(timer?.textContent).toBe("Closes in 60s");
		expect(timer?.hasAttribute("aria-live")).toBe(false);
		const announcement = container.querySelector("output.sr-only");
		expect(announcement?.textContent).toBe("The QR closes automatically in about 60 seconds");

		await advanceTime(1_000);
		expect(container.querySelector('[role="timer"]')?.textContent).toBe("Closes in 59s");
		expect(container.querySelector("output.sr-only")?.textContent).toBe(
			"The QR closes automatically in about 60 seconds",
		);
		expect(testState.qrToCanvas).toHaveBeenCalledTimes(1);

		await advanceTime(58_000);
		expect(container.querySelector('[role="timer"]')?.textContent).toBe("Closes in 1s");
		expect(testState.qrToCanvas).toHaveBeenCalledTimes(1);
	});

	it("cancels the reveal hold on pointer leave, blur, Escape, and hidden visibility", async () => {
		await renderModal();
		await approve();
		const holdButton = getButton(container, "Press and hold for 4 seconds");

		act(() => {
			dispatchPointer(holdButton, "pointerdown");
			dispatchPointer(holdButton, "pointerout");
		});
		await advanceTime(4_000);

		act(() => dispatchPointer(holdButton, "pointerdown"));
		await advanceTime(1_000);
		act(() => window.dispatchEvent(new Event("blur")));
		await advanceTime(4_000);

		act(() => dispatchPointer(holdButton, "pointerdown"));
		await advanceTime(1_000);
		act(() => window.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" })));
		await advanceTime(4_000);

		act(() => dispatchPointer(holdButton, "pointerdown"));
		await advanceTime(1_000);
		Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
		act(() => document.dispatchEvent(new Event("visibilitychange")));
		await advanceTime(4_000);

		expect(testState.createMobileAgentSyncUrl).not.toHaveBeenCalled();
		expect(testState.qrToCanvas).not.toHaveBeenCalled();
	});

	it("cancels on pointer release/cancel/lost capture and supports a continuous keyboard hold", async () => {
		await renderModal();
		await approve();
		const holdButton = getButton(container, "Press and hold for 4 seconds");

		for (const cancelEvent of ["pointerup", "pointercancel", "lostpointercapture"]) {
			act(() => {
				dispatchPointer(holdButton, "pointerdown");
				dispatchPointer(holdButton, cancelEvent);
			});
			await advanceTime(4_000);
		}

		act(() => {
			holdButton.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: " " }));
		});
		await advanceTime(1_000);
		act(() => {
			holdButton.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, cancelable: true, key: " " }));
		});
		await advanceTime(4_000);
		expect(testState.createMobileAgentSyncUrl).not.toHaveBeenCalled();

		act(() => {
			holdButton.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Enter" }));
		});
		await advanceTime(3_999);
		expect(testState.createMobileAgentSyncUrl).not.toHaveBeenCalled();
		await advanceTime(1);
		expect(testState.createMobileAgentSyncUrl).toHaveBeenCalledTimes(1);
	});

	it("starts the 60-second window at reveal and deducts the rendering delay", async () => {
		let finishQrRender: (() => void) | undefined;
		testState.qrToCanvas.mockImplementationOnce(
			() =>
				new Promise<void>((resolve) => {
					finishQrRender = resolve;
				}),
		);
		const onOpenChange = await renderModal();
		await approve();
		act(() => dispatchPointer(getButton(container, "Press and hold for 4 seconds"), "pointerdown"));
		await advanceTime(4_000);
		expect(testState.qrToCanvas).toHaveBeenCalledTimes(1);
		expect(hasDesktopApprovalRecovery("Mainnet", USER_ADDRESS)).toBe(true);

		await advanceTime(5_000);
		act(() => finishQrRender?.());
		await flushAsyncWork();
		expect(hasDesktopApprovalRecovery("Mainnet", USER_ADDRESS)).toBe(false);
		expect(container.querySelector('[role="timer"]')?.textContent).toBe("Closes in 55s");

		await advanceTime(54_999);
		expect(onOpenChange).not.toHaveBeenCalledWith(false);
		expect(container.querySelector('canvas[aria-label="Phone access QR code"]')).not.toBeNull();
		expect(container.querySelector('[role="timer"]')?.textContent).toBe("Closes in 1s");

		await advanceTime(1);
		expect(onOpenChange).toHaveBeenCalledWith(false);
		expect(container.querySelector('canvas[aria-label="Phone access QR code"]')).toBeNull();
		expect(container.innerHTML).not.toContain(PHONE_LINK);
	});

	it("does not render a QR when the page becomes hidden while the envelope is being encrypted", async () => {
		let complete: ((result: Awaited<ReturnType<typeof testState.createMobileAgentSyncUrl>>) => void) | undefined;
		const result = await testState.createMobileAgentSyncUrl();
		testState.createMobileAgentSyncUrl.mockClear();
		testState.createMobileAgentSyncUrl.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					complete = resolve;
				}),
		);
		await renderModal();
		await approve();
		act(() => dispatchPointer(getButton(container, "Press and hold for 4 seconds"), "pointerdown"));
		await advanceTime(4_000);
		expect(testState.createMobileAgentSyncUrl).toHaveBeenCalledTimes(1);
		Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
		act(() => document.dispatchEvent(new Event("visibilitychange")));
		act(() => complete?.(result));
		await flushAsyncWork();
		expect(testState.qrToCanvas).not.toHaveBeenCalled();
		expect(container.querySelector('canvas[aria-label="Phone access QR code"]')).toBeNull();
	});

	it("closes at the envelope deadline when it is earlier than the visible window", async () => {
		const result = await testState.createMobileAgentSyncUrl();
		testState.createMobileAgentSyncUrl.mockClear();
		testState.createMobileAgentSyncUrl.mockResolvedValueOnce({ ...result, expiresAtMs: NOW_MS + 4_000 + 20_000 });
		const onOpenChange = await renderModal();
		await approve();
		act(() => dispatchPointer(getButton(container, "Press and hold for 4 seconds"), "pointerdown"));
		await advanceTime(4_000);
		expect(container.querySelector('[role="timer"]')?.textContent).toBe("Closes in 20s");
		expect(container.querySelector("output.sr-only")?.textContent).toBe(
			"The QR closes automatically in about 20 seconds",
		);

		await advanceTime(19_999);
		expect(onOpenChange).not.toHaveBeenCalledWith(false);
		await advanceTime(1);
		expect(onOpenChange).toHaveBeenCalledWith(false);
		expect(container.querySelector('canvas[aria-label="Phone access QR code"]')).toBeNull();
	});

	it("keeps the 60-second window on the monotonic clock when the wall clock jumps backwards", async () => {
		const onOpenChange = await renderModal();
		await approve();
		act(() => dispatchPointer(getButton(container, "Press and hold for 4 seconds"), "pointerdown"));
		await advanceTime(4_000);
		expect(container.querySelector('[role="timer"]')?.textContent).toBe("Closes in 60s");

		vi.setSystemTime(Date.now() - 10 * 60 * 1000);
		await advanceTime(1_000);
		expect(container.querySelector('[role="timer"]')?.textContent).toBe("Closes in 59s");

		await advanceTime(58_999);
		expect(onOpenChange).not.toHaveBeenCalledWith(false);
		await advanceTime(1);
		expect(onOpenChange).toHaveBeenCalledWith(false);
		expect(container.querySelector('canvas[aria-label="Phone access QR code"]')).toBeNull();
	});

	it("immediately clears and closes a visible QR when the document becomes hidden", async () => {
		const onOpenChange = await renderModal();
		await approve();
		act(() => dispatchPointer(getButton(container, "Press and hold for 4 seconds"), "pointerdown"));
		await advanceTime(4_000);
		const canvas = container.querySelector('canvas[aria-label="Phone access QR code"]');
		expect(canvas).not.toBeNull();

		Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
		act(() => document.dispatchEvent(new Event("visibilitychange")));
		await flushAsyncWork();

		expect(onOpenChange).toHaveBeenCalledWith(false);
		expect(container.querySelector('canvas[aria-label="Phone access QR code"]')).toBeNull();
		expect((canvas as HTMLCanvasElement).width).toBe(0);
	});

	it("keeps the QR concealed when the document becomes hidden during reveal revalidation", async () => {
		await renderModal();
		await approve();
		let finishRefetch: ((result: { data: typeof testState.extraAgents; error: null }) => void) | undefined;
		testState.extraAgentsRefetch.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					finishRefetch = resolve;
				}),
		);

		act(() => dispatchPointer(getButton(container, "Press and hold for 4 seconds"), "pointerdown"));
		await advanceTime(4_000);
		expect(container.textContent).toContain("Rechecking approval");

		Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
		act(() => document.dispatchEvent(new Event("visibilitychange")));
		act(() => finishRefetch?.({ data: testState.extraAgents, error: null }));
		await flushAsyncWork();

		expect(container.textContent).toContain("Trading key approved");
		expect(testState.createMobileAgentSyncUrl).not.toHaveBeenCalled();
		expect(testState.qrToCanvas).not.toHaveBeenCalled();
	});

	it("keeps the QR concealed after a transient blur during reveal revalidation", async () => {
		let pageHasFocus = true;
		vi.mocked(document.hasFocus).mockImplementation(() => pageHasFocus);
		await renderModal();
		await approve();
		let finishRefetch: ((result: { data: typeof testState.extraAgents; error: null }) => void) | undefined;
		testState.extraAgentsRefetch.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					finishRefetch = resolve;
				}),
		);

		act(() => dispatchPointer(getButton(container, "Press and hold for 4 seconds"), "pointerdown"));
		await advanceTime(4_000);
		expect(container.textContent).toContain("Rechecking approval");

		pageHasFocus = false;
		act(() => window.dispatchEvent(new Event("blur")));
		pageHasFocus = true;
		act(() => finishRefetch?.({ data: testState.extraAgents, error: null }));
		await flushAsyncWork();

		expect(container.textContent).toContain("Trading key approved");
		expect(testState.createMobileAgentSyncUrl).not.toHaveBeenCalled();
		expect(testState.qrToCanvas).not.toHaveBeenCalled();
	});

	it("clears an in-progress QR render when the page loses focus", async () => {
		let pageHasFocus = true;
		vi.mocked(document.hasFocus).mockImplementation(() => pageHasFocus);
		let finishQrRender: (() => void) | undefined;
		testState.qrToCanvas.mockImplementationOnce(
			() =>
				new Promise<void>((resolve) => {
					finishQrRender = resolve;
				}),
		);
		const onOpenChange = await renderModal();
		await approve();

		act(() => dispatchPointer(getButton(container, "Press and hold for 4 seconds"), "pointerdown"));
		await advanceTime(4_000);
		expect(testState.qrToCanvas).toHaveBeenCalledTimes(1);

		pageHasFocus = false;
		act(() => window.dispatchEvent(new Event("blur")));
		act(() => finishQrRender?.());
		await flushAsyncWork();

		expect(onOpenChange).toHaveBeenCalledWith(false);
		expect(container.querySelector('canvas[aria-label="Phone access QR code"]')).toBeNull();
		expect(hasDesktopApprovalRecovery("Mainnet", USER_ADDRESS)).toBe(true);
	});

	it("keeps approved recovery when QR canvas rendering fails before visibility starts", async () => {
		testState.qrToCanvas.mockRejectedValue(new Error("canvas unavailable"));
		const onOpenChange = await renderModal();
		await approve();
		act(() => dispatchPointer(getButton(container, "Press and hold for 4 seconds"), "pointerdown"));
		await advanceTime(4_000);

		expect(container.textContent).toContain("Could not render QR");
		expect(hasDesktopApprovalRecovery("Mainnet", USER_ADDRESS)).toBe(true);

		const { MobileAgentSyncModal } = await import("@/components/trade/components/mobile-agent-sync-modal");
		act(() => {
			root.render(createElement(MobileAgentSyncModal, { open: false, onOpenChange }));
		});

		const closedBeforeUnload = new Event("beforeunload", { cancelable: true });
		act(() => window.dispatchEvent(closedBeforeUnload));
		expect(closedBeforeUnload.defaultPrevented).toBe(true);

		act(() => root.unmount());
		root = createI18nRoot(container);
		act(() => {
			root.render(createElement(MobileAgentSyncModal, { open: false, onOpenChange }));
		});

		const remountedBeforeUnload = new Event("beforeunload", { cancelable: true });
		act(() => window.dispatchEvent(remountedBeforeUnload));
		expect(remountedBeforeUnload.defaultPrevented).toBe(true);

		act(() => {
			root.render(createElement(MobileAgentSyncModal, { open: true, onOpenChange }));
		});

		expect(container.textContent).toContain("Trading key approved");
		expect(container.textContent).toContain("Press and hold for 4 seconds");
	});

	it("never reveals when post-approval extraAgents does not match the exact tuple", async () => {
		testState.extraAgents = [];
		await renderModal();
		act(() => getButton(container, "Approve mobile trading key").click());
		await flushAsyncWork();
		await advanceTime(3_750);

		expect(container.textContent).toContain("Approval verification pending");
		expect(container.textContent).toContain("Retry read-only verification");
		expect(container.textContent).not.toContain("Press and hold for 4 seconds");
		expect(testState.createMobileAgentSyncUrl).not.toHaveBeenCalled();
	});

	it("recovers an ambiguous approval response when extraAgents confirms the exact key", async () => {
		testState.approveAgent.mockRejectedValue(new Error("network response lost"));
		await renderModal();
		await approve();

		expect(testState.approveAgent).toHaveBeenCalledTimes(1);
		expect(container.textContent).toContain("Trading key approved");
		expect(container.textContent).toContain("Press and hold for 4 seconds");
		expect(testState.createMobileAgentSyncUrl).not.toHaveBeenCalled();
	});

	it("retains a lost approval response until a later read-only retry converges", async () => {
		testState.approveAgent.mockRejectedValue(new Error("network response lost"));
		testState.extraAgents = [];
		await renderModal();
		act(() => getButton(container, "Approve mobile trading key").click());
		await flushAsyncWork();
		await advanceTime(3_750);

		expect(container.textContent).toContain("Approval verification pending");
		expect(hasDesktopApprovalRecovery("Mainnet", USER_ADDRESS)).toBe(true);
		expect(testState.approveAgent).toHaveBeenCalledTimes(1);

		testState.extraAgents = [approvedRemoteAgent()];
		act(() => getButton(container, "Retry read-only verification").click());
		await flushAsyncWork();

		expect(container.textContent).toContain("Trading key approved");
		expect(container.textContent).toContain("Press and hold for 4 seconds");
		expect(testState.approveAgent).toHaveBeenCalledTimes(1);
		expect(getDesktopApprovalRecovery("Mainnet", USER_ADDRESS)?.phase).toBe("approved-unrevealed");
	});

	it("retains the candidate while extraAgents still shows the old Mobile slot", async () => {
		testState.extraAgents = [
			{
				address: OLD_AGENT_ADDRESS,
				name: "Mobile",
				validUntil: AGENT_VALID_UNTIL_MS,
			},
		];
		await renderModal();
		act(() => getButton(container, "Approve mobile trading key").click());
		await flushAsyncWork();
		await advanceTime(3_750);

		expect(container.textContent).toContain("Approval verification pending");
		expect(hasDesktopApprovalRecovery("Mainnet", USER_ADDRESS)).toBe(true);

		testState.extraAgents = [approvedRemoteAgent()];
		act(() => getButton(container, "Retry read-only verification").click());
		await flushAsyncWork();

		expect(container.textContent).toContain("Trading key approved");
		expect(testState.approveAgent).toHaveBeenCalledTimes(1);
	});

	it("rechecks extraAgents after the hold and keeps a replaced key concealed", async () => {
		await renderModal();
		await approve();
		testState.extraAgents = [];

		act(() => dispatchPointer(getButton(container, "Press and hold for 4 seconds"), "pointerdown"));
		await advanceTime(4_000);
		await advanceTime(3_750);

		expect(container.textContent).toContain(APPROVAL_RECHECK_MESSAGE);
		expect(container.textContent).not.toContain("Press and hold for 4 seconds");
		expect(testState.createMobileAgentSyncUrl).not.toHaveBeenCalled();
		expect(testState.qrToCanvas).not.toHaveBeenCalled();
		const recoveryMessage = getDesktopApprovalRecovery("Mainnet", USER_ADDRESS)?.submissionErrorMessage;
		expect(recoveryMessage).toEqual(expect.any(String));
		expect(recoveryMessage ?? "").not.toContain(APPROVAL_RECHECK_MESSAGE);

		act(() => root.unmount());
		root = createI18nRoot(container);
		await renderModal();
		expect(container.textContent).toContain(APPROVAL_RECHECK_MESSAGE);

		act(() => {
			i18n.loadAndActivate({
				locale: "ar",
				messages: { [getMessageId(APPROVAL_RECHECK_MESSAGE)]: APPROVAL_RECHECK_MESSAGE_AR },
			});
		});
		expect(container.textContent).toContain(APPROVAL_RECHECK_MESSAGE_AR);
		expect(container.textContent).not.toContain(APPROVAL_RECHECK_MESSAGE);
		expect(testState.approveAgent).toHaveBeenCalledTimes(1);
	});

	it("does not trust matching stale extraAgents data when refetch reports an error", async () => {
		testState.extraAgentsError = new Error("network unavailable");
		await renderModal();
		act(() => getButton(container, "Approve mobile trading key").click());
		await flushAsyncWork();
		await advanceTime(3_750);

		expect(container.textContent).toContain("Approval verification pending");
		expect(container.textContent).not.toContain("Press and hold for 4 seconds");
		expect(testState.createMobileAgentSyncUrl).not.toHaveBeenCalled();
	});

	it("invalidates a late approval result when the master-wallet identity changes", async () => {
		let resolveApproval: (() => void) | undefined;
		testState.approveAgent.mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					resolveApproval = resolve;
				}),
		);
		await renderModal();
		act(() => getButton(container, "Approve mobile trading key").click());
		await flushAsyncWork();

		testState.walletAddress = SECOND_USER_ADDRESS;
		const { MobileAgentSyncModal } = await import("@/components/trade/components/mobile-agent-sync-modal");
		act(() => {
			root.render(createElement(MobileAgentSyncModal, { open: true, onOpenChange: vi.fn() }));
		});
		act(() => resolveApproval?.());
		await flushAsyncWork();

		expect(getButton(container, "Approve mobile trading key").hasAttribute("disabled")).toBe(false);
		expect(container.textContent).not.toContain("Trading key approved");
		expect(testState.createMobileAgentSyncUrl).not.toHaveBeenCalled();
	});

	it("recovers a submitting approval after a same-owner modal remount without signing twice", async () => {
		let resolveApproval: (() => void) | undefined;
		testState.approveAgent.mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					resolveApproval = resolve;
				}),
		);
		testState.extraAgents = [];
		await renderModal();
		act(() => getButton(container, "Approve mobile trading key").click());
		await flushAsyncWork();
		expect(testState.approveAgent).toHaveBeenCalledTimes(1);

		act(() => root.unmount());
		root = createI18nRoot(container);
		await renderModal();

		expect(container.textContent).toContain("Approval verification pending");
		expect(container.textContent).not.toContain("Approve mobile trading key");
		expect(testState.approveAgent).toHaveBeenCalledTimes(1);

		testState.extraAgents = [approvedRemoteAgent()];
		act(() => getButton(container, "Retry read-only verification").click());
		await flushAsyncWork();
		act(() => resolveApproval?.());
		await flushAsyncWork();

		expect(container.textContent).toContain("Trading key approved");
		expect(testState.approveAgent).toHaveBeenCalledTimes(1);
	});

	it("recovers an approved but unrevealed key after the modal closes and reopens", async () => {
		const onOpenChange = await renderModal();
		await approve();
		act(() => getButton(container, "Close modal").click());
		expect(onOpenChange).toHaveBeenCalledWith(false);

		const { MobileAgentSyncModal } = await import("@/components/trade/components/mobile-agent-sync-modal");
		act(() => {
			root.render(createElement(MobileAgentSyncModal, { open: false, onOpenChange }));
		});
		act(() => {
			root.render(createElement(MobileAgentSyncModal, { open: true, onOpenChange }));
		});

		expect(container.textContent).toContain("Trading key approved");
		expect(container.textContent).toContain("Press and hold for 4 seconds");
		expect(testState.approveAgent).toHaveBeenCalledTimes(1);

		const beforeUnload = new Event("beforeunload", { cancelable: true });
		act(() => window.dispatchEvent(beforeUnload));
		expect(beforeUnload.defaultPrevented).toBe(true);
	});

	it("blocks dismissal and browser unload while a wallet approval is unsettled", async () => {
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

		act(() => getButton(container, "Close modal").click());
		expect(onOpenChange).not.toHaveBeenCalled();
		expect(container.textContent).toContain("Keep this window open");

		const beforeUnload = new Event("beforeunload", { cancelable: true });
		act(() => {
			window.dispatchEvent(beforeUnload);
		});
		expect(beforeUnload.defaultPrevented).toBe(true);

		act(() => resolveApproval?.());
		await flushAsyncWork();
		act(() => getButton(container, "Close modal").click());
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("requires an explicit revoke confirmation and clears local state only after remote reconciliation", async () => {
		testState.extraAgents = [
			{
				address: OLD_AGENT_ADDRESS,
				name: "Mobile",
				validUntil: AGENT_VALID_UNTIL_MS,
			},
		];
		testState.localAgent = {
			agentName: AGENT_NAME,
			agentNameBase: "Mobile",
			agentValidUntilMs: AGENT_VALID_UNTIL_MS,
			importedAtMs: NOW_MS,
			privateKey: OLD_AGENT_PRIVATE_KEY,
			publicKey: OLD_AGENT_ADDRESS,
			source: "mobile-sync",
			syncId: "old-sync",
		};
		testState.approveAgent.mockImplementation(async ({ agentAddress }: { agentAddress: string }) => {
			if (agentAddress === REVOKE_AGENT_ADDRESS) testState.extraAgents = [replacementRemoteAgent()];
		});
		await renderModal();

		act(() => getButton(container, "Review revoke").click());
		await flushAsyncWork();
		expect(testState.approveAgent).not.toHaveBeenCalled();
		expect(container.textContent).toContain("Existing phones will stop trading");

		act(() => getButton(container, "Confirm revoke in wallet").click());
		await flushAsyncWork();

		expect(testState.approveAgent).toHaveBeenCalledTimes(1);
		expect(testState.approveAgent).toHaveBeenCalledWith(
			{
				agentAddress: REVOKE_AGENT_ADDRESS,
				agentName: REVOKE_AGENT_NAME,
			},
			{ signal: expect.any(AbortSignal) },
		);
		expect(container.textContent).toContain("Mobile access revoked");
		expect(testState.cleanupAgentRegistrationIfMatches).toHaveBeenCalledWith("Mainnet", USER_ADDRESS, {
			kind: "public-key",
			publicKey: OLD_AGENT_ADDRESS,
		});
	});

	it("clears an approved desktop recovery only after revoke is remotely confirmed", async () => {
		await renderModal();
		await approve();
		expect(hasDesktopApprovalRecovery("Mainnet", USER_ADDRESS)).toBe(true);

		// A temporarily empty read must not be treated as proof that the
		// still-recoverable approval is revoked.
		testState.extraAgents = [];
		testState.approveAgent.mockImplementation(async ({ agentAddress }: { agentAddress: string }) => {
			if (agentAddress === REVOKE_AGENT_ADDRESS) testState.extraAgents = [replacementRemoteAgent()];
		});
		act(() => getButton(container, "Review revoke").click());
		await flushAsyncWork();
		expect(hasDesktopApprovalRecovery("Mainnet", USER_ADDRESS)).toBe(true);
		expect(container.textContent).not.toContain("Mobile access revoked");
		expect(testState.approveAgent).toHaveBeenCalledTimes(1);
		act(() => getButton(container, "Confirm revoke in wallet").click());
		await flushAsyncWork();

		expect(container.textContent).toContain("Mobile access revoked");
		expect(hasDesktopApprovalRecovery("Mainnet", USER_ADDRESS)).toBe(false);
		expect(testState.approveAgent).toHaveBeenCalledTimes(2);
	});

	it("reports partial local cleanup without downgrading a remotely confirmed revoke", async () => {
		testState.extraAgents = [
			{
				address: OLD_AGENT_ADDRESS,
				name: "Mobile",
				validUntil: AGENT_VALID_UNTIL_MS,
			},
		];
		testState.localAgent = {
			agentName: AGENT_NAME,
			agentNameBase: "Mobile",
			agentValidUntilMs: AGENT_VALID_UNTIL_MS,
			importedAtMs: NOW_MS,
			privateKey: OLD_AGENT_PRIVATE_KEY,
			publicKey: OLD_AGENT_ADDRESS,
			source: "mobile-sync",
			syncId: "old-sync",
		};
		testState.cleanupAgentRegistrationIfMatches.mockRejectedValue(new Error("storage blocked"));
		testState.approveAgent.mockImplementation(async ({ agentAddress }: { agentAddress: string }) => {
			if (agentAddress === REVOKE_AGENT_ADDRESS) testState.extraAgents = [replacementRemoteAgent()];
		});
		await renderModal();

		act(() => getButton(container, "Review revoke").click());
		await flushAsyncWork();
		act(() => getButton(container, "Confirm revoke in wallet").click());
		await flushAsyncWork();

		expect(container.textContent).toContain("Remote access is revoked");
		expect(container.textContent).not.toContain("not yet confirmed");
		expect(testState.cleanupAgentRegistrationIfMatches).toHaveBeenCalledWith("Mainnet", USER_ADDRESS, {
			kind: "public-key",
			publicKey: OLD_AGENT_ADDRESS,
		});
	});

	it("reports partial local cleanup when the matching active owner cannot be removed", async () => {
		testState.extraAgents = [
			{
				address: OLD_AGENT_ADDRESS,
				name: "Mobile",
				validUntil: AGENT_VALID_UNTIL_MS,
			},
		];
		testState.cleanupAgentRegistrationIfMatches.mockResolvedValue({
			status: "cleaned",
			activeOwnerCleanupIncomplete: true,
		});
		testState.approveAgent.mockImplementation(async ({ agentAddress }: { agentAddress: string }) => {
			if (agentAddress === REVOKE_AGENT_ADDRESS) testState.extraAgents = [replacementRemoteAgent()];
		});
		await renderModal();

		act(() => getButton(container, "Review revoke").click());
		await flushAsyncWork();
		act(() => getButton(container, "Confirm revoke in wallet").click());
		await flushAsyncWork();

		expect(container.textContent).toContain("Remote access is revoked");
		expect(testState.cleanupAgentRegistrationIfMatches).toHaveBeenCalledWith("Mainnet", USER_ADDRESS, {
			kind: "absent-record",
		});
	});

	it("keeps an ambiguous revoke pending and retries verification without signing again", async () => {
		testState.extraAgents = [
			{
				address: OLD_AGENT_ADDRESS,
				name: "Mobile",
				validUntil: AGENT_VALID_UNTIL_MS,
			},
		];
		await renderModal();
		act(() => getButton(container, "Review revoke").click());
		await flushAsyncWork();
		act(() => getButton(container, "Confirm revoke in wallet").click());
		await flushAsyncWork();
		await advanceTime(3_750);

		expect(container.textContent).toContain("not yet confirmed");
		expect(testState.approveAgent).toHaveBeenCalledTimes(1);
		expect(testState.cleanupAgentRegistrationIfMatches).not.toHaveBeenCalled();

		testState.extraAgents = [replacementRemoteAgent()];
		act(() => getButton(container, "Retry verification").click());
		await flushAsyncWork();

		expect(container.textContent).toContain("Mobile access revoked");
		expect(testState.approveAgent).toHaveBeenCalledTimes(1);
	});

	it("requires a new signed revocation when an unobserved replacement expires", async () => {
		testState.extraAgents = [
			{
				address: OLD_AGENT_ADDRESS,
				name: "Mobile",
				validUntil: AGENT_VALID_UNTIL_MS,
			},
		];
		await renderModal();
		act(() => getButton(container, "Review revoke").click());
		await flushAsyncWork();
		act(() => getButton(container, "Confirm revoke in wallet").click());
		await flushAsyncWork();
		await advanceTime(3_750);
		expect(container.textContent).toContain("not yet confirmed");

		await advanceTime(10 * 60 * 1000);
		testState.extraAgents = [];
		act(() => getButton(container, "Retry verification").click());
		await flushAsyncWork();
		await advanceTime(3_750);

		expect(container.textContent).toContain(
			"The replacement expired before Hyperliquid confirmed it. Review and sign a new revocation.",
		);
		expect(container.textContent).not.toContain("No approved mobile Agent remains");
		expect(getButton(container, "Review revoke")).not.toBeNull();
		expect(testState.approveAgent).toHaveBeenCalledTimes(1);
		expect(testState.cleanupAgentRegistrationIfMatches).not.toHaveBeenCalled();
	});

	it("does not treat an undefined extraAgents response as a completed revoke", async () => {
		testState.extraAgents = [
			{
				address: OLD_AGENT_ADDRESS,
				name: "Mobile",
				validUntil: AGENT_VALID_UNTIL_MS,
			},
		];
		await renderModal();
		act(() => getButton(container, "Review revoke").click());
		await flushAsyncWork();
		act(() => getButton(container, "Confirm revoke in wallet").click());
		await flushAsyncWork();
		await advanceTime(3_750);
		expect(container.textContent).toContain("not yet confirmed");

		testState.extraAgentsRefetch.mockResolvedValue({ data: undefined, error: null });
		act(() => getButton(container, "Retry verification").click());
		await flushAsyncWork();
		await advanceTime(3_750);

		expect(container.textContent).toContain("not yet confirmed");
		expect(container.textContent).not.toContain("Mobile access revoked");
		expect(container.textContent).not.toContain("No approved mobile Agent remains");
		expect(testState.cleanupAgentRegistrationIfMatches).not.toHaveBeenCalled();
	});

	it("does not claim revoke success when another concurrent Mobile Agent replaced the slot", async () => {
		testState.extraAgents = [
			{
				address: OLD_AGENT_ADDRESS,
				name: "Mobile",
				validUntil: AGENT_VALID_UNTIL_MS,
			},
		];
		await renderModal();
		act(() => getButton(container, "Review revoke").click());
		await flushAsyncWork();
		act(() => getButton(container, "Confirm revoke in wallet").click());
		await flushAsyncWork();
		await advanceTime(3_750);

		testState.extraAgents = [
			{
				address: "0x5555555555555555555555555555555555555555",
				name: "Mobile",
				validUntil: AGENT_VALID_UNTIL_MS,
			},
		];
		act(() => getButton(container, "Retry verification").click());
		await flushAsyncWork();
		await advanceTime(3_750);

		expect(container.textContent).toContain("not yet confirmed");
		expect(container.textContent).not.toContain("Mobile access revoked");
		expect(testState.cleanupAgentRegistrationIfMatches).not.toHaveBeenCalled();
		expect(testState.approveAgent).toHaveBeenCalledTimes(1);
	});

	it("keeps revoke available while the create feature gate is closed", async () => {
		testState.features.createAndReveal = false;
		testState.extraAgents = [];
		testState.approveAgent.mockImplementation(async ({ agentAddress }: { agentAddress: string }) => {
			if (agentAddress === REVOKE_AGENT_ADDRESS) testState.extraAgents = [replacementRemoteAgent()];
		});
		await renderModal();

		expect(container.textContent).toContain("New mobile pairing is temporarily unavailable");
		expect(container.textContent).not.toContain("Approve mobile trading key");
		expect(testState.clearinghouseRefetch).not.toHaveBeenCalled();
		act(() => getButton(container, "Review revoke").click());
		await flushAsyncWork();

		expect(container.textContent).toContain("Confirm revoke in wallet");
		expect(container.textContent).not.toContain("No approved mobile Agent remains");
		expect(testState.approveAgent).not.toHaveBeenCalled();
		act(() => getButton(container, "Confirm revoke in wallet").click());
		await flushAsyncWork();

		expect(container.textContent).toContain("Mobile access revoked");
		expect(testState.approveAgent).toHaveBeenCalledTimes(1);
		expect(testState.cleanupAgentRegistrationIfMatches).toHaveBeenCalledWith("Mainnet", USER_ADDRESS, {
			kind: "absent-record",
		});
	});
});
