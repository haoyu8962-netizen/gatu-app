// @vitest-environment jsdom

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PwaInstallProvider, usePwaInstall } from "@/providers/pwa-install";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function PwaProbe() {
	const { capability, promptInstall } = usePwaInstall();
	const [outcome, setOutcome] = useState("");

	return (
		<button
			type="button"
			data-capability={capability}
			data-outcome={outcome}
			onClick={() => void promptInstall().then(setOutcome)}
		>
			Install
		</button>
	);
}

function createInstallPromptEvent(outcome: "accepted" | "dismissed") {
	const event = new Event("beforeinstallprompt", { cancelable: true });
	const prompt = vi.fn().mockResolvedValue(undefined);
	Object.defineProperties(event, {
		prompt: { value: prompt },
		userChoice: { value: Promise.resolve({ outcome }) },
	});
	return { event, prompt };
}

describe("PwaInstallProvider", () => {
	let container: HTMLDivElement;
	let mobileSurfaceMatch: boolean;
	let root: Root | undefined;
	let standaloneMatch: boolean;

	beforeEach(() => {
		mobileSurfaceMatch = true;
		standaloneMatch = false;
		Object.defineProperty(window, "matchMedia", {
			configurable: true,
			value: vi.fn().mockImplementation((query: string) => ({
				addEventListener: vi.fn(),
				matches: query === "(display-mode: standalone)" ? standaloneMatch : mobileSurfaceMatch,
				removeEventListener: vi.fn(),
			})),
		});
		Object.defineProperty(navigator, "userAgent", {
			configurable: true,
			value: "Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36",
		});
		Object.defineProperty(navigator, "platform", { configurable: true, value: "Linux x86_64" });
		Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, value: 0 });
		Object.defineProperty(navigator, "standalone", { configurable: true, value: false });
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		if (root) act(() => root?.unmount());
		container.remove();
		vi.restoreAllMocks();
	});

	function renderProbe() {
		act(() => {
			root?.render(
				<PwaInstallProvider>
					<PwaProbe />
				</PwaInstallProvider>,
			);
		});
		return container.querySelector("button") as HTMLButtonElement;
	}

	it("captures and consumes a Chromium install prompt only once", async () => {
		const button = renderProbe();
		const { event, prompt } = createInstallPromptEvent("accepted");

		act(() => window.dispatchEvent(event));
		expect(event.defaultPrevented).toBe(true);
		expect(button.dataset.capability).toBe("browser-prompt");

		await act(async () => {
			button.click();
			await Promise.resolve();
		});
		expect(prompt).toHaveBeenCalledTimes(1);
		expect(button.dataset.outcome).toBe("accepted");
		expect(button.dataset.capability).toBe("unsupported");

		await act(async () => {
			button.click();
			await Promise.resolve();
		});
		expect(prompt).toHaveBeenCalledTimes(1);
		expect(button.dataset.outcome).toBe("failed");
	});

	it("preserves the browser's native install UI outside the mobile surface", () => {
		mobileSurfaceMatch = false;
		const button = renderProbe();
		const { event, prompt } = createInstallPromptEvent("accepted");

		act(() => window.dispatchEvent(event));

		expect(event.defaultPrevented).toBe(false);
		expect(button.dataset.capability).toBe("unsupported");
		expect(prompt).not.toHaveBeenCalled();
	});

	it("reports a dismissed browser prompt without retaining the consumed event", async () => {
		const button = renderProbe();
		const { event, prompt } = createInstallPromptEvent("dismissed");

		act(() => window.dispatchEvent(event));
		await act(async () => {
			button.click();
			await Promise.resolve();
		});

		expect(prompt).toHaveBeenCalledTimes(1);
		expect(button.dataset.outcome).toBe("dismissed");
		expect(button.dataset.capability).toBe("unsupported");
	});

	it("fails closed when the browser install prompt rejects", async () => {
		const button = renderProbe();
		const { event, prompt } = createInstallPromptEvent("accepted");
		prompt.mockRejectedValueOnce(new Error("install prompt unavailable"));

		act(() => window.dispatchEvent(event));
		await act(async () => {
			button.click();
			await Promise.resolve();
		});

		expect(prompt).toHaveBeenCalledTimes(1);
		expect(button.dataset.outcome).toBe("failed");
		expect(button.dataset.capability).toBe("unsupported");
	});

	it("offers manual instructions on iOS when no browser prompt is available", () => {
		Object.defineProperty(navigator, "userAgent", {
			configurable: true,
			value: "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
		});

		const button = renderProbe();

		expect(button.dataset.capability).toBe("ios-instructions");
	});

	it("treats iPad desktop mode as iOS", () => {
		Object.defineProperty(navigator, "platform", { configurable: true, value: "MacIntel" });
		Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, value: 5 });

		const button = renderProbe();

		expect(button.dataset.capability).toBe("ios-instructions");
	});

	it("hides installation when already running in standalone mode", () => {
		standaloneMatch = true;

		const button = renderProbe();

		expect(button.dataset.capability).toBe("installed");
	});

	it("recognizes the iOS standalone navigator flag", () => {
		Object.defineProperty(navigator, "standalone", { configurable: true, value: true });

		const button = renderProbe();

		expect(button.dataset.capability).toBe("installed");
	});

	it("clears a captured prompt after the appinstalled event", () => {
		const button = renderProbe();
		const { event } = createInstallPromptEvent("accepted");

		act(() => window.dispatchEvent(event));
		expect(button.dataset.capability).toBe("browser-prompt");
		act(() => window.dispatchEvent(new Event("appinstalled")));

		expect(button.dataset.capability).toBe("installed");
	});

	it("removes install event listeners when the provider unmounts", () => {
		const removeEventListener = vi.spyOn(window, "removeEventListener");
		renderProbe();

		act(() => root?.unmount());
		root = undefined;

		expect(removeEventListener).toHaveBeenCalledWith("beforeinstallprompt", expect.any(Function));
		expect(removeEventListener).toHaveBeenCalledWith("appinstalled", expect.any(Function));
	});
});
