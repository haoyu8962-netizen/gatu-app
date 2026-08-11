// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { loadScript } from "@/lib/load-script";

function findTestScript(path: string): HTMLScriptElement {
	const absoluteUrl = new URL(path, window.location.href).href;
	const script = [...document.scripts].find((candidate) => candidate.src === absoluteUrl);
	if (!script) throw new Error(`Test script was not inserted: ${path}`);
	return script;
}

afterEach(() => {
	for (const script of [...document.scripts]) {
		if (script.src.includes("load-script-test")) script.remove();
	}
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe("loadScript", () => {
	it("registers load handlers before inserting a hot-cache script", async () => {
		let ready = false;
		const originalAppendChild = document.head.appendChild.bind(document.head);
		vi.spyOn(document.head, "appendChild").mockImplementation(((node: Node) => {
			const appended = originalAppendChild(node);
			if (node instanceof HTMLScriptElement && node.src.includes("load-script-test-hot")) {
				ready = true;
				node.dispatchEvent(new Event("load"));
			}
			return appended;
		}) as typeof document.head.appendChild);

		await expect(
			loadScript("/load-script-test-hot.js", {
				isReady: () => ready,
				timeoutMs: 100,
			}),
		).resolves.toBeUndefined();
	});

	it("rejects and removes a script whose load event does not satisfy isReady", async () => {
		const promise = loadScript("/load-script-test-not-ready.js", {
			isReady: () => false,
			timeoutMs: 100,
		});
		const script = findTestScript("/load-script-test-not-ready.js");

		script.dispatchEvent(new Event("load"));

		await expect(promise).rejects.toThrow("Script loaded but did not initialize");
		expect(script.isConnected).toBe(false);
	});

	it("allows a clean retry after a loaded script fails its readiness check", async () => {
		let ready = false;
		const firstAttempt = loadScript("/load-script-test-retry.js", {
			isReady: () => ready,
			timeoutMs: 100,
		});
		findTestScript("/load-script-test-retry.js").dispatchEvent(new Event("load"));
		await expect(firstAttempt).rejects.toThrow("Script loaded but did not initialize");

		const secondAttempt = loadScript("/load-script-test-retry.js", {
			isReady: () => ready,
			timeoutMs: 100,
		});
		const secondScript = findTestScript("/load-script-test-retry.js");
		ready = true;
		secondScript.dispatchEvent(new Event("load"));

		await expect(secondAttempt).resolves.toBeUndefined();
		expect(secondScript.getAttribute("data-loaded")).toBe("true");
	});

	it("still supports scripts that do not expose a readiness predicate", async () => {
		const promise = loadScript("/load-script-test-event-only.js", { timeoutMs: 100 });
		findTestScript("/load-script-test-event-only.js").dispatchEvent(new Event("load"));

		await expect(promise).resolves.toBeUndefined();
	});

	it("rejects an event-only script when no load event arrives before the timeout", async () => {
		vi.useFakeTimers();
		const promise = loadScript("/load-script-test-event-timeout.js", { timeoutMs: 100 });
		const assertion = expect(promise).rejects.toThrow("Script load timeout");

		await vi.advanceTimersByTimeAsync(100);

		await assertion;
		expect([...document.scripts].some((script) => script.src.endsWith("/load-script-test-event-timeout.js"))).toBe(
			false,
		);
	});
});
