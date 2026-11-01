/** @vitest-environment jsdom */

import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useOrderDisplayLabels } from "@/hooks/trade/use-order-display-labels";
import { createI18nRoot } from "./harness/react";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let labels: ReturnType<typeof useOrderDisplayLabels> | null = null;

function Probe() {
	labels = useOrderDisplayLabels();
	return null;
}

describe("order type labels", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		act(() => root.render(<Probe />));
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		labels = null;
	});

	it("names the official terminal's trailing stop and shows any other new type as the exchange sends it", () => {
		expect(labels?.getOrderTypeLabel("Trailing Stop Market")).toBe("Trailing Stop");
		expect(labels?.getOrderTypeLabel("Brand New Type")).toBe("Brand New Type");
		expect(labels?.getOrderTypeLabel("Stop Market")).toBe("Stop Market");
		expect(labels?.getOrderTypeLabel("")).toBe("-");
	});
});
