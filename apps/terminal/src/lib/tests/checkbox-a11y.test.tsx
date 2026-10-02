/** @vitest-environment jsdom */

import { Checkbox } from "@sairn/ui";
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

	it("applies visual slot classes to the control, indicator, and label nodes", () => {
		const container = renderCheckbox(
			<Checkbox
				checked
				className="items-center"
				controlClassName="size-5 !rounded-[5px] transition-all duration-[120ms]"
				indicatorClassName="text-white [&>svg]:size-3"
				label="Visual label"
				labelClassName="text-[13px] text-market-close-muted"
				onCheckedChange={() => {}}
			/>,
		);
		const checkbox = container.querySelector<HTMLElement>('[role="checkbox"]');
		const labelledBy = checkbox?.getAttribute("aria-labelledby") ?? "";
		const indicator = checkbox?.firstElementChild;
		const label = document.getElementById(labelledBy);

		expect(checkbox?.className).toContain("size-5");
		expect(checkbox?.className).toContain("!rounded-[5px]");
		expect(checkbox?.className).toContain("transition-all");
		expect(checkbox?.className).toContain("duration-[120ms]");
		expect(checkbox?.className).not.toContain("transition-colors");
		expect(checkbox?.className).not.toContain("duration-150");
		expect(indicator?.className).toContain("text-white");
		expect(indicator?.className).toContain("[&>svg]:size-3");
		expect(label?.className).toContain("text-[13px]");
		expect(label?.className).toContain("text-market-close-muted");
	});
});
