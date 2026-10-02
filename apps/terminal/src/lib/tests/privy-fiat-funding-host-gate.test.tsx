// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// Transform the subject during collection; every test re-evaluates it after resetting modules.
import "@/components/trade/tradebox/privy-fiat-funding-host-gate";
import "@/components/ui/sonner";
import "@/lib/trade/privy-fiat-funding-launch";
import { installSonnerClock } from "./harness/sonner-clock";

const OWNER = "0xabcdefabcdefabcdefabcdefabcdefabcdef1234" as const;
const OTHER = "0x2222222222222222222222222222222222222222";
const HOST_MODULE = "@/components/trade/tradebox/privy-fiat-funding-host";
const UNAVAILABLE = "Card purchase could not open. Check your connection and try again.";
const IMPORT_ERROR = "Failed to fetch dynamically imported module";

const session = vi.hoisted(() => {
	let state = { clientKey: "", isTestnet: false };
	const listeners = new Set<() => void>();
	return {
		get: () => state,
		set(next: Partial<typeof state>) {
			state = { ...state, ...next };
			for (const listener of listeners) listener();
		},
		subscribe(listener: () => void) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	};
});

vi.mock("@/lib/hyperliquid", async () => {
	const { useSyncExternalStore } = await import("react");
	return {
		useHyperliquid: () => ({ clientKey: useSyncExternalStore(session.subscribe, () => session.get().clientKey) }),
	};
});
vi.mock("@/stores/use-global-settings-store", async (importOriginal) => {
	const { useSyncExternalStore } = await import("react");
	return {
		...(await importOriginal<typeof import("@/stores/use-global-settings-store")>()),
		useIsTestnet: () => useSyncExternalStore(session.subscribe, () => session.get().isTestnet),
	};
});

async function loadSubject() {
	const launch = await import("@/lib/trade/privy-fiat-funding-launch");
	const { PrivyFiatFundingHostGate } = await import("@/components/trade/tradebox/privy-fiat-funding-host-gate");
	const store = await import("@/stores/use-privy-fiat-funding-store");
	const { Toaster } = await import("@/components/ui/sonner");
	return { ...launch, PrivyFiatFundingHostGate, Toaster, store };
}

function createAttempt(network: "mainnet" | "testnet" = "mainnet") {
	return {
		destination: { address: OWNER, walletKind: "embedded" as const },
		network,
		ownerKey: `${network}:${OWNER}`,
	};
}

function failingImport() {
	let fail: () => void = () => undefined;
	const promise = new Promise<never>((_resolve, reject) => {
		fail = () => reject(new Error(IMPORT_ERROR));
	});
	// The module runner may attach its own handler only after the test rejects the download.
	promise.catch(() => undefined);
	return { promise, fail: () => fail() };
}

describe("card funding host loading", () => {
	let container: HTMLDivElement;
	let root: Root;
	let clock: ReturnType<typeof installSonnerClock>;
	let subject: Awaited<ReturnType<typeof loadSubject>>;

	beforeEach(async () => {
		vi.resetModules();
		i18n.loadAndActivate({ locale: "en", messages: {} });
		session.set({ clientKey: OWNER, isTestnet: false });
		subject = await loadSubject();
		clock = installSonnerClock();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		const { PrivyFiatFundingHostGate, Toaster } = subject;
		await act(async () =>
			root.render(
				<StrictMode>
					<I18nProvider i18n={i18n}>
						<Toaster />
						<PrivyFiatFundingHostGate />
					</I18nProvider>
				</StrictMode>,
			),
		);
	});

	afterEach(async () => {
		await act(async () => {
			toast.dismiss();
		});
		await clock.settle();
		act(() => root.unmount());
		container.remove();
		clock.uninstall();
		vi.doUnmock(HOST_MODULE);
		vi.clearAllMocks();
	});

	function cards() {
		return [...container.querySelectorAll<HTMLElement>("[data-privy-fiat-funding-notice]")];
	}

	function toasts() {
		return container.querySelectorAll("[data-sonner-toast]");
	}

	async function settleHostImport() {
		await act(async () => {
			await import(HOST_MODULE).catch(() => undefined);
			await vi.dynamicImportSettled();
		});
		await clock.timers();
	}

	it("mounts nothing until the purchase entry loads the host", async () => {
		const hostRenders = vi.fn(() => null);
		vi.doMock(HOST_MODULE, () => ({ PrivyFiatFundingHost: hostRenders }));
		expect(hostRenders).not.toHaveBeenCalled();
		expect(subject.store.readPrivyFiatFundingHost()).toBeNull();

		let loaded = false;
		await act(async () => {
			loaded = await subject.loadPrivyFiatFundingHost();
		});

		expect(loaded).toBe(true);
		expect(hostRenders).toHaveBeenCalled();
		expect(subject.store.readPrivyFiatFundingAttempt()).toBeNull();
		expect(toasts()).toHaveLength(0);
	});

	it("hands a launched attempt to the host it loads", async () => {
		const hostRenders = vi.fn(() => null);
		vi.doMock(HOST_MODULE, () => ({ PrivyFiatFundingHost: hostRenders }));
		const attempt = createAttempt();

		await act(async () => subject.launchPrivyFiatFunding(attempt));
		await settleHostImport();

		expect(hostRenders).toHaveBeenCalled();
		expect(subject.store.isCurrentPrivyFiatFundingAttempt(attempt)).toBe(true);
		expect(toasts()).toHaveLength(0);
	});

	it("ends the attempt with a fixed notice when the host cannot load", async () => {
		vi.doMock(HOST_MODULE, () => {
			throw new Error(IMPORT_ERROR);
		});
		const attempt = createAttempt();

		await act(async () => subject.launchPrivyFiatFunding(attempt));
		await settleHostImport();

		expect(subject.store.isCurrentPrivyFiatFundingAttempt(attempt)).toBe(false);
		expect(cards().map((card) => card.dataset.privyFiatFundingNotice)).toEqual(["unavailable"]);
		expect(cards()[0].querySelector('[role="alert"]')?.textContent).toBe(UNAVAILABLE);
		expect(container.textContent).not.toContain("dynamically imported");

		await clock.timers(10_000);
		await clock.settle();
		expect(toasts()).toHaveLength(0);
	});

	it("stays quiet when a warm-up cannot load the host and loads it for the next launch", async () => {
		const hostRenders = vi.fn(() => null);
		let available = false;
		vi.doMock(HOST_MODULE, () => {
			if (!available) throw new Error(IMPORT_ERROR);
			return { PrivyFiatFundingHost: hostRenders };
		});

		let loaded = true;
		await act(async () => {
			loaded = await subject.loadPrivyFiatFundingHost();
		});
		await clock.settle();
		expect(loaded).toBe(false);
		expect(toasts()).toHaveLength(0);
		expect(hostRenders).not.toHaveBeenCalled();

		available = true;
		const attempt = createAttempt();
		await act(async () => subject.launchPrivyFiatFunding(attempt));
		await settleHostImport();
		expect(hostRenders).toHaveBeenCalled();
		expect(subject.store.isCurrentPrivyFiatFundingAttempt(attempt)).toBe(true);
		expect(toasts()).toHaveLength(0);
	});

	it.each([
		["owner", { clientKey: OTHER }],
		["network", { isTestnet: true }],
	])("ends the attempt without telling a different %s that the purchase could not open", async (_label, next) => {
		const hostImport = failingImport();
		vi.doMock(HOST_MODULE, () => hostImport.promise);
		const attempt = createAttempt();

		await act(async () => subject.launchPrivyFiatFunding(attempt));
		await act(async () => session.set(next));
		hostImport.fail();
		await settleHostImport();

		expect(subject.store.isCurrentPrivyFiatFundingAttempt(attempt)).toBe(false);
		expect(cards()).toHaveLength(0);
		expect(container.textContent).not.toContain("Card purchase");
		await clock.settle();
		await clock.timers(600_000);
		expect(toasts()).toHaveLength(0);
	});

	it("stops showing the failure in the same commit as an identity change and removes it", async () => {
		vi.doMock(HOST_MODULE, () => {
			throw new Error(IMPORT_ERROR);
		});
		await act(async () => subject.launchPrivyFiatFunding(createAttempt()));
		await settleHostImport();
		expect(cards()).toHaveLength(1);

		act(() => session.set({ clientKey: OTHER }));
		expect(cards()).toHaveLength(0);
		expect(container.textContent).not.toContain("Card purchase");

		await clock.settle();
		expect(toasts()).toHaveLength(0);
	});

	it("does not bring the failure back when the owner returns before Sonner removed it", async () => {
		vi.doMock(HOST_MODULE, () => {
			throw new Error(IMPORT_ERROR);
		});
		await act(async () => subject.launchPrivyFiatFunding(createAttempt()));
		await settleHostImport();
		expect(cards()).toHaveLength(1);

		act(() => session.set({ clientKey: OTHER }));
		act(() => session.set({ clientKey: OWNER }));

		expect(cards()).toHaveLength(0);
		await clock.settle();
		expect(toasts()).toHaveLength(0);
	});

	it("lets the owner dismiss the failure notice", async () => {
		vi.doMock(HOST_MODULE, () => {
			throw new Error(IMPORT_ERROR);
		});
		await act(async () => subject.launchPrivyFiatFunding(createAttempt()));
		await settleHostImport();
		const button = cards()[0].querySelector<HTMLButtonElement>('button[aria-label="Dismiss"]');
		if (!button) throw new Error("Expected the notice's dismiss button");

		await act(async () => button.click());
		expect(cards()).toHaveLength(0);
		await clock.settle();
		expect(toasts()).toHaveLength(0);
	});

	it("refuses a second launch while a purchase is open and reports only the first", async () => {
		const hostImport = failingImport();
		vi.doMock(HOST_MODULE, () => hostImport.promise);
		const first = createAttempt();
		const second = createAttempt();

		await act(async () => {
			subject.launchPrivyFiatFunding(first);
			subject.launchPrivyFiatFunding(second);
		});
		expect(subject.store.isCurrentPrivyFiatFundingAttempt(first)).toBe(true);

		hostImport.fail();
		await settleHostImport();
		expect(cards()).toHaveLength(1);
		expect(subject.store.readPrivyFiatFundingAttempt()).toBeNull();
	});

	it("leaves a newer attempt alone when the download of an already ended attempt fails", async () => {
		const hostImport = failingImport();
		vi.doMock(HOST_MODULE, () => hostImport.promise);
		const ended = createAttempt();
		const newer = createAttempt();

		await act(async () => subject.launchPrivyFiatFunding(ended));
		await act(async () => {
			subject.store.finishPrivyFiatFunding(ended);
			subject.store.requestPrivyFiatFunding(newer);
		});
		hostImport.fail();
		await settleHostImport();

		expect(subject.store.isCurrentPrivyFiatFundingAttempt(newer)).toBe(true);
		expect(toasts()).toHaveLength(0);
	});
});
