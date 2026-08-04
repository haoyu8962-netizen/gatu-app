/** @vitest-environment jsdom */

import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { MobileDisclosureHeader } from "@/components/trade/mobile/mobile-disclosure-header";

function Harness() {
	const [expanded, setExpanded] = useState(false);

	return (
		<MobileDisclosureHeader
			expanded={expanded}
			label={expanded ? "Collapse market details" : "Expand market details"}
			onToggle={() => setExpanded((value) => !value)}
			className="grid-cols-[1fr_16px]"
		>
			<span>Market</span>
		</MobileDisclosureHeader>
	);
}

describe("MobileDisclosureHeader", () => {
	const containers: HTMLDivElement[] = [];
	const roots: ReturnType<typeof createRoot>[] = [];

	afterEach(() => {
		for (const root of roots.splice(0)) act(() => root.unmount());
		for (const container of containers.splice(0)) container.remove();
	});

	it("exposes expansion state and preserves the 44px touch target", () => {
		const container = document.createElement("div");
		document.body.appendChild(container);
		containers.push(container);
		const root = createRoot(container);
		roots.push(root);
		act(() => root.render(<Harness />));

		const trigger = container.querySelector<HTMLButtonElement>("button");
		expect(trigger?.getAttribute("aria-label")).toBe("Expand market details");
		expect(trigger?.getAttribute("aria-expanded")).toBe("false");
		expect(trigger?.parentElement?.className).toContain("min-h-11");

		act(() => trigger?.click());

		expect(trigger?.getAttribute("aria-label")).toBe("Collapse market details");
		expect(trigger?.getAttribute("aria-expanded")).toBe("true");
		expect(container.querySelector("svg")?.className.baseVal).toContain("rotate-90");
	});
});
