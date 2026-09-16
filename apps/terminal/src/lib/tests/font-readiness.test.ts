// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	areFontsReady,
	FONT_READY_TIMEOUT_MS,
	MARKET_CLOSE_FONT_SPECS,
	STARTUP_FONT_SPECS,
	waitForFonts,
} from "@/lib/fonts/font-readiness";

function installFontFaceSet(fonts: Partial<FontFaceSet>) {
	Object.defineProperty(document, "fonts", { configurable: true, value: fonts });
}

afterEach(() => {
	Reflect.deleteProperty(document, "fonts");
	vi.useRealTimers();
});

describe("areFontsReady", () => {
	it("treats a browser without the CSS Font Loading API as ready", () => {
		expect(areFontsReady(STARTUP_FONT_SPECS)).toBe(true);
	});

	it("requires every spec to be loaded", () => {
		installFontFaceSet({ check: (spec) => spec.includes("Inter") });
		expect(areFontsReady(STARTUP_FONT_SPECS)).toBe(false);
		installFontFaceSet({ check: () => true });
		expect(areFontsReady(STARTUP_FONT_SPECS)).toBe(true);
	});
});

describe("waitForFonts", () => {
	it("resolves immediately when the faces are already loaded", async () => {
		const load = vi.fn();
		installFontFaceSet({ check: () => true, load });
		await expect(waitForFonts(STARTUP_FONT_SPECS)).resolves.toBeUndefined();
		expect(load).not.toHaveBeenCalled();
	});

	it("loads every spec and resolves once all of them settle", async () => {
		const resolvers: Array<() => void> = [];
		const load = vi.fn(
			(_spec: string) =>
				new Promise<FontFace[]>((resolve) => {
					resolvers.push(() => resolve([]));
				}),
		);
		installFontFaceSet({ check: () => false, load });
		let settled = false;
		const wait = waitForFonts(MARKET_CLOSE_FONT_SPECS).then(() => {
			settled = true;
		});
		expect(load.mock.calls.map(([spec]) => spec)).toEqual(MARKET_CLOSE_FONT_SPECS);
		resolvers[0]?.();
		await Promise.resolve();
		expect(settled).toBe(false);
		resolvers[1]?.();
		await wait;
		expect(settled).toBe(true);
	});

	it("resolves when a face fails to load", async () => {
		installFontFaceSet({ check: () => false, load: () => Promise.reject(new Error("blocked")) });
		await expect(waitForFonts(STARTUP_FONT_SPECS)).resolves.toBeUndefined();
	});

	it("gives up after the block timeout so a stalled font never holds the page", async () => {
		vi.useFakeTimers();
		installFontFaceSet({ check: () => false, load: () => new Promise(() => {}) });
		let settled = false;
		const wait = waitForFonts(STARTUP_FONT_SPECS).then(() => {
			settled = true;
		});
		await vi.advanceTimersByTimeAsync(FONT_READY_TIMEOUT_MS - 1);
		expect(settled).toBe(false);
		await vi.advanceTimersByTimeAsync(1);
		await wait;
		expect(settled).toBe(true);
	});
});
