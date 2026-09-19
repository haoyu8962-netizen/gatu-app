// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderBootstrapErrorPage } from "@/lib/bootstrap-error-page";

describe("bootstrap error page", () => {
	beforeEach(() => {
		document.body.replaceChildren();
		window.localStorage.clear();
	});

	afterEach(() => {
		document.body.replaceChildren();
		document.documentElement.lang = "en";
		document.documentElement.dir = "ltr";
		vi.restoreAllMocks();
		window.localStorage.clear();
	});

	it("renders once and reloads only after one explicit button activation", () => {
		const onReload = vi.fn();

		renderBootstrapErrorPage({ onReload });
		const firstFallback = document.querySelector("[data-terminal-bootstrap-error]");
		renderBootstrapErrorPage({ onReload });

		expect(document.querySelectorAll("[data-terminal-bootstrap-error]")).toHaveLength(1);
		expect(document.querySelectorAll("main")).toHaveLength(1);
		expect(document.querySelector("main")?.getAttribute("role")).toBeNull();
		expect(document.querySelector("main")?.querySelector('[role="alert"]')).not.toBeNull();
		expect(document.querySelector("[data-terminal-bootstrap-error]")).toBe(firstFallback);
		expect(onReload).not.toHaveBeenCalled();

		const reloadButton = document.querySelector<HTMLButtonElement>("button");
		expect(reloadButton).not.toBeNull();
		expect(document.activeElement).toBe(reloadButton);
		expect(reloadButton?.style.backgroundColor).toBe("rgb(215, 255, 63)");
		expect(reloadButton?.style.color).toBe("rgb(8, 9, 13)");
		expect(getContrastRatio("#d7ff3f", "#08090d")).toBeGreaterThanOrEqual(4.5);
		reloadButton?.click();
		reloadButton?.click();

		expect(onReload).toHaveBeenCalledOnce();
	});

	it("uses the persisted locale and direction without waiting for the application catalog", () => {
		window.localStorage.setItem("locale-v1", "ar");

		renderBootstrapErrorPage();

		const fallback = document.querySelector<HTMLElement>("[data-terminal-bootstrap-error]");
		expect(document.documentElement.lang).toBe("ar");
		expect(document.documentElement.dir).toBe("rtl");
		expect(fallback?.lang).toBe("ar");
		expect(fallback?.dir).toBe("rtl");
		expect(fallback?.textContent).toContain("حدث خطأ ما");
		expect(fallback?.textContent).toContain("إعادة تحميل المنصة");
	});

	it("fails closed to English when persisted locale storage cannot be read", () => {
		vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
			throw new Error("storage unavailable");
		});

		renderBootstrapErrorPage();

		expect(document.documentElement.lang).toBe("en");
		expect(document.documentElement.dir).toBe("ltr");
		expect(document.body.textContent).toContain("The terminal could not start safely.");
	});

	it("stays on system fonts so the recovery text never waits for a blocked webfont", () => {
		renderBootstrapErrorPage();

		const fallback = document.querySelector<HTMLElement>("[data-terminal-bootstrap-error]");
		expect(fallback?.style.fontFamily).toBe("system-ui, sans-serif");
	});
});

function getContrastRatio(foreground: string, background: string): number {
	const foregroundLuminance = getRelativeLuminance(foreground);
	const backgroundLuminance = getRelativeLuminance(background);
	return (
		(Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
		(Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
	);
}

function getRelativeLuminance(hex: string): number {
	const channels = hex
		.slice(1)
		.match(/.{2}/g)
		?.map((channel) => Number.parseInt(channel, 16) / 255);
	if (!channels || channels.length !== 3) throw new Error(`Invalid color: ${hex}`);
	const [red, green, blue] = channels.map((channel) =>
		channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
	);
	return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}
