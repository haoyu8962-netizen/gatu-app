// @vitest-environment jsdom

import { createHash, webcrypto } from "node:crypto";
import { i18n } from "@lingui/core";
import { act, createElement, Fragment, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QrScannerStart } from "@/components/trade/components/mobile-agent-qr-scanner";
import { MOBILE_SYNC_DRAFT_STORAGE_KEY } from "../mobile-sync/draft-storage";
import { createMobileAgentSyncUrl } from "../mobile-sync/sync-core";
import { createI18nRoot } from "./harness/react";

const NOW_MS = 1_779_364_227_000;
const USER_ADDRESS = "0x1111111111111111111111111111111111111111" as const;
const AGENT_PRIVATE_KEY = `0x${"ab".repeat(32)}` as const;
const featureState = vi.hoisted(() => ({ importEnabled: true }));

const scannerState = {
	callback: null as Parameters<QrScannerStart>[2] | null,
	startScanner: vi.fn<QrScannerStart>(),
	controlsStop: vi.fn(),
	trackStop: vi.fn(),
};

vi.mock("@lingui/react/macro", () => ({
	Trans: ({ children }: { children: ReactNode }) => createElement(Fragment, null, children),
}));

vi.mock("@lingui/core/macro", () => ({
	t: (strings: TemplateStringsArray | string, ...values: unknown[]) =>
		typeof strings === "string"
			? strings
			: strings.reduce((message, part, index) => `${message}${part}${values[index] ?? ""}`, ""),
}));

vi.mock("@phosphor-icons/react", () => ({
	ArrowLeftIcon: () => null,
	CameraIcon: () => null,
	QrCodeIcon: () => null,
	SpinnerGapIcon: () => null,
	WarningCircleIcon: () => null,
}));

vi.mock("@gatu/ui", () => ({
	Button: ({ children, disabled, onClick }: { children: ReactNode; disabled?: boolean; onClick?: () => void }) =>
		createElement("button", { disabled, onClick, type: "button" }, children),
}));

vi.mock("@/config/mobile-pairing", () => ({
	MOBILE_PAIRING_FEATURES: {
		get importFromQr() {
			return featureState.importEnabled;
		},
	},
}));

async function flushAsyncWork() {
	await act(async () => {
		await new Promise((resolve) => window.setTimeout(resolve, 0));
	});
}

async function createSyncFixture() {
	return createMobileAgentSyncUrl({
		appOrigin: window.location.origin,
		env: "Mainnet",
		userAddress: USER_ADDRESS,
		agentPrivateKey: AGENT_PRIVATE_KEY,
		nowMs: NOW_MS,
	});
}

function findButton(container: HTMLElement, label: string): HTMLButtonElement | undefined {
	return [...container.querySelectorAll("button")].find((button) => button.textContent?.includes(label));
}

describe("MobileAgentQrScanner", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		vi.stubGlobal("crypto", webcrypto);
		Object.defineProperty(window, "crypto", { value: webcrypto, configurable: true });
		vi.spyOn(Date, "now").mockReturnValue(NOW_MS);
		window.sessionStorage.clear();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		scannerState.callback = null;
		scannerState.startScanner.mockReset();
		scannerState.startScanner.mockImplementation(async (_constraints, video, callback) => {
			scannerState.callback = callback;
			Object.defineProperty(video, "srcObject", {
				value: { getTracks: () => [{ stop: scannerState.trackStop }] },
				writable: true,
				configurable: true,
			});
			return { stop: scannerState.controlsStop };
		});
		scannerState.controlsStop.mockReset();
		scannerState.trackStop.mockReset();
		featureState.importEnabled = true;
		Object.defineProperty(document, "visibilityState", {
			value: "visible",
			configurable: true,
		});
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		window.sessionStorage.clear();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("starts the rear camera only after an explicit click and stores a valid same-origin QR", async () => {
		const onSyncReady = vi.fn();
		const sync = await createSyncFixture();
		const { MobileAgentQrScanner } = await import("@/components/trade/components/mobile-agent-qr-scanner");

		act(() => {
			root.render(
				createElement(MobileAgentQrScanner, {
					onCancel: vi.fn(),
					onSyncReady,
					startScanner: scannerState.startScanner,
				}),
			);
		});
		expect(scannerState.startScanner).not.toHaveBeenCalled();

		act(() => findButton(container, "Start camera")?.click());
		await flushAsyncWork();

		expect(scannerState.startScanner).toHaveBeenCalledWith(
			{
				audio: false,
				video: { facingMode: { ideal: "environment" } },
			},
			expect.any(HTMLVideoElement),
			expect.any(Function),
		);

		act(() => {
			scannerState.callback?.(sync.url, { stop: scannerState.controlsStop });
		});

		expect(onSyncReady).toHaveBeenCalledTimes(1);
		expect(scannerState.controlsStop).toHaveBeenCalled();
		expect(scannerState.trackStop).toHaveBeenCalled();
		expect(window.sessionStorage.getItem(MOBILE_SYNC_DRAFT_STORAGE_KEY)).toContain(sync.syncId);
	});

	it("rejects a cross-origin QR without persisting or navigating", async () => {
		const onSyncReady = vi.fn();
		const { MobileAgentQrScanner } = await import("@/components/trade/components/mobile-agent-qr-scanner");

		act(() => {
			root.render(
				createElement(MobileAgentQrScanner, {
					onCancel: vi.fn(),
					onSyncReady,
					startScanner: scannerState.startScanner,
				}),
			);
		});
		act(() => findButton(container, "Start camera")?.click());
		await flushAsyncWork();

		act(() => {
			scannerState.callback?.("https://evil.example/mobile-agent-sync#ht-mobile-sync=payload&k=secret", {
				stop: scannerState.controlsStop,
			});
		});

		expect(onSyncReady).not.toHaveBeenCalled();
		expect(window.sessionStorage.getItem(MOBILE_SYNC_DRAFT_STORAGE_KEY)).toBeNull();
		expect(container.textContent).toContain("not a valid desktop wallet link");
		expect(container.textContent).not.toContain("evil.example");
		expect(container.textContent).not.toContain("secret");
	});

	it("retranslates visible scan feedback when the active locale changes", async () => {
		const { MobileAgentQrScanner } = await import("@/components/trade/components/mobile-agent-qr-scanner");
		act(() => {
			root.render(
				createElement(MobileAgentQrScanner, {
					onCancel: vi.fn(),
					startScanner: scannerState.startScanner,
				}),
			);
		});
		act(() => findButton(container, "Start camera")?.click());
		await flushAsyncWork();

		act(() => {
			scannerState.callback?.("https://evil.example/not-a-wallet-link", { stop: scannerState.controlsStop });
		});
		expect(container.querySelector('[role="alert"]')?.textContent).toContain(
			"This QR is not a valid desktop wallet link.",
		);

		const messageId = createHash("sha256")
			.update("This QR is not a valid desktop wallet link.\x1f")
			.digest("base64")
			.slice(0, 6);
		act(() => {
			i18n.loadAndActivate({
				locale: "ar",
				messages: { [messageId]: "رمز QR هذا ليس رابطًا صالحًا لمحفظة سطح المكتب." },
			});
		});

		expect(container.querySelector('[role="alert"]')?.textContent).toBe(
			"رمز QR هذا ليس رابطًا صالحًا لمحفظة سطح المكتب.",
		);
	});

	it("stops controls and camera tracks when the page becomes hidden", async () => {
		const { MobileAgentQrScanner } = await import("@/components/trade/components/mobile-agent-qr-scanner");
		act(() => {
			root.render(
				createElement(MobileAgentQrScanner, {
					onCancel: vi.fn(),
					startScanner: scannerState.startScanner,
				}),
			);
		});
		act(() => findButton(container, "Start camera")?.click());
		await flushAsyncWork();

		Object.defineProperty(document, "visibilityState", {
			value: "hidden",
			configurable: true,
		});
		act(() => document.dispatchEvent(new Event("visibilitychange")));

		expect(scannerState.controlsStop).toHaveBeenCalled();
		expect(scannerState.trackStop).toHaveBeenCalled();
	});

	it("still stops the camera tracks when the scanner control cleanup throws", async () => {
		scannerState.controlsStop.mockImplementation(() => {
			throw new Error("scanner cleanup failed");
		});
		const { MobileAgentQrScanner } = await import("@/components/trade/components/mobile-agent-qr-scanner");
		act(() => {
			root.render(
				createElement(MobileAgentQrScanner, {
					onCancel: vi.fn(),
					startScanner: scannerState.startScanner,
				}),
			);
		});
		act(() => findButton(container, "Start camera")?.click());
		await flushAsyncWork();

		Object.defineProperty(document, "visibilityState", {
			value: "hidden",
			configurable: true,
		});
		act(() => document.dispatchEvent(new Event("visibilitychange")));

		expect(scannerState.controlsStop).toHaveBeenCalled();
		expect(scannerState.trackStop).toHaveBeenCalled();
	});

	it("never starts the camera while QR import is gated off", async () => {
		featureState.importEnabled = false;
		const { MobileAgentQrScanner } = await import("@/components/trade/components/mobile-agent-qr-scanner");
		act(() => {
			root.render(
				createElement(MobileAgentQrScanner, {
					onCancel: vi.fn(),
					startScanner: scannerState.startScanner,
				}),
			);
		});

		act(() => findButton(container, "Start camera")?.click());

		expect(scannerState.startScanner).not.toHaveBeenCalled();
		expect(container.textContent).toContain("temporarily unavailable");
		expect(window.sessionStorage.getItem(MOBILE_SYNC_DRAFT_STORAGE_KEY)).toBeNull();
	});
});
