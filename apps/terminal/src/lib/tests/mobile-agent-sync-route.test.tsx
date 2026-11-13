// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { act, type ComponentType, createElement, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { privateKeyToAccount } from "viem/accounts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMobileAgentSyncUrl } from "../mobile-sync/sync-core";
import { createI18nRoot } from "./harness/react";

const NOW_MS = 1_779_364_227_000;
const USER_ADDRESS = "0x1111111111111111111111111111111111111111" as const;
const AGENT_PRIVATE_KEY = `0x${"ab".repeat(32)}` as const;
const AGENT_ADDRESS = privateKeyToAccount(AGENT_PRIVATE_KEY).address.toLowerCase();
const AGENT_VALID_UNTIL_MS = NOW_MS + 30 * 24 * 60 * 60 * 1000;
const NOT_APPROVED = msg`The desktop has not approved this key. Create a new QR on desktop.`;
const REGISTRATION_EPOCH = {
	env: "Mainnet",
	owner: USER_ADDRESS,
	epoch: "11111111-1111-4111-8111-111111111111",
} as const;

const testState = vi.hoisted(() => ({
	activateAgentOwnerForRegistration: vi.fn(),
	cancelAgentRegistrationEpochAndRemove: vi.fn(),
	captureAgentRegistrationEpoch: vi.fn(),
	importEnabled: true,
	infoExtraAgents: vi.fn(),
	persistAgentForRegistration: vi.fn(),
	pwaCapability: "unsupported" as "browser-prompt" | "ios-instructions" | "installed" | "unsupported",
	sessionMode: "disconnected" as "wallet" | "agent-only" | "disconnected",
	verifyAgentRegistrationOrRemove: vi.fn(),
}));

function Icon({ className }: { className?: string }) {
	return createElement("span", { className, "aria-hidden": true });
}

vi.mock("@phosphor-icons/react", () => ({
	CheckCircleIcon: Icon,
	DeviceMobileIcon: Icon,
	SpinnerGapIcon: Icon,
	WarningCircleIcon: Icon,
}));

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: unknown) => options,
}));

vi.mock("@sairn/ui", () => ({
	Button: ({
		children,
		disabled,
		onClick,
		type,
	}: {
		children: ReactNode;
		disabled?: boolean;
		onClick?: () => void;
		type?: "button" | "submit" | "reset";
	}) => createElement("button", { disabled, onClick, type: type ?? "button" }, children),
}));

vi.mock("@/providers/pwa-install", () => ({
	usePwaInstall: () => ({ capability: testState.pwaCapability, promptInstall: vi.fn() }),
}));

vi.mock("@/config/mobile-pairing", () => ({
	MOBILE_PAIRING_FEATURES: {
		get enabled() {
			return testState.importEnabled;
		},
	},
}));

vi.mock("@/lib/hyperliquid", () => ({
	useHyperliquid: () => ({
		env: "Mainnet",
		sessionMode: testState.sessionMode,
		info: {
			extraAgents: testState.infoExtraAgents,
		},
	}),
}));

vi.mock("@sairn/hl-react", async () => {
	const actual = await vi.importActual<typeof import("@sairn/hl-react")>("@sairn/hl-react");
	return {
		...actual,
		activateAgentOwnerForRegistration: testState.activateAgentOwnerForRegistration,
		cancelAgentRegistrationEpochAndRemove: testState.cancelAgentRegistrationEpochAndRemove,
		captureAgentRegistrationEpoch: testState.captureAgentRegistrationEpoch,
		persistAgentForRegistration: testState.persistAgentForRegistration,
		verifyAgentRegistrationOrRemove: testState.verifyAgentRegistrationOrRemove,
	};
});

async function flushAsyncWork(times = 8) {
	for (let index = 0; index < times; index++) {
		await act(async () => {
			await new Promise((resolve) => window.setTimeout(resolve, 0));
		});
	}
}

function createLink({
	env = "Mainnet",
	nowMs = NOW_MS,
	userAddress = USER_ADDRESS,
}: {
	env?: "Mainnet" | "Testnet";
	nowMs?: number;
	userAddress?: `0x${string}`;
} = {}) {
	return createMobileAgentSyncUrl({
		appOrigin: window.location.origin,
		env,
		userAddress,
		agentPrivateKey: AGENT_PRIVATE_KEY,
		agentValidUntilMs: nowMs + 30 * 24 * 60 * 60 * 1000,
		nowMs,
	});
}

function approvedRemoteAgent() {
	return { address: AGENT_ADDRESS as `0x${string}`, name: "Mobile QR", validUntil: AGENT_VALID_UNTIL_MS };
}

function findButton(container: HTMLElement, text: string) {
	return [...container.querySelectorAll("button")].find((button) => button.textContent?.includes(text));
}

describe("mobile agent sync route", () => {
	let container: HTMLDivElement;
	let root: Root;
	let RouteComponent: ComponentType;

	beforeEach(async () => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		vi.spyOn(Date, "now").mockReturnValue(NOW_MS + 5_000);
		testState.importEnabled = true;
		testState.pwaCapability = "unsupported";
		testState.sessionMode = "disconnected";
		testState.infoExtraAgents.mockReset();
		testState.infoExtraAgents.mockResolvedValue([approvedRemoteAgent()]);
		testState.captureAgentRegistrationEpoch.mockReset();
		testState.captureAgentRegistrationEpoch.mockResolvedValue({ status: "ready", epoch: REGISTRATION_EPOCH });
		testState.persistAgentForRegistration.mockReset();
		testState.persistAgentForRegistration.mockResolvedValue({ status: "stored" });
		testState.activateAgentOwnerForRegistration.mockReset();
		testState.activateAgentOwnerForRegistration.mockResolvedValue({ status: "current" });
		testState.verifyAgentRegistrationOrRemove.mockReset();
		testState.verifyAgentRegistrationOrRemove.mockResolvedValue({ status: "current" });
		testState.cancelAgentRegistrationEpochAndRemove.mockReset();
		testState.cancelAgentRegistrationEpochAndRemove.mockResolvedValue({ status: "cancelled" });
		window.history.replaceState(null, "", "/mobile-agent-sync");
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		const { Route } = await import("@/routes/mobile-agent-sync");
		RouteComponent = (Route as unknown as { component: ComponentType }).component;
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		window.history.replaceState(null, "", "/");
		vi.restoreAllMocks();
	});

	function renderRoute(hash: string | null) {
		if (hash !== null) window.location.hash = hash;
		act(() => {
			root.render(createElement(RouteComponent));
		});
	}

	function linkHash(link: { url: string }) {
		return new URL(link.url).hash;
	}

	function displayedAccounts() {
		return [...container.querySelectorAll('[data-slot="mobile-sync-account"]')].map((node) => node.textContent);
	}

	it("shows the account the key belongs to and the same account that the import writes", async () => {
		const otherOwner = "0x2222222222222222222222222222222222222abc" as const;
		testState.captureAgentRegistrationEpoch.mockImplementation(async (env: string, owner: string) => ({
			status: "ready",
			epoch: { ...REGISTRATION_EPOCH, env, owner },
		}));
		testState.infoExtraAgents.mockImplementation(async ({ user }: { user: string }) =>
			user === otherOwner ? [approvedRemoteAgent()] : [],
		);
		renderRoute(linkHash(createLink({ userAddress: otherOwner })));

		expect(container.textContent).toContain("Account");
		const [shownBeforeImport] = displayedAccounts();
		expect(displayedAccounts()).toHaveLength(1);

		act(() => findButton(container, "Import")?.click());
		await flushAsyncWork();

		expect(container.textContent).toContain("Phone access ready");
		const writtenEpoch = testState.persistAgentForRegistration.mock.calls[0]?.[0] as { owner: string };
		const activatedEpoch = testState.activateAgentOwnerForRegistration.mock.calls[0]?.[0] as { owner: string };
		expect(shownBeforeImport).toBe(writtenEpoch.owner);
		expect(shownBeforeImport).toBe(activatedEpoch.owner);
		expect(shownBeforeImport).toBe(otherOwner);
		expect(displayedAccounts()).toEqual([writtenEpoch.owner]);
	});

	it("warns before Import only when this phone already has a trading session", async () => {
		const notice = "Importing replaces the current trading session on this phone.";
		renderRoute(linkHash(createLink()));
		expect(container.textContent).not.toContain(notice);

		for (const mode of ["wallet", "agent-only"] as const) {
			act(() => root.unmount());
			root = createI18nRoot(container);
			testState.sessionMode = mode;
			renderRoute(linkHash(createLink()));
			expect(container.textContent).toContain(notice);
		}

		act(() => findButton(container, "Import")?.click());
		await flushAsyncWork();
		expect(container.textContent).toContain("Phone access ready");
		expect(container.textContent).not.toContain(notice);
	});

	it("shows neither the account nor the warning without a loaded QR", async () => {
		testState.sessionMode = "wallet";
		renderRoute(null);
		expect(displayedAccounts()).toEqual([]);
		expect(container.textContent).not.toContain("Importing replaces");
	});

	it("scrubs the fragment before the first paint and waits for an explicit Import", async () => {
		renderRoute(linkHash(createLink()));

		expect(window.location.hash).toBe("");
		expect(window.location.pathname).toBe("/mobile-agent-sync");
		expect(container.textContent).toContain("Once imported, this phone trades on Mainnet");
		expect(findButton(container, "Import")?.disabled).toBe(false);
		expect(testState.infoExtraAgents).not.toHaveBeenCalled();
		expect(testState.persistAgentForRegistration).not.toHaveBeenCalled();
	});

	it("imports only after the exact approval is verified, then stores and activates the owner", async () => {
		renderRoute(linkHash(createLink()));
		act(() => findButton(container, "Import")?.click());
		await flushAsyncWork();

		expect(testState.infoExtraAgents).toHaveBeenCalledWith({ user: USER_ADDRESS }, expect.any(AbortSignal));
		expect(testState.captureAgentRegistrationEpoch).toHaveBeenCalledWith("Mainnet", USER_ADDRESS);
		expect(testState.persistAgentForRegistration).toHaveBeenCalledWith(
			REGISTRATION_EPOCH,
			AGENT_PRIVATE_KEY,
			AGENT_ADDRESS,
			{
				source: "mobile-sync",
				agentNameBase: "Mobile QR",
				agentName: `Mobile QR valid_until ${AGENT_VALID_UNTIL_MS}`,
				agentValidUntilMs: AGENT_VALID_UNTIL_MS,
				importedAtMs: NOW_MS + 5_000,
			},
			{ scope: "local" },
		);
		expect(testState.activateAgentOwnerForRegistration).toHaveBeenCalledWith(REGISTRATION_EPOCH, AGENT_ADDRESS);
		expect(testState.verifyAgentRegistrationOrRemove).toHaveBeenCalledWith(REGISTRATION_EPOCH, AGENT_ADDRESS);
		expect(testState.cancelAgentRegistrationEpochAndRemove).not.toHaveBeenCalled();
		expect(container.textContent).toContain("Phone access ready");
		expect(container.textContent).toContain(AGENT_ADDRESS);
		expect(container.textContent).toContain("Open terminal");
		expect(findButton(container, "Import")).toBeUndefined();
	});

	it("tells an iOS browser user that the key stays in this browser, not the Home Screen app", async () => {
		testState.pwaCapability = "ios-instructions";
		renderRoute(linkHash(createLink()));
		act(() => findButton(container, "Import")?.click());
		await flushAsyncWork();

		expect(container.textContent).toContain("Phone access ready");
		expect(container.textContent).toContain("Access is stored in this browser only.");
	});

	it("fails closed when the desktop has not approved this key and keeps the link for a retry", async () => {
		testState.infoExtraAgents.mockResolvedValue([]);
		renderRoute(linkHash(createLink()));
		act(() => findButton(container, "Import")?.click());
		await flushAsyncWork();

		expect(container.textContent).toContain("The desktop has not approved this key.");
		expect(testState.captureAgentRegistrationEpoch).not.toHaveBeenCalled();
		expect(testState.persistAgentForRegistration).not.toHaveBeenCalled();
		expect(findButton(container, "Import")?.disabled).toBe(false);

		testState.infoExtraAgents.mockResolvedValue([approvedRemoteAgent()]);
		act(() => findButton(container, "Import")?.click());
		await flushAsyncWork();
		expect(container.textContent).toContain("Phone access ready");
	});

	it("renders an import failure in the active language and follows a language switch", async () => {
		testState.infoExtraAgents.mockResolvedValue([]);
		renderRoute(linkHash(createLink()));
		act(() => findButton(container, "Import")?.click());
		await flushAsyncWork();

		expect(container.textContent).toContain("The desktop has not approved this key.");

		act(() =>
			i18n.loadAndActivate({
				locale: "zh",
				messages: { [NOT_APPROVED.id]: "桌面端尚未批准此密钥。请在桌面端创建新的二维码。" },
			}),
		);

		expect(container.textContent).toContain("桌面端尚未批准此密钥。请在桌面端创建新的二维码。");
		expect(container.textContent).not.toContain("The desktop has not approved this key.");
	});

	it("reports an unreachable approval check without importing", async () => {
		testState.infoExtraAgents.mockRejectedValue(new Error("network down"));
		renderRoute(linkHash(createLink()));
		act(() => findButton(container, "Import")?.click());
		await flushAsyncWork();

		expect(container.textContent).toContain("Could not check the approval on Hyperliquid.");
		expect(container.textContent).not.toContain("network down");
		expect(testState.persistAgentForRegistration).not.toHaveBeenCalled();
	});

	it("rolls back the stored key when owner activation is no longer current", async () => {
		testState.activateAgentOwnerForRegistration.mockResolvedValue({ status: "stale" });
		renderRoute(linkHash(createLink()));
		act(() => findButton(container, "Import")?.click());
		await flushAsyncWork();

		expect(testState.cancelAgentRegistrationEpochAndRemove).toHaveBeenCalledWith(REGISTRATION_EPOCH, AGENT_ADDRESS);
		expect(container.textContent).toContain("This phone could not store the trading key.");
		expect(container.textContent).not.toContain("Phone access ready");
	});

	it("rejects an expired QR, a QR from another network and a legacy encrypted link", async () => {
		renderRoute(linkHash(createLink({ nowMs: NOW_MS - 10 * 60 * 1000 })));
		expect(container.textContent).toContain("This QR expired.");
		expect(findButton(container, "Import")?.disabled).toBe(true);

		act(() => root.unmount());
		root = createI18nRoot(container);
		renderRoute(linkHash(createLink({ env: "Testnet" })));
		expect(container.textContent).toContain("This QR belongs to a different network.");
		expect(findButton(container, "Import")?.disabled).toBe(true);

		act(() => root.unmount());
		root = createI18nRoot(container);
		renderRoute("#sairn-mobile-sync=abc&k=def");
		expect(container.textContent).toContain("Refresh both devices to update phone access");
		expect(window.location.hash).toBe("");
		expect(findButton(container, "Import")?.disabled).toBe(true);
	});

	it("keeps Import disabled without a fragment, so a reload asks for a new scan", async () => {
		renderRoute(null);

		expect(container.textContent).toContain("Scan the QR from Link mobile device on your desktop");
		expect(findButton(container, "Import")?.disabled).toBe(true);
	});

	it("scrubs and discards the fragment while pairing is gated off", async () => {
		testState.importEnabled = false;
		renderRoute(linkHash(createLink()));

		expect(window.location.hash).toBe("");
		expect(container.textContent).toContain("Mobile QR import is temporarily unavailable.");
		expect(findButton(container, "Import")?.disabled).toBe(true);
		expect(testState.infoExtraAgents).not.toHaveBeenCalled();
	});
});
