/** @vitest-environment jsdom */

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useMobileDisclosureSet } from "@/components/trade/mobile/use-mobile-disclosure-set";

function DisclosureHarness({ keys }: { keys: readonly string[] }) {
	const [identity, setIdentity] = useState("owner-one");
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
			<button type="button" onClick={() => setIdentity("owner-two")}>
				Switch owner
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
		act(() => root.render(<DisclosureHarness keys={[]} />));
		expect(container.querySelector('[data-testid="expanded"]')?.textContent).toBe("");

		act(() => root.render(<DisclosureHarness keys={["one", "two"]} />));
		expect(container.querySelector('[data-testid="expanded"]')?.textContent).toBe("one");

		const buttons = [...container.querySelectorAll<HTMLButtonElement>("button")];
		act(() => buttons.find((button) => button.textContent?.trim() === "Collapse first")?.click());
		expect(container.querySelector('[data-testid="expanded"]')?.textContent).toBe("");

		act(() => buttons.find((button) => button.textContent?.trim() === "Expand all")?.click());
		expect(container.querySelector('[data-testid="expanded"]')?.textContent).toBe("one,two");

		act(() => buttons.find((button) => button.textContent?.trim() === "Collapse all")?.click());
		expect(container.querySelector('[data-testid="expanded"]')?.textContent).toBe("");

		act(() => buttons.find((button) => button.textContent?.trim() === "Switch owner")?.click());
		expect(container.querySelector('[data-testid="expanded"]')?.textContent).toBe("one");
	});
});
