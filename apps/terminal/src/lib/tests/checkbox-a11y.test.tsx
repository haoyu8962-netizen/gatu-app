/** @vitest-environment jsdom */

import { Checkbox } from "@gatu/ui";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

describe("Checkbox accessibility", () => {
	const containers: HTMLDivElement[] = [];
	const roots: ReturnType<typeof createRoot>[] = [];

	afterEach(() => {
		for (const root of roots.splice(0)) act(() => root.unmount());
		for (const container of containers.splice(0)) container.remove();
	});

	function renderCheckbox(element: ReactNode) {
		const container = document.createElement("div");
		document.body.appendChild(container);
		containers.push(container);
		const root = createRoot(container);
		roots.push(root);
		act(() => root.render(element));
		return container;
	}

	it("uses the short label as its name and the explanatory copy as its description", () => {
		const container = renderCheckbox(
			<Checkbox
				checked={false}
				onCheckedChange={() => {}}
				label="Don't show this confirmation again"
				description="Future full-position closes will submit immediately."
			/>,
		);
		const checkbox = container.querySelector<HTMLElement>('[role="checkbox"]');
		const labelledBy = checkbox?.getAttribute("aria-labelledby");
		const describedBy = checkbox?.getAttribute("aria-describedby");

		expect(labelledBy).toBeTruthy();
		expect(describedBy).toBeTruthy();
		expect(document.getElementById(labelledBy ?? "")?.textContent).toBe("Don't show this confirmation again");
		expect(document.getElementById(describedBy ?? "")?.textContent).toBe(
			"Future full-position closes will submit immediately.",
		);
	});

	it("preserves an explicit aria-label while still exposing the description", () => {
		const container = renderCheckbox(
			<Checkbox
				aria-label="Expanded control name"
				checked={false}
				onCheckedChange={() => {}}
				label="Short visual label"
				description="Control description"
			/>,
		);
		const checkbox = container.querySelector<HTMLElement>('[role="checkbox"]');

		expect(checkbox?.getAttribute("aria-label")).toBe("Expanded control name");
		const labelledBy = checkbox?.getAttribute("aria-labelledby") ?? "";
		expect(document.getElementById(labelledBy)?.textContent).toBe("Expanded control name");
		const describedBy = checkbox?.getAttribute("aria-describedby") ?? "";
		expect(document.getElementById(describedBy)?.textContent).toBe("Control description");
	});
});
