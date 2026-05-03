// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const STORAGE_KEY = "terminal-perf-enabled";

describe("render profile feature flag", () => {
	beforeEach(() => {
		vi.resetModules();
		installLocalStorage();
		window.localStorage.clear();
		window.history.replaceState(null, "", "/");
	});

	afterEach(() => {
		window.localStorage.clear();
		window.history.replaceState(null, "", "/");
	});

	it("caches the browser flag after the first read", async () => {
		window.localStorage.setItem(STORAGE_KEY, "1");
		const { isRenderProfilingEnabled } = await import("@/lib/performance/render-profile");

		expect(isRenderProfilingEnabled()).toBe(true);

		window.localStorage.removeItem(STORAGE_KEY);

		expect(isRenderProfilingEnabled()).toBe(true);
	});

	it("does not mutate persisted opt-in from URL overrides", async () => {
		window.localStorage.setItem(STORAGE_KEY, "1");
		window.history.replaceState(null, "", "/?terminal_perf=0");
		const { isRenderProfilingEnabled } = await import("@/lib/performance/render-profile");

		expect(isRenderProfilingEnabled()).toBe(false);
		expect(window.localStorage.getItem(STORAGE_KEY)).toBe("1");
	});
});

function installLocalStorage() {
	const values = new Map<string, string>();
	Object.defineProperty(window, "localStorage", {
		configurable: true,
		value: {
			getItem: (key: string) => values.get(key) ?? null,
			setItem: (key: string, value: string) => values.set(key, value),
			removeItem: (key: string) => values.delete(key),
			clear: () => values.clear(),
		},
	});
}
