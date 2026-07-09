// @vitest-environment jsdom

import { webcrypto } from "node:crypto";
import {
	act,
	type ComponentPropsWithoutRef,
	type ComponentType,
	createElement,
	Fragment,
	forwardRef,
	type ReactNode,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MOBILE_SYNC_DRAFT_STORAGE_KEY, saveMobileSyncDraft } from "../mobile-sync/draft-storage";
import {
	createMobileAgentSyncUrl,
	MOBILE_SYNC_CLOCK_SKEW_MS,
	MOBILE_SYNC_PAYLOAD_TTL_MS,
	MOBILE_SYNC_ROUTE_PATH,
} from "../mobile-sync/sync-core";

const NOW_MS = 1_779_364_227_000;
const USER_ADDRESS = "0x1111111111111111111111111111111111111111" as const;
const AGENT_PRIVATE_KEY = `0x${"ab".repeat(32)}` as const;

const testState = vi.hoisted(() => ({
	address: undefined as string | undefined,
	setAgent: vi.fn(),
	setActiveAgentOwner: vi.fn(),
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
	CheckCircleIcon: Icon,
	CopyIcon: Icon,
	DeviceMobileIcon: Icon,
	KeyIcon: Icon,
	SpinnerGapIcon: Icon,
	WalletIcon: Icon,
	WarningCircleIcon: Icon,
}));

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: unknown) => options,
	lazyRouteComponent:
		() =>
		({ onOpenChange, open }: { onOpenChange: (open: boolean) => void; open: boolean }) =>
			open
				? createElement(
						"div",
						null,
						"Wallet modal",
						createElement("button", { onClick: () => onOpenChange(false), type: "button" }, "Close wallet"),
					)
				: null,
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
	TextInput: forwardRef<
		HTMLInputElement,
		ComponentPropsWithoutRef<"input"> & {
			iconLeft?: ReactNode;
			iconRight?: ReactNode;
			label?: ReactNode;
		}
	>(function MockTextInput({ iconLeft: _iconLeft, iconRight: _iconRight, label, onChange, value, ...props }, ref) {
		return createElement(
			"label",
			null,
			label,
			createElement("input", {
				...props,
				ref,
				onChange,
				value: value ?? "",
			}),
		);
	}),
}));

vi.mock("@/components/trade/components/wallet-modal", () => ({
	WalletModal: ({ onOpenChange, open }: { onOpenChange: (open: boolean) => void; open: boolean }) =>
		open
			? createElement(
					"div",
					null,
					"Wallet modal",
					createElement("button", { onClick: () => onOpenChange(false), type: "button" }, "Close wallet"),
				)
			: null,
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({
		address: testState.address,
		isConnected: Boolean(testState.address),
	}),
}));

vi.mock("@/lib/hyperliquid", () => ({
	setActiveAgentOwner: testState.setActiveAgentOwner,
	useAgentWalletActions: () => ({ setAgent: testState.setAgent }),
	useHyperliquid: () => ({
		env: "Mainnet",
	}),
}));

async function flushAsyncWork(times = 1) {
	for (let i = 0; i < times; i += 1) {
		await act(async () => {
			await new Promise((resolve) => window.setTimeout(resolve, 0));
		});
	}
}

async function createSyncFixture({
	agentPrivateKey = AGENT_PRIVATE_KEY,
	appOrigin = window.location.origin,
	env = "Mainnet",
	nowMs = NOW_MS,
	userAddress = USER_ADDRESS,
}: {
	agentPrivateKey?: `0x${string}`;
	appOrigin?: string;
	env?: "Mainnet" | "Testnet";
	nowMs?: number;
	userAddress?: `0x${string}`;
} = {}) {
	return createMobileAgentSyncUrl({
		appOrigin,
		env,
		userAddress,
		agentPrivateKey,
		nowMs,
	});
}

describe("MobileAgentSyncRoute", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		vi.stubGlobal("crypto", webcrypto);
		Object.defineProperty(window, "crypto", {
			value: webcrypto,
			configurable: true,
		});
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		testState.address = undefined;
		testState.setAgent.mockReset();
		testState.setActiveAgentOwner.mockReset();
		vi.spyOn(Date, "now").mockReturnValue(NOW_MS);
		window.sessionStorage.clear();
		window.history.replaceState(null, "", MOBILE_SYNC_ROUTE_PATH);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		window.sessionStorage.clear();
		vi.clearAllMocks();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
		Reflect.deleteProperty(navigator, "clipboard");
	});

	it("keeps phone-link paste available while import is disabled before a link is loaded", async () => {
		const { Route } = await import("@/routes/mobile-agent-sync");
		const MobileAgentSyncRoute = (Route as unknown as { component: ComponentType }).component;

		act(() => {
			root.render(createElement(MobileAgentSyncRoute));
		});
		await flushAsyncWork();

		expect(container.textContent).not.toContain("Phone link loaded");
		const phoneLinkInput = container.querySelector(
			'input[placeholder="Paste link from desktop"]',
		) as HTMLInputElement | null;
		const usePhoneLinkButton = [...container.querySelectorAll("button")].find((button) =>
			button.textContent?.includes("Use phone link"),
		);
		const importButton = [...container.querySelectorAll("button")].find((button) =>
			button.textContent?.includes("Import phone access"),
		);

		expect(phoneLinkInput).not.toBeNull();
		expect(usePhoneLinkButton?.disabled).toBe(true);
		expect(importButton?.disabled).toBe(true);
	});

	it("loads a phone-access hash, cleans the URL, persists the envelope, and enables import without a wallet", async () => {
		const sync = await createSyncFixture();
		const url = new URL(sync.url);
		window.history.replaceState(null, "", `${url.pathname}${url.hash}`);
		const { Route } = await import("@/routes/mobile-agent-sync");
		const MobileAgentSyncRoute = (Route as unknown as { component: ComponentType }).component;

		act(() => {
			root.render(createElement(MobileAgentSyncRoute));
		});
		await flushAsyncWork();

		expect(window.location.hash).toBe("");
		expect(window.sessionStorage.getItem("gatu.mobile-sync.import-draft.v1")).not.toBeNull();
		expect(container.textContent).toContain("Phone link loaded");
		expect(container.textContent).toContain("Phone import");

		const importButton = [...container.querySelectorAll("button")].find((button) =>
			button.textContent?.includes("Import phone access"),
		);
		expect(importButton?.disabled).toBe(false);
	});

	it("uses mobile-friendly input attributes and text labels for the phone link step", async () => {
		const sync = await createSyncFixture();
		const url = new URL(sync.url);
		window.history.replaceState(null, "", `${url.pathname}${url.hash}`);
		const { Route } = await import("@/routes/mobile-agent-sync");
		const MobileAgentSyncRoute = (Route as unknown as { component: ComponentType }).component;

		act(() => {
			root.render(createElement(MobileAgentSyncRoute));
		});
		await flushAsyncWork();

		const showLinkInputButton = [...container.querySelectorAll("button")].find((button) =>
			button.textContent?.includes("Use a different phone link"),
		);
		act(() => {
			showLinkInputButton?.click();
		});
		await flushAsyncWork();

		const phoneLinkInput = container.querySelector(
			'input[placeholder="Paste link from desktop"]',
		) as HTMLInputElement | null;
		expect(phoneLinkInput).not.toBeNull();
		expect(phoneLinkInput?.type).toBe("url");
		expect(phoneLinkInput?.inputMode).toBe("url");
		expect(phoneLinkInput?.getAttribute("autocapitalize")).toBe("none");
		expect(phoneLinkInput?.getAttribute("autocorrect")).toBe("off");
		expect(container.textContent).toContain("Trading key");
		expect(container.textContent).toContain("Ready to import");
	});

	it("loads a same-route phone-access hash after the empty route is already open", async () => {
		const { Route } = await import("@/routes/mobile-agent-sync");
		const MobileAgentSyncRoute = (Route as unknown as { component: ComponentType }).component;

		act(() => {
			root.render(createElement(MobileAgentSyncRoute));
		});
		await flushAsyncWork();

		expect(container.textContent).not.toContain("Phone link loaded");
		expect(container.querySelector('input[placeholder="Paste link from desktop"]')).not.toBeNull();

		const sync = await createSyncFixture();
		const url = new URL(sync.url);
		act(() => {
			window.history.pushState(null, "", `${url.pathname}${url.hash}`);
			window.dispatchEvent(new Event("hashchange"));
		});
		await flushAsyncWork();

		expect(window.location.hash).toBe("");
		expect(container.textContent).toContain("Phone link loaded");
		expect(container.textContent).not.toContain("Recovered after reload");
		expect(window.sessionStorage.getItem(MOBILE_SYNC_DRAFT_STORAGE_KEY)).toContain(sync.syncId);
	});

	it("clears the loaded phone link when a same-route replacement hash is invalid", async () => {
		const sync = await createSyncFixture();
		const url = new URL(sync.url);
		window.history.replaceState(null, "", `${url.pathname}${url.hash}`);
		const { Route } = await import("@/routes/mobile-agent-sync");
		const MobileAgentSyncRoute = (Route as unknown as { component: ComponentType }).component;

		act(() => {
			root.render(createElement(MobileAgentSyncRoute));
		});
		await flushAsyncWork();

		expect(container.textContent).toContain("Phone link loaded");

		act(() => {
			window.history.pushState(
				null,
				"",
				`${MOBILE_SYNC_ROUTE_PATH}#ht-mobile-sync=not-a-valid-envelope&k=${sync.encodedKey}`,
			);
			window.dispatchEvent(new Event("hashchange"));
		});
		await flushAsyncWork();

		expect(window.location.hash).toBe("");
		expect(window.sessionStorage.getItem(MOBILE_SYNC_DRAFT_STORAGE_KEY)).toBeNull();
		expect(container.textContent).toContain("This is not a valid gatu mobile link.");
		expect(container.textContent).not.toContain("Phone link loaded");
	});

	it("recovers a saved phone link after reload", async () => {
		const sync = await createSyncFixture();
		saveMobileSyncDraft(sync.envelope, sync.encodedKey, {
			storage: window.sessionStorage,
			nowMs: NOW_MS,
		});
		const { Route } = await import("@/routes/mobile-agent-sync");
		const MobileAgentSyncRoute = (Route as unknown as { component: ComponentType }).component;

		act(() => {
			root.render(createElement(MobileAgentSyncRoute));
		});
		await flushAsyncWork();

		expect(container.textContent).toContain("Recovered after reload");
		expect(container.textContent).toContain(sync.syncId.slice(0, 8));
	});

	it("clears an expired stored phone link and leaves manual paste available", async () => {
		const sync = await createSyncFixture();
		saveMobileSyncDraft(sync.envelope, sync.encodedKey, {
			storage: window.sessionStorage,
			nowMs: NOW_MS,
		});
		vi.spyOn(Date, "now").mockReturnValue(NOW_MS + MOBILE_SYNC_PAYLOAD_TTL_MS + MOBILE_SYNC_CLOCK_SKEW_MS + 1);
		const { Route } = await import("@/routes/mobile-agent-sync");
		const MobileAgentSyncRoute = (Route as unknown as { component: ComponentType }).component;

		act(() => {
			root.render(createElement(MobileAgentSyncRoute));
		});
		await flushAsyncWork();

		expect(window.sessionStorage.getItem("gatu.mobile-sync.import-draft.v1")).toBeNull();
		expect(container.textContent).toContain("This mobile link expired.");
		expect(container.textContent).not.toContain("Phone link loaded");
		expect(container.querySelector('input[placeholder="Paste link from desktop"]')).not.toBeNull();
	});

	it("clears an invalid stored phone link and leaves manual paste available", async () => {
		window.sessionStorage.setItem(MOBILE_SYNC_DRAFT_STORAGE_KEY, JSON.stringify({ v: 1, encodedEnvelope: "bad" }));
		const { Route } = await import("@/routes/mobile-agent-sync");
		const MobileAgentSyncRoute = (Route as unknown as { component: ComponentType }).component;

		act(() => {
			root.render(createElement(MobileAgentSyncRoute));
		});
		await flushAsyncWork();

		expect(window.sessionStorage.getItem(MOBILE_SYNC_DRAFT_STORAGE_KEY)).toBeNull();
		expect(container.textContent).toContain("Saved phone link was invalid. Paste the link again.");
		expect(container.querySelector('input[placeholder="Paste link from desktop"]')).not.toBeNull();
	});

	it("loads a manually pasted phone link when no QR link is present", async () => {
		const sync = await createSyncFixture();
		const { Route } = await import("@/routes/mobile-agent-sync");
		const MobileAgentSyncRoute = (Route as unknown as { component: ComponentType }).component;

		act(() => {
			root.render(createElement(MobileAgentSyncRoute));
		});
		await flushAsyncWork();

		const phoneLinkInput = container.querySelector(
			'input[placeholder="Paste link from desktop"]',
		) as HTMLInputElement | null;
		expect(phoneLinkInput).not.toBeNull();
		act(() => {
			if (phoneLinkInput) {
				Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(phoneLinkInput, sync.url);
				phoneLinkInput.dispatchEvent(new Event("input", { bubbles: true }));
			}
		});
		await flushAsyncWork();

		act(() => {
			phoneLinkInput?.closest("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
		});
		await flushAsyncWork();

		expect(container.textContent).toContain("Phone link loaded");
		expect(container.textContent).toContain(sync.syncId.slice(0, 8));
		expect(window.sessionStorage.getItem(MOBILE_SYNC_DRAFT_STORAGE_KEY)).toContain(sync.syncId);
	});

	it("expires a loaded phone link while the page remains open", async () => {
		const sync = await createSyncFixture({
			nowMs: NOW_MS - MOBILE_SYNC_PAYLOAD_TTL_MS + 50,
		});
		const url = new URL(sync.url);
		window.history.replaceState(null, "", `${url.pathname}${url.hash}`);
		const { Route } = await import("@/routes/mobile-agent-sync");
		const MobileAgentSyncRoute = (Route as unknown as { component: ComponentType }).component;

		act(() => {
			root.render(createElement(MobileAgentSyncRoute));
		});
		await flushAsyncWork();

		expect(container.textContent).toContain("Phone link loaded");

		await act(async () => {
			await new Promise((resolve) => window.setTimeout(resolve, 80));
		});

		expect(window.sessionStorage.getItem("gatu.mobile-sync.import-draft.v1")).toBeNull();
		expect(container.textContent).toContain("This mobile link expired.");
		expect(container.textContent).not.toContain("Phone link loaded");
		expect(container.querySelector('input[placeholder="Paste link from desktop"]')).not.toBeNull();
	});

	it("lets a manually pasted phone link replace an already loaded link", async () => {
		const firstSync = await createSyncFixture();
		const secondSync = await createSyncFixture({
			agentPrivateKey: `0x${"cd".repeat(32)}`,
		});
		const firstUrl = new URL(firstSync.url);
		window.history.replaceState(null, "", `${firstUrl.pathname}${firstUrl.hash}`);
		const { Route } = await import("@/routes/mobile-agent-sync");
		const MobileAgentSyncRoute = (Route as unknown as { component: ComponentType }).component;

		act(() => {
			root.render(createElement(MobileAgentSyncRoute));
		});
		await flushAsyncWork();

		expect(container.textContent).toContain(firstSync.syncId.slice(0, 8));

		const replaceButton = [...container.querySelectorAll("button")].find((button) =>
			button.textContent?.includes("Use a different phone link"),
		);
		expect(replaceButton).toBeDefined();
		act(() => {
			replaceButton?.click();
		});
		await flushAsyncWork();

		const phoneLinkInput = container.querySelector(
			'input[placeholder="Paste link from desktop"]',
		) as HTMLInputElement | null;
		expect(phoneLinkInput).not.toBeNull();
		act(() => {
			if (phoneLinkInput) {
				Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(phoneLinkInput, secondSync.url);
				phoneLinkInput.dispatchEvent(new Event("input", { bubbles: true }));
			}
		});
		await flushAsyncWork();

		const usePhoneLinkButton = [...container.querySelectorAll("button")].find((button) =>
			button.textContent?.includes("Use phone link"),
		);
		act(() => {
			usePhoneLinkButton?.closest("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
		});
		await flushAsyncWork();

		expect(container.textContent).not.toContain(firstSync.syncId.slice(0, 8));
		expect(container.textContent).toContain(secondSync.syncId.slice(0, 8));
		expect(window.sessionStorage.getItem("gatu.mobile-sync.import-draft.v1")).toContain(secondSync.syncId);
	});

	it("keeps the loaded link when manual replacement is cancelled", async () => {
		const sync = await createSyncFixture();
		const url = new URL(sync.url);
		window.history.replaceState(null, "", `${url.pathname}${url.hash}`);
		const { Route } = await import("@/routes/mobile-agent-sync");
		const MobileAgentSyncRoute = (Route as unknown as { component: ComponentType }).component;

		act(() => {
			root.render(createElement(MobileAgentSyncRoute));
		});
		await flushAsyncWork();

		const replaceButton = [...container.querySelectorAll("button")].find((button) =>
			button.textContent?.includes("Use a different phone link"),
		);
		act(() => {
			replaceButton?.click();
		});
		await flushAsyncWork();

		const phoneLinkInput = container.querySelector(
			'input[placeholder="Paste link from desktop"]',
		) as HTMLInputElement | null;
		act(() => {
			if (phoneLinkInput) {
				Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
					phoneLinkInput,
					"https://app.hypeterminal.test/mobile-agent-sync#ht-mobile-sync=not-submitted",
				);
				phoneLinkInput.dispatchEvent(new Event("input", { bubbles: true }));
			}
		});
		await flushAsyncWork();

		const cancelButton = [...container.querySelectorAll("button")].find((button) =>
			button.textContent?.includes("Cancel"),
		);
		act(() => {
			cancelButton?.click();
		});
		await flushAsyncWork();

		expect(container.textContent).toContain(sync.syncId.slice(0, 8));
		expect(container.textContent).toContain("Phone link loaded");
		expect(container.querySelector('input[placeholder="Paste link from desktop"]')).toBeNull();
		expect(window.sessionStorage.getItem(MOBILE_SYNC_DRAFT_STORAGE_KEY)).toContain(sync.syncId);
	});

	it("clears an existing loaded link when manual replacement is invalid", async () => {
		const sync = await createSyncFixture();
		const url = new URL(sync.url);
		window.history.replaceState(null, "", `${url.pathname}${url.hash}`);
		const { Route } = await import("@/routes/mobile-agent-sync");
		const MobileAgentSyncRoute = (Route as unknown as { component: ComponentType }).component;

		act(() => {
			root.render(createElement(MobileAgentSyncRoute));
		});
		await flushAsyncWork();

		expect(container.textContent).toContain(sync.syncId.slice(0, 8));
		expect(window.sessionStorage.getItem(MOBILE_SYNC_DRAFT_STORAGE_KEY)).toContain(sync.syncId);

		const replaceButton = [...container.querySelectorAll("button")].find((button) =>
			button.textContent?.includes("Use a different phone link"),
		);
		act(() => {
			replaceButton?.click();
		});
		await flushAsyncWork();

		const phoneLinkInput = container.querySelector(
			'input[placeholder="Paste link from desktop"]',
		) as HTMLInputElement | null;
		act(() => {
			if (phoneLinkInput) {
				Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
					phoneLinkInput,
					`https://app.hypeterminal.test/mobile-agent-sync#ht-mobile-sync=not-a-valid-envelope&k=${sync.encodedKey}`,
				);
				phoneLinkInput.dispatchEvent(new Event("input", { bubbles: true }));
			}
		});
		await flushAsyncWork();

		act(() => {
			phoneLinkInput?.closest("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
		});
		await flushAsyncWork();

		expect(window.sessionStorage.getItem(MOBILE_SYNC_DRAFT_STORAGE_KEY)).toBeNull();
		expect(container.textContent).toContain("This is not a valid gatu mobile link.");
		expect(container.textContent).not.toContain(sync.syncId.slice(0, 8));
		expect(container.textContent).not.toContain("Phone link loaded");
		expect(phoneLinkInput?.value).toContain("not-a-valid-envelope");
	});

	it("clears the loaded phone link after explicit reset", async () => {
		const sync = await createSyncFixture();
		const url = new URL(sync.url);
		window.history.replaceState(null, "", `${url.pathname}${url.hash}`);
		const { Route } = await import("@/routes/mobile-agent-sync");
		const MobileAgentSyncRoute = (Route as unknown as { component: ComponentType }).component;

		act(() => {
			root.render(createElement(MobileAgentSyncRoute));
		});
		await flushAsyncWork();

		expect(window.sessionStorage.getItem(MOBILE_SYNC_DRAFT_STORAGE_KEY)).toContain(sync.syncId);
		const resetButton = [...container.querySelectorAll("button")].find((button) =>
			button.textContent?.includes("Reset"),
		);
		act(() => {
			resetButton?.click();
		});
		await flushAsyncWork();

		expect(window.sessionStorage.getItem(MOBILE_SYNC_DRAFT_STORAGE_KEY)).toBeNull();
		expect(container.textContent).not.toContain("Phone link loaded");
		expect(container.querySelector('input[placeholder="Paste link from desktop"]')).not.toBeNull();
	});

	it("does not require or render a wallet connection step after a phone link is loaded", async () => {
		const sync = await createSyncFixture();
		const url = new URL(sync.url);
		window.history.replaceState(null, "", `${url.pathname}${url.hash}`);
		const { Route } = await import("@/routes/mobile-agent-sync");
		const MobileAgentSyncRoute = (Route as unknown as { component: ComponentType }).component;

		act(() => {
			root.render(createElement(MobileAgentSyncRoute));
		});
		await flushAsyncWork();

		expect(container.textContent).toContain("Phone link loaded");
		expect(container.textContent).not.toContain("Connect wallet");
		expect(container.textContent).not.toContain("Wallet modal");
		expect(container.textContent).not.toContain("Connect to verify");
	});

	it("enables import once a valid link is loaded without a phone wallet", async () => {
		const sync = await createSyncFixture();
		const url = new URL(sync.url);
		window.history.replaceState(null, "", `${url.pathname}${url.hash}`);
		const { Route } = await import("@/routes/mobile-agent-sync");
		const MobileAgentSyncRoute = (Route as unknown as { component: ComponentType }).component;

		act(() => {
			root.render(createElement(MobileAgentSyncRoute));
		});
		await flushAsyncWork();

		const importButton = [...container.querySelectorAll("button")].find((button) =>
			button.textContent?.includes("Import phone access"),
		);
		expect(importButton?.disabled).toBe(false);
	});

	it("imports phone access when no wallet is connected on the phone", async () => {
		const sync = await createSyncFixture();
		const url = new URL(sync.url);
		window.history.replaceState(null, "", `${url.pathname}${url.hash}`);
		const { Route } = await import("@/routes/mobile-agent-sync");
		const MobileAgentSyncRoute = (Route as unknown as { component: ComponentType }).component;

		act(() => {
			root.render(createElement(MobileAgentSyncRoute));
		});
		await flushAsyncWork();

		const importButton = [...container.querySelectorAll("button")].find((button) =>
			button.textContent?.includes("Import phone access"),
		);
		expect(importButton?.disabled).toBe(false);

		act(() => {
			importButton?.closest("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
		});
		await flushAsyncWork(60);

		expect(testState.setAgent).toHaveBeenCalledTimes(1);
		expect(testState.setActiveAgentOwner).toHaveBeenCalledTimes(1);
		expect(testState.setActiveAgentOwner).toHaveBeenCalledWith("Mainnet", USER_ADDRESS.toLowerCase());
		expect(window.sessionStorage.getItem(MOBILE_SYNC_DRAFT_STORAGE_KEY)).toBeNull();
		expect(container.textContent).toContain("Phone access ready");
	});

	it("uses alert semantics and focuses an invalid link error", async () => {
		const sync = await createSyncFixture();
		const { Route } = await import("@/routes/mobile-agent-sync");
		const MobileAgentSyncRoute = (Route as unknown as { component: ComponentType }).component;

		act(() => {
			root.render(createElement(MobileAgentSyncRoute));
		});
		await flushAsyncWork();

		act(() => {
			window.history.pushState(
				null,
				"",
				`${MOBILE_SYNC_ROUTE_PATH}#ht-mobile-sync=not-a-valid-envelope&k=${sync.encodedKey}`,
			);
			window.dispatchEvent(new Event("hashchange"));
		});
		await flushAsyncWork();

		const alerts = [...container.querySelectorAll('[role="alert"]')];
		const invalidLinkAlert = alerts.find((alert) =>
			alert.textContent?.includes("This is not a valid gatu mobile link."),
		);
		expect(invalidLinkAlert).toBeDefined();
		expect(document.activeElement).toBe(invalidLinkAlert);
	});

	it.each([
		{
			name: "wrong environment",
			syncOptions: { env: "Testnet" as const },
			expectedMessage: "This link was created for a different network.",
		},
		{
			name: "wrong origin",
			syncOptions: { appOrigin: "https://desktop.hypeterminal.test" },
			expectedMessage: "This link was created for a different site.",
		},
	])("shows a clear import error for $name", async ({ expectedMessage, syncOptions }) => {
		const sync = await createSyncFixture(syncOptions);
		saveMobileSyncDraft(sync.envelope, sync.encodedKey, {
			storage: window.sessionStorage,
			nowMs: NOW_MS,
		});
		const { Route } = await import("@/routes/mobile-agent-sync");
		const MobileAgentSyncRoute = (Route as unknown as { component: ComponentType }).component;

		act(() => {
			root.render(createElement(MobileAgentSyncRoute));
		});
		await flushAsyncWork();

		const importButton = [...container.querySelectorAll("button")].find((button) =>
			button.textContent?.includes("Import phone access"),
		);
		expect(importButton?.disabled).toBe(false);

		act(() => {
			importButton?.closest("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
		});
		await flushAsyncWork(80);

		expect(testState.setAgent).not.toHaveBeenCalled();
		expect(testState.setActiveAgentOwner).not.toHaveBeenCalled();
		expect(container.textContent).toContain(expectedMessage);
		expect(window.sessionStorage.getItem(MOBILE_SYNC_DRAFT_STORAGE_KEY)).not.toBeNull();
	});

	it("imports phone access and lands the agent after a successful import", async () => {
		const sync = await createSyncFixture();
		saveMobileSyncDraft(sync.envelope, sync.encodedKey, {
			storage: window.sessionStorage,
			nowMs: NOW_MS,
		});
		const { Route } = await import("@/routes/mobile-agent-sync");
		const MobileAgentSyncRoute = (Route as unknown as { component: ComponentType }).component;

		act(() => {
			root.render(createElement(MobileAgentSyncRoute));
		});
		await flushAsyncWork();

		expect(container.textContent).toContain(sync.syncId.slice(0, 8));

		const importButton = [...container.querySelectorAll("button")].find((button) =>
			button.textContent?.includes("Import phone access"),
		);
		expect(importButton?.disabled).toBe(false);

		act(() => {
			importButton?.closest("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
		});
		await flushAsyncWork(60);

		expect(testState.setAgent).toHaveBeenCalledTimes(1);
		expect(testState.setActiveAgentOwner).toHaveBeenCalledTimes(1);
		expect(testState.setActiveAgentOwner).toHaveBeenCalledWith("Mainnet", USER_ADDRESS.toLowerCase());
		const [env, userAddress, privateKey, publicKey, metadata] = testState.setAgent.mock.calls[0];
		expect(env).toBe("Mainnet");
		expect(userAddress).toBe(USER_ADDRESS.toLowerCase());
		expect(privateKey).toBe(AGENT_PRIVATE_KEY.toLowerCase());
		expect(publicKey).toBe(sync.agentAddress.toLowerCase());
		expect(metadata).toMatchObject({
			source: "mobile-sync",
			agentName: sync.agentName,
			agentValidUntilMs: sync.agentValidUntilMs,
			syncId: sync.syncId,
		});

		expect(window.sessionStorage.getItem("gatu.mobile-sync.import-draft.v1")).toBeNull();
		expect(container.textContent).toContain("Phone access ready");
		expect(container.textContent).not.toContain("Phone link loaded");
	});
});
