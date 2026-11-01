// @vitest-environment jsdom
import { Dropdown } from "@sairn/ui";
import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { OrderbookGroupingTriggerView } from "@/components/trade/orderbook/orderbook-grouping-trigger-view";
import { OrderbookPanelView } from "@/components/trade/orderbook/orderbook-panel-view";

const dropdownProps = { triggerVariant: "minimal" as const, triggerAriaLabel: "Price grouping", size: "xxs" as const };
it("preserves native refs and Dropdown keyboard selection", async () => {
	const host = document.createElement("div");
	document.body.appendChild(host);
	const root = createRoot(host);
	const ref = createRef<HTMLButtonElement>();
	const selected = vi.fn();
	try {
		await act(async () =>
			root.render(
				<Dropdown
					{...dropdownProps}
					renderTrigger={<OrderbookGroupingTriggerView ref={ref} label="0.01" />}
					items={[{ label: "0.1", onSelect: selected }]}
				/>,
			),
		);
		expect(ref.current?.getAttribute("aria-label")).toBe("Price grouping");
		await act(async () =>
			ref.current?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })),
		);
		expect(ref.current?.getAttribute("aria-expanded")).toBe("true");
		await act(async () => document.querySelector<HTMLButtonElement>('[role="menuitem"]')?.click());
		expect(selected).toHaveBeenCalledOnce();
		expect(host.querySelector("button button")).toBeNull();
	} finally {
		await act(async () => root.unmount());
		host.remove();
	}
});

it("forwards ladder ref, both side styles and row slots without owning them", () => {
	const host = document.createElement("div");
	const root = createRoot(host);
	const ladderRef = createRef<HTMLDivElement>();
	Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
	act(() =>
		root.render(
			<OrderbookPanelView
				labels={{ price: "Price", size: "Size", total: "Total", spread: "Spread" }}
				grouping={null}
				unit={null}
				assetLabel="BTC"
				spreadText="—"
				ladderRef={ladderRef}
				sideStyle={{ visibility: "hidden" }}
				asks={<span>ask slot</span>}
				bids={<span>bid slot</span>}
			/>,
		),
	);
	expect(ladderRef.current?.children).toHaveLength(3);
	for (const side of ["ask", "bid"]) {
		const node = host.querySelector<HTMLElement>(`[data-orderbook-side-container="${side}"]`);
		expect(node?.style.visibility).toBe("hidden");
		expect(node?.textContent).toBe(`${side} slot`);
	}
	act(() => root.unmount());
});
