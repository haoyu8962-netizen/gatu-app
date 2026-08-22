/** @vitest-environment jsdom */

import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useMobileDisclosureSet } from "@/components/trade/mobile/use-mobile-disclosure-set";

function DisclosureHarness({ identity, keys }: { identity: string | null; keys: readonly string[] }) {
	const { expandedKeys, setExpanded, expandAll, collapseAll } = useMobileDisclosureSet(identity, keys);

	return (
		<div>
			<output data-testid="expanded">{[...expandedKeys].join(",")}</output>
			<button type="button" onClick={() => setExpanded("one", !expandedKeys.has("one"))}>
				Toggle first
			</button>
			<button type="button" onClick={() => expandAll()}>
				Expand all
			</button>
			<button type="button" onClick={() => collapseAll()}>
				Collapse all
			</button>
		</div>
	);
}

function StrictDisclosureHarness(props: { identity: string | null; keys: readonly string[] }) {
	return (
		<StrictMode>
			<DisclosureHarness {...props} />
		</StrictMode>
	);
}

describe("useMobileDisclosureSet", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("keeps asynchronously available cards collapsed until the user expands them", () => {
		act(() => root.render(<StrictDisclosureHarness identity="owner-one" keys={[]} />));
		expect(container.querySelector('[data-testid="expanded"]')?.textContent).toBe("");

		act(() => root.render(<StrictDisclosureHarness identity="owner-one" keys={["one", "two"]} />));
		expect(container.querySelector('[data-testid="expanded"]')?.textContent).toBe("");

		const buttons = [...container.querySelectorAll<HTMLButtonElement>("button")];
		act(() => buttons.find((button) => button.textContent?.trim() === "Toggle first")?.click());
		expect(container.querySelector('[data-testid="expanded"]')?.textContent).toBe("one");

		act(() => buttons.find((button) => button.textContent?.trim() === "Expand all")?.click());
		expect(container.querySelector('[data-testid="expanded"]')?.textContent).toBe("one,two");

		act(() => buttons.find((button) => button.textContent?.trim() === "Collapse all")?.click());
		expect(container.querySelector('[data-testid="expanded"]')?.textContent).toBe("");
	});

	it("preserves explicit state and merges bulk updates for filtered keys", () => {
		act(() => root.render(<StrictDisclosureHarness identity="owner-one" keys={["one", "two"]} />));

		const buttons = [...container.querySelectorAll<HTMLButtonElement>("button")];
		const toggleFirst = buttons.find((button) => button.textContent?.trim() === "Toggle first");
		act(() => toggleFirst?.click());
		expect(container.querySelector('[data-testid="expanded"]')?.textContent).toBe("one");

		act(() => root.render(<StrictDisclosureHarness identity="owner-one" keys={[]} />));
		expect(container.querySelector('[data-testid="expanded"]')?.textContent).toBe("one");

		act(() => root.render(<StrictDisclosureHarness identity="owner-one" keys={["two"]} />));
		expect(container.querySelector('[data-testid="expanded"]')?.textContent).toBe("one");

		const filteredButtons = [...container.querySelectorAll<HTMLButtonElement>("button")];
		act(() => filteredButtons.find((button) => button.textContent?.trim() === "Expand all")?.click());
		expect(container.querySelector('[data-testid="expanded"]')?.textContent).toBe("one,two");
		act(() => filteredButtons.find((button) => button.textContent?.trim() === "Collapse all")?.click());
		expect(container.querySelector('[data-testid="expanded"]')?.textContent).toBe("one");

		act(() => root.render(<StrictDisclosureHarness identity="owner-one" keys={["two", "one", "three"]} />));
		expect(container.querySelector('[data-testid="expanded"]')?.textContent).toBe("one");
	});

	it("resets to a collapsed state when the identity changes", () => {
		act(() => root.render(<StrictDisclosureHarness identity="owner-one" keys={["one", "two"]} />));
		const toggleFirst = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent?.trim() === "Toggle first",
		);
		act(() => toggleFirst?.click());
		expect(container.querySelector('[data-testid="expanded"]')?.textContent).toBe("one");

		act(() => root.render(<StrictDisclosureHarness identity="owner-two" keys={["one", "two"]} />));
		expect(container.querySelector('[data-testid="expanded"]')?.textContent).toBe("");

		act(() => root.render(<StrictDisclosureHarness identity="owner-one" keys={["one", "two"]} />));
		expect(container.querySelector('[data-testid="expanded"]')?.textContent).toBe("");

		act(() => toggleFirst?.click());
		expect(container.querySelector('[data-testid="expanded"]')?.textContent).toBe("one");

		act(() => root.render(<StrictDisclosureHarness identity={null} keys={["one", "two"]} />));
		expect(container.querySelector('[data-testid="expanded"]')?.textContent).toBe("");

		act(() => root.render(<StrictDisclosureHarness identity="owner-one" keys={["one", "two"]} />));
		expect(container.querySelector('[data-testid="expanded"]')?.textContent).toBe("");
	});
});
