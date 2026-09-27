// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const STORAGE_KEY = "hip3-deployer-disclaimer-v1";

describe("HIP-3 disclaimer store", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		localStorage.clear();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		localStorage.clear();
	});

	it("persists the accepted disclaimer version after confirmation", async () => {
		const { hasAcceptedHip3Disclaimer, useHasAcceptedHip3Disclaimer, useHip3DisclaimerActions } = await import(
			"@/stores/use-hip3-disclaimer-store"
		);

		function StoreProbe() {
			const hasAccepted = useHasAcceptedHip3Disclaimer();
			const { accept } = useHip3DisclaimerActions();
			return createElement("button", { onClick: accept, type: "button" }, String(hasAccepted));
		}

		act(() => root.render(createElement(StoreProbe)));
		expect(container.textContent).toBe("false");
		expect(hasAcceptedHip3Disclaimer()).toBe(false);

		const button = container.querySelector("button");
		if (!(button instanceof HTMLButtonElement)) throw new Error("Store probe button not found");
		act(() => button.click());

		expect(container.textContent).toBe("true");
		expect(hasAcceptedHip3Disclaimer()).toBe(true);
		expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null")).toEqual({
			state: { acceptedVersion: 1 },
			version: 1,
		});
	});

	it("hydrates a stored acceptance so the disclaimer is not asked again after a reload", async () => {
		localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { acceptedVersion: 1 }, version: 1 }));
		vi.resetModules();
		const { hasAcceptedHip3Disclaimer, useHasAcceptedHip3Disclaimer } = await import(
			"@/stores/use-hip3-disclaimer-store"
		);

		function StoreProbe() {
			return createElement("output", null, String(useHasAcceptedHip3Disclaimer()));
		}

		expect(hasAcceptedHip3Disclaimer()).toBe(true);
		act(() => root.render(createElement(StoreProbe)));
		expect(container.textContent).toBe("true");
	});

	it("treats a malformed or outdated stored acceptance as not accepted", async () => {
		localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { acceptedVersion: "1" }, version: 1 }));
		vi.resetModules();
		const malformed = await import("@/stores/use-hip3-disclaimer-store");
		expect(malformed.hasAcceptedHip3Disclaimer()).toBe(false);

		localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { acceptedVersion: 0 }, version: 1 }));
		vi.resetModules();
		const outdated = await import("@/stores/use-hip3-disclaimer-store");
		expect(outdated.hasAcceptedHip3Disclaimer()).toBe(false);
	});
});
