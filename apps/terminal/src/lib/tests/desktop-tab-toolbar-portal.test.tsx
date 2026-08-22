/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DesktopTabToolbarPortal } from "@/components/trade/positions/desktop-tab-toolbar-portal";

describe("desktop tab toolbar portal", () => {
	let container: HTMLDivElement;
	let target: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		target = document.createElement("div");
		document.body.append(container, target);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		target.remove();
	});

	it("renders only in the active header target and keeps isolated component fallback", () => {
		act(() => {
			root.render(
				<DesktopTabToolbarPortal target={target}>
					<button type="button">Context action</button>
				</DesktopTabToolbarPortal>,
			);
		});
		expect(target.textContent).toBe("Context action");
		expect(container.textContent).toBe("");

		act(() => {
			root.render(
				<DesktopTabToolbarPortal target={null}>
					<button type="button">Context action</button>
				</DesktopTabToolbarPortal>,
			);
		});
		expect(target.textContent).toBe("");
		expect(container.textContent).toBe("");

		act(() => {
			root.render(
				<DesktopTabToolbarPortal>
					<button type="button">Context action</button>
				</DesktopTabToolbarPortal>,
			);
		});
		expect(container.textContent).toBe("Context action");
	});
});
