/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useMobileDisclosureSet } from "@/components/trade/mobile/use-mobile-disclosure-set";

function DisclosureHarness({ identity, keys }: { identity: string; keys: readonly string[] }) {
	const { expandedKeys, setExpanded, expandAll, collapseAll } = useMobileDisclosureSet(identity, keys);

	return (
		<div>
			<output data-testid="expanded">{[...expandedKeys].join(",")}</output>
			<button type="button" onClick={() => setExpanded("one", false)}>
				Collapse first
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

	it("defaults the first asynchronously available card to expanded and preserves explicit controls", () => {
		act(() => root.render(<DisclosureHarness identity="owner-one" keys={[]} />));
		expect(container.querySelector('[data-testid="expanded"]')?.textContent).toBe("");

		act(() => root.render(<DisclosureHarness identity="owner-one" keys={["one", "two"]} />));
		expect(container.querySelector('[data-testid="expanded"]')?.textContent).toBe("one");

		const buttons = [...container.querySelectorAll<HTMLButtonElement>("button")];
		act(() => buttons.find((button) => button.textContent?.trim() === "Collapse first")?.click());
		expect(container.querySelector('[data-testid="expanded"]')?.textContent).toBe("");

		act(() => buttons.find((button) => button.textContent?.trim() === "Expand all")?.click());
		expect(container.querySelector('[data-testid="expanded"]')?.textContent).toBe("one,two");

		act(() => buttons.find((button) => button.textContent?.trim() === "Collapse all")?.click());
		expect(container.querySelector('[data-testid="expanded"]')?.textContent).toBe("");
	});

	it("preserves explicit state when visible keys are filtered, reordered, or added", () => {
		act(() => root.render(<DisclosureHarness identity="owner-one" keys={["one", "two"]} />));

		const collapseFirst = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent?.trim() === "Collapse first",
		);
		act(() => collapseFirst?.click());
		expect(container.querySelector('[data-testid="expanded"]')?.textContent).toBe("");

		act(() => root.render(<DisclosureHarness identity="owner-one" keys={["two"]} />));
		expect(container.querySelector('[data-testid="expanded"]')?.textContent).toBe("");

		act(() => root.render(<DisclosureHarness identity="owner-one" keys={["two", "one", "three"]} />));
		expect(container.querySelector('[data-testid="expanded"]')?.textContent).toBe("");
	});

	it("resets to the first visible key when the identity changes", () => {
		act(() => root.render(<DisclosureHarness identity="owner-one" keys={["one", "two"]} />));
		const collapseFirst = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(button) => button.textContent?.trim() === "Collapse first",
		);
		act(() => collapseFirst?.click());
		expect(container.querySelector('[data-testid="expanded"]')?.textContent).toBe("");

		act(() => root.render(<DisclosureHarness identity="owner-two" keys={["one", "two"]} />));
		expect(container.querySelector('[data-testid="expanded"]')?.textContent).toBe("one");
	});
});
