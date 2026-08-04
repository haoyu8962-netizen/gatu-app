/** @vitest-environment jsdom */

import { Tabs, TabsList, TabsTrigger } from "@gatu/ui";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

describe("TabsList indicator visual slot", () => {
	const containers: HTMLDivElement[] = [];
	const roots: ReturnType<typeof createRoot>[] = [];

	afterEach(() => {
		for (const root of roots.splice(0)) act(() => root.unmount());
		for (const container of containers.splice(0)) container.remove();
	});

	it("applies an indicator override without changing the tab trigger", () => {
		const container = document.createElement("div");
		document.body.appendChild(container);
		containers.push(container);
		const root = createRoot(container);
		roots.push(root);

		act(() => {
			root.render(
				<Tabs defaultValue="positions">
					<TabsList indicatorClassName="bg-market-close-fg duration-[120ms]">
						<TabsTrigger value="positions">Positions</TabsTrigger>
					</TabsList>
				</Tabs>,
			);
		});

		const indicator = container.querySelector<HTMLElement>("[style*='--active-tab-left']");
		expect(indicator?.className).toContain("bg-market-close-fg");
		expect(indicator?.className).toContain("duration-[120ms]");
		expect(container.querySelector('[role="tab"]')?.textContent).toBe("Positions");
	});
});
