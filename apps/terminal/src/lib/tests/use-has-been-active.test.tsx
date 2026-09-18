/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useHasBeenActive } from "@/hooks/ui/use-has-been-active";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function Probe({ active }: { active: boolean }) {
	return <output>{String(useHasBeenActive(active))}</output>;
}

describe("useHasBeenActive", () => {
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

	it("stays false until the first activation and true afterwards", () => {
		act(() => root.render(<Probe active={false} />));
		expect(container.textContent).toBe("false");

		act(() => root.render(<Probe active />));
		expect(container.textContent).toBe("true");

		act(() => root.render(<Probe active={false} />));
		expect(container.textContent).toBe("true");
	});
});
