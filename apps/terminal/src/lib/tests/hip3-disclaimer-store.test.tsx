// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

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
		const { useHasAcceptedHip3Disclaimer, useHip3DisclaimerActions } = await import(
			"@/stores/use-hip3-disclaimer-store"
		);

		function StoreProbe() {
			const hasAccepted = useHasAcceptedHip3Disclaimer();
			const { accept } = useHip3DisclaimerActions();
			return createElement("button", { onClick: accept, type: "button" }, String(hasAccepted));
		}

		act(() => root.render(createElement(StoreProbe)));
		expect(container.textContent).toBe("false");

		const button = container.querySelector("button");
		if (!(button instanceof HTMLButtonElement)) throw new Error("Store probe button not found");
		act(() => button.click());

		expect(container.textContent).toBe("true");
		expect(JSON.parse(localStorage.getItem("hip3-deployer-disclaimer-v1") ?? "null")).toEqual({
			state: { acceptedVersion: 1 },
			version: 1,
		});
	});
});
