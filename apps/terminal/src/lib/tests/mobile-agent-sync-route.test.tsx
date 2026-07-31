// @vitest-environment jsdom

import { webcrypto } from "node:crypto";
import { act, type ComponentType, createElement, Fragment, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MOBILE_SYNC_DRAFT_STORAGE_KEY } from "../mobile-sync/draft-storage";
import { createMobileAgentSyncUrl, MOBILE_SYNC_ROUTE_PATH } from "../mobile-sync/sync-core";
import { createI18nRoot } from "./harness/react";

const NOW_MS = 1_779_364_227_000;
const USER_ADDRESS = "0x1111111111111111111111111111111111111111" as const;
const AGENT_PRIVATE_KEY = `0x${"ab".repeat(32)}` as const;

const testState = vi.hoisted(() => ({
	activeAgentOwner: null as { env: "Mainnet" | "Testnet"; address: `0x${string}` } | null,
	clearActiveAgentOwnerIfMatches: vi.fn(),
	fullNavigate: vi.fn(),
	importEnabled: true,
	extraAgents: [] as Array<{ address: string; name: string; validUntil: number | null }>,
	infoExtraAgents: vi.fn(),
	waitForExpectedMobileAgent: vi.fn(),
	writeAgentToStorageAndVerify: vi.fn(),
	setActiveAgentOwnerAndVerify: vi.fn(),
	removeAgentFromStorage: vi.fn(),
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
	t: (strings: TemplateStringsArray | string, ...values: unknown[]) =>
		typeof strings === "string"
			? strings
			: strings.reduce((message, part, index) => `${message}${part}${values[index] ?? ""}`, ""),
}));

vi.mock("@phosphor-icons/react", () => ({
	CheckCircleIcon: Icon,
	DeviceMobileIcon: Icon,
	SpinnerGapIcon: Icon,
	WarningCircleIcon: Icon,
}));

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: unknown) => options,
}));

vi.mock("@gatu/ui", () => ({
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

vi.mock("@/config/mobile-pairing", () => ({
	MOBILE_PAIRING_FEATURES: {
		get importFromQr() {
			return testState.importEnabled;
		},
	},
}));

vi.mock("@/lib/hyperliquid", () => ({
	useHyperliquid: () => ({
		env: "Mainnet",
		info: {
			extraAgents: testState.infoExtraAgents,
		},
	}),
}));

vi.mock("@/lib/mobile-sync/remote-verification", () => ({
	waitForExpectedMobileAgent: testState.waitForExpectedMobileAgent,
}));

vi.mock("@/lib/mobile-sync/sync-core", async () => {
	const actual = await vi.importActual<typeof import("../mobile-sync/sync-core")>("@/lib/mobile-sync/sync-core");
	return {
		...actual,
		readAndClearMobileSyncEnvelope: () =>
			actual.readAndClearMobileSyncEnvelope(window.location, window.history, {
				replace: testState.fullNavigate,
			}),
	};
});

vi.mock("@gatu/hl-react", async () => {
	const actual = await vi.importActual<typeof import("@gatu/hl-react")>("@gatu/hl-react");
	return {
		...actual,
		clearActiveAgentOwnerIfMatches: testState.clearActiveAgentOwnerIfMatches,
		getActiveAgentOwner: () => testState.activeAgentOwner,
		writeAgentToStorageAndVerify: testState.writeAgentToStorageAndVerify,
		setActiveAgentOwnerAndVerify: testState.setActiveAgentOwnerAndVerify,
		removeAgentFromStorageAndVerify: testState.removeAgentFromStorage,
	};
});

async function flushAsyncWork(times = 8) {
	for (let index = 0; index < times; index++) {
		await act(async () => {
			await new Promise((resolve) => window.setTimeout(resolve, 0));
		});
	}
}

async function createSyncFixture({
	appOrigin = window.location.origin,
	env = "Mainnet",
}: {
	appOrigin?: string;
	env?: "Mainnet" | "Testnet";
} = {}) {
	return createMobileAgentSyncUrl({
		appOrigin,
		env,
		userAddress: USER_ADDRESS,
		agentPrivateKey: AGENT_PRIVATE_KEY,
		nowMs: NOW_MS,
	});
}

function findButton(container: HTMLElement, label: string): HTMLButtonElement | undefined {
	return [...container.querySelectorAll("button")].find((button) => button.textContent?.includes(label));
}

describe("MobileAgentSyncRoute", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		vi.resetModules();
		vi.stubGlobal("crypto", webcrypto);
		Object.defineProperty(window, "crypto", { value: webcrypto, configurable: true });
		vi.spyOn(Date, "now").mockReturnValue(NOW_MS);
		window.sessionStorage.clear();
		window.localStorage.clear();
		window.history.replaceState(null, "", MOBILE_SYNC_ROUTE_PATH);
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);

		testState.importEnabled = true;
		testState.activeAgentOwner = null;
		testState.clearActiveAgentOwnerIfMatches.mockReset();
		testState.clearActiveAgentOwnerIfMatches.mockReturnValue(true);
		testState.fullNavigate.mockReset();
		testState.extraAgents = [];
		testState.infoExtraAgents.mockReset();
		testState.infoExtraAgents.mockImplementation(async () => testState.extraAgents);
		testState.waitForExpectedMobileAgent.mockReset();
		testState.waitForExpectedMobileAgent.mockImplementation(async (load, expected) => {
			const agents = await load(new AbortController().signal);
			const remoteAgent = agents.find(
				(agent: { address: string; name: string; validUntil: number | null }) =>
					agent.address.toLowerCase() === expected.agentAddress.toLowerCase() &&
					agent.name === expected.agentNameBase &&
					agent.validUntil === expected.agentValidUntilMs,
			);
			return remoteAgent
				? { status: "approved", attempts: 1, remoteAgent }
				: {
						status: "unverified",
						attempts: 1,
						hadNetworkError: false,
						lastVerification: { status: "missing" },
					};
		});
		testState.writeAgentToStorageAndVerify.mockReset();
		testState.writeAgentToStorageAndVerify.mockReturnValue({ status: "stored", agent: {} });
		testState.setActiveAgentOwnerAndVerify.mockReset();
		testState.setActiveAgentOwnerAndVerify.mockReturnValue(true);
		testState.removeAgentFromStorage.mockReset();
		testState.removeAgentFromStorage.mockReturnValue({ status: "removed" });
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		window.sessionStorage.clear();
		window.localStorage.clear();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("has no manual paste surface and keeps Import disabled without a QR", async () => {
		const { Route } = await import("@/routes/mobile-agent-sync");
		const MobileAgentSyncRoute = (Route as unknown as { component: ComponentType }).component;

		act(() => root.render(createElement(MobileAgentSyncRoute)));
		await flushAsyncWork();

		expect(container.querySelector("input")).toBeNull();
		expect(container.textContent).not.toContain("Paste");
		expect(container.textContent).not.toContain("Use a different");
		expect(findButton(container, "Import phone access")?.disabled).toBe(true);
	});

	it("scrubs a direct-load bearer fragment before the route renders and waits for explicit Import", async () => {
		const sync = await createSyncFixture();
		const url = new URL(sync.url);
		window.history.replaceState(null, "", `${url.pathname}${url.hash}`);

		const { Route } = await import("@/routes/mobile-agent-sync");
		expect(window.location.hash).toBe("");
		expect(window.sessionStorage.getItem(MOBILE_SYNC_DRAFT_STORAGE_KEY)).toBeNull();

		const MobileAgentSyncRoute = (Route as unknown as { component: ComponentType }).component;
		act(() => root.render(createElement(MobileAgentSyncRoute)));
		await flushAsyncWork();

		expect(container.textContent).toContain("Desktop QR loaded");
		expect(container.textContent).not.toContain(sync.url);
		expect(container.textContent).not.toContain(AGENT_PRIVATE_KEY);
		expect(testState.infoExtraAgents).not.toHaveBeenCalled();
		expect(testState.writeAgentToStorageAndVerify).not.toHaveBeenCalled();
		expect(window.sessionStorage.getItem(MOBILE_SYNC_DRAFT_STORAGE_KEY)).toContain(sync.syncId);
	});

	it("captures and scrubs at beforeLoad when a preloaded route receives an SPA fragment", async () => {
		window.history.replaceState(null, "", "/");
		const { Route } = await import("@/routes/mobile-agent-sync");
		const sync = await createSyncFixture();
		const url = new URL(sync.url);
		window.history.replaceState(null, "", `${url.pathname}${url.hash}`);

		(Route as unknown as { beforeLoad: () => void }).beforeLoad();
		expect(window.location.hash).toBe("");

		const MobileAgentSyncRoute = (Route as unknown as { component: ComponentType }).component;
		act(() => root.render(createElement(MobileAgentSyncRoute)));
		await flushAsyncWork();
		expect(container.textContent).toContain("Desktop QR loaded");
	});

	it.each([
		[
			"query",
			`${MOBILE_SYNC_ROUTE_PATH}?from=camera&ht-mobile-sync=secret-envelope&k=secret-key`,
			`${MOBILE_SYNC_ROUTE_PATH}?from=camera`,
		],
		["nested path", `${MOBILE_SYNC_ROUTE_PATH}/ht-mobile-sync=secret-envelope/k=secret-key`, MOBILE_SYNC_ROUTE_PATH],
	])("scrubs an invalid SPA %s before rendering and never imports it", async (_part, unsafeUrl, cleanUrl) => {
		window.history.replaceState(null, "", "/");
		const { Route } = await import("@/routes/mobile-agent-sync");
		window.history.replaceState(null, "", unsafeUrl);

		(Route as unknown as { beforeLoad: () => void }).beforeLoad();
		expect(`${window.location.pathname}${window.location.search}${window.location.hash}`).toBe(cleanUrl);

		const MobileAgentSyncRoute = (Route as unknown as { component: ComponentType }).component;
		act(() => root.render(createElement(MobileAgentSyncRoute)));
		await flushAsyncWork();

		expect(container.textContent).toContain("not a valid gatu desktop wallet QR");
		expect(window.sessionStorage.getItem(MOBILE_SYNC_DRAFT_STORAGE_KEY)).toBeNull();
		expect(testState.waitForExpectedMobileAgent).not.toHaveBeenCalled();
		expect(testState.writeAgentToStorageAndVerify).not.toHaveBeenCalled();
	});

	it("aborts beforeLoad and requests a clean full navigation when replaceState silently leaves an SPA fragment", async () => {
		window.history.replaceState(null, "", "/");
		const { Route } = await import("@/routes/mobile-agent-sync");
		const sync = await createSyncFixture();
		const url = new URL(sync.url);
		window.history.replaceState(null, "", `${url.pathname}${url.hash}`);
		vi.spyOn(window.history, "replaceState").mockImplementation(() => {});

		expect(() => (Route as unknown as { beforeLoad: () => void }).beforeLoad()).toThrow(
			/A clean full-page navigation is required/,
		);
		expect(testState.fullNavigate).toHaveBeenCalledWith(MOBILE_SYNC_ROUTE_PATH);
		expect(window.location.hash).not.toBe("");
		expect(window.sessionStorage.getItem(MOBILE_SYNC_DRAFT_STORAGE_KEY)).toBeNull();
		expect(testState.waitForExpectedMobileAgent).not.toHaveBeenCalled();
		expect(testState.writeAgentToStorageAndVerify).not.toHaveBeenCalled();
	});

	it("does not import from a hashchange when the address bar cannot be scrubbed", async () => {
		const { Route } = await import("@/routes/mobile-agent-sync");
		const MobileAgentSyncRoute = (Route as unknown as { component: ComponentType }).component;
		act(() => root.render(createElement(MobileAgentSyncRoute)));
		await flushAsyncWork();

		const sync = await createSyncFixture();
		const url = new URL(sync.url);
		window.history.replaceState(null, "", `${url.pathname}${url.hash}`);
		vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
		window.dispatchEvent(new HashChangeEvent("hashchange"));
		await flushAsyncWork();

		expect(testState.fullNavigate).toHaveBeenCalledWith(MOBILE_SYNC_ROUTE_PATH);
		expect(window.sessionStorage.getItem(MOBILE_SYNC_DRAFT_STORAGE_KEY)).toBeNull();
		expect(container.textContent).not.toContain("Desktop QR loaded");
		expect(testState.waitForExpectedMobileAgent).not.toHaveBeenCalled();
		expect(testState.writeAgentToStorageAndVerify).not.toHaveBeenCalled();
	});

	it("verifies the exact base name and expiry before strict storage and owner activation", async () => {
		const sync = await createSyncFixture();
		testState.extraAgents = [
			{
				address: sync.agentAddress,
				name: "Mobile",
				validUntil: sync.agentValidUntilMs,
			},
		];
		const url = new URL(sync.url);
		window.history.replaceState(null, "", `${url.pathname}${url.hash}`);
		const { Route } = await import("@/routes/mobile-agent-sync");
		const MobileAgentSyncRoute = (Route as unknown as { component: ComponentType }).component;
		act(() => root.render(createElement(MobileAgentSyncRoute)));
		await flushAsyncWork();
		testState.waitForExpectedMobileAgent.mockImplementationOnce(async (load) => {
			const [remoteAgent] = await load(new AbortController().signal);
			vi.mocked(Date.now).mockReturnValue(NOW_MS + 5_000);
			return { status: "approved", attempts: 1, remoteAgent };
		});

		act(() => findButton(container, "Import phone access")?.click());
		await flushAsyncWork(20);

		expect(testState.infoExtraAgents).toHaveBeenCalledWith(
			{ user: USER_ADDRESS.toLowerCase() },
			expect.any(AbortSignal),
		);
		expect(testState.waitForExpectedMobileAgent).toHaveBeenCalledWith(
			expect.any(Function),
			{
				agentAddress: sync.agentAddress.toLowerCase(),
				agentNameBase: "Mobile",
				agentValidUntilMs: sync.agentValidUntilMs,
			},
			{ signal: expect.any(AbortSignal) },
		);
		expect(testState.writeAgentToStorageAndVerify).toHaveBeenCalledTimes(1);
		expect(testState.writeAgentToStorageAndVerify.mock.calls[0]?.[4]).toMatchObject({
			importedAtMs: NOW_MS + 5_000,
		});
		expect(testState.setActiveAgentOwnerAndVerify).toHaveBeenCalledWith("Mainnet", USER_ADDRESS.toLowerCase());
		expect(testState.writeAgentToStorageAndVerify.mock.invocationCallOrder[0]).toBeLessThan(
			testState.setActiveAgentOwnerAndVerify.mock.invocationCallOrder[0] ?? 0,
		);
		expect(window.sessionStorage.getItem(MOBILE_SYNC_DRAFT_STORAGE_KEY)).toBeNull();
		expect(container.textContent).toContain("Phone access ready");
	});

	it("retains the bounded draft and never writes when remote approval is not exact", async () => {
		const sync = await createSyncFixture();
		testState.extraAgents = [
			{
				address: sync.agentAddress,
				name: "Mobile",
				validUntil: sync.agentValidUntilMs + 1,
			},
		];
		const url = new URL(sync.url);
		window.history.replaceState(null, "", `${url.pathname}${url.hash}`);
		const { Route } = await import("@/routes/mobile-agent-sync");
		const MobileAgentSyncRoute = (Route as unknown as { component: ComponentType }).component;
		act(() => root.render(createElement(MobileAgentSyncRoute)));
		await flushAsyncWork();

		act(() => findButton(container, "Import phone access")?.click());
		await flushAsyncWork(20);

		expect(testState.writeAgentToStorageAndVerify).not.toHaveBeenCalled();
		expect(testState.setActiveAgentOwnerAndVerify).not.toHaveBeenCalled();
		expect(window.sessionStorage.getItem(MOBILE_SYNC_DRAFT_STORAGE_KEY)).toContain(sync.syncId);
		expect(container.textContent).toContain("not the currently approved Mobile Agent");
	});

	it("rolls back the Agent if verified owner activation fails", async () => {
		const sync = await createSyncFixture();
		testState.extraAgents = [{ address: sync.agentAddress, name: "Mobile", validUntil: sync.agentValidUntilMs }];
		testState.setActiveAgentOwnerAndVerify.mockReturnValue(false);
		testState.activeAgentOwner = { env: "Mainnet", address: USER_ADDRESS };
		const url = new URL(sync.url);
		window.history.replaceState(null, "", `${url.pathname}${url.hash}`);
		const { Route } = await import("@/routes/mobile-agent-sync");
		const MobileAgentSyncRoute = (Route as unknown as { component: ComponentType }).component;
		act(() => root.render(createElement(MobileAgentSyncRoute)));
		await flushAsyncWork();

		act(() => findButton(container, "Import phone access")?.click());
		await flushAsyncWork(20);

		expect(testState.removeAgentFromStorage).toHaveBeenCalledWith("Mainnet", USER_ADDRESS.toLowerCase());
		expect(testState.clearActiveAgentOwnerIfMatches).toHaveBeenCalledWith("Mainnet", USER_ADDRESS.toLowerCase());
		expect(container.textContent).not.toContain("Phone access ready");
		expect(container.textContent).toContain("could not be saved");
	});

	it("reports incomplete rollback when owner activation and both verified removals fail", async () => {
		const sync = await createSyncFixture();
		testState.extraAgents = [{ address: sync.agentAddress, name: "Mobile", validUntil: sync.agentValidUntilMs }];
		testState.setActiveAgentOwnerAndVerify.mockReturnValue(false);
		testState.activeAgentOwner = { env: "Mainnet", address: USER_ADDRESS };
		testState.clearActiveAgentOwnerIfMatches.mockReturnValue(false);
		testState.removeAgentFromStorage.mockReturnValue({ status: "failed", reason: "readback_mismatch" });
		const url = new URL(sync.url);
		window.history.replaceState(null, "", `${url.pathname}${url.hash}`);
		const { Route } = await import("@/routes/mobile-agent-sync");
		const MobileAgentSyncRoute = (Route as unknown as { component: ComponentType }).component;
		act(() => root.render(createElement(MobileAgentSyncRoute)));
		await flushAsyncWork();

		act(() => findButton(container, "Import phone access")?.click());
		await flushAsyncWork(20);

		expect(container.textContent).toContain("could not be activated or fully removed");
		expect(container.textContent).not.toContain("Phone access ready");
	});

	it("shows a cleanup warning when a successful import cannot remove the temporary QR draft", async () => {
		const sync = await createSyncFixture();
		testState.extraAgents = [{ address: sync.agentAddress, name: "Mobile", validUntil: sync.agentValidUntilMs }];
		const url = new URL(sync.url);
		window.history.replaceState(null, "", `${url.pathname}${url.hash}`);
		const { Route } = await import("@/routes/mobile-agent-sync");
		const MobileAgentSyncRoute = (Route as unknown as { component: ComponentType }).component;
		act(() => root.render(createElement(MobileAgentSyncRoute)));
		await flushAsyncWork();

		const originalRemoveItem = Storage.prototype.removeItem;
		vi.spyOn(Storage.prototype, "removeItem").mockImplementation(function (this: Storage, key: string) {
			if (key === MOBILE_SYNC_DRAFT_STORAGE_KEY) return;
			originalRemoveItem.call(this, key);
		});
		act(() => findButton(container, "Import phone access")?.click());
		await flushAsyncWork(20);

		expect(container.textContent).toContain("Phone access ready");
		expect(container.textContent).toContain("temporary QR copy could not be cleared");
		expect(window.sessionStorage.getItem(MOBILE_SYNC_DRAFT_STORAGE_KEY)).toContain(sync.syncId);
	});

	it("does not claim a QR was discarded when cleanup readback throws", async () => {
		const sync = await createSyncFixture();
		const url = new URL(sync.url);
		window.history.replaceState(null, "", `${url.pathname}${url.hash}`);
		const { Route } = await import("@/routes/mobile-agent-sync");
		const MobileAgentSyncRoute = (Route as unknown as { component: ComponentType }).component;
		act(() => root.render(createElement(MobileAgentSyncRoute)));
		await flushAsyncWork();

		const originalGetItem = Storage.prototype.getItem;
		vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key: string) {
			if (key === MOBILE_SYNC_DRAFT_STORAGE_KEY) throw new Error("readback blocked");
			return originalGetItem.call(this, key);
		});
		act(() => findButton(container, "Discard")?.click());
		await flushAsyncWork();

		expect(container.textContent).toContain("temporary phone-access QR could not be cleared");
		expect(container.textContent).not.toContain("No desktop QR is loaded");
	});

	it("scrubs and discards credentials while import is gated off", async () => {
		testState.importEnabled = false;
		const sync = await createSyncFixture();
		const url = new URL(sync.url);
		window.sessionStorage.setItem(MOBILE_SYNC_DRAFT_STORAGE_KEY, "stale-secret");
		window.history.replaceState(null, "", `${url.pathname}${url.hash}`);

		const { Route } = await import("@/routes/mobile-agent-sync");
		expect(window.location.hash).toBe("");
		expect(window.sessionStorage.getItem(MOBILE_SYNC_DRAFT_STORAGE_KEY)).toBeNull();

		const MobileAgentSyncRoute = (Route as unknown as { component: ComponentType }).component;
		act(() => root.render(createElement(MobileAgentSyncRoute)));
		await flushAsyncWork();

		expect(container.textContent).toContain("temporarily unavailable");
		expect(findButton(container, "Import phone access")?.disabled).toBe(true);
		expect(testState.waitForExpectedMobileAgent).not.toHaveBeenCalled();
		expect(testState.writeAgentToStorageAndVerify).not.toHaveBeenCalled();
	});
});
