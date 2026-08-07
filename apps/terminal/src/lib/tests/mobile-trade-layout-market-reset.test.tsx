/** @vitest-environment jsdom */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMobilePositionsDisclosureStates } from "@/components/trade/mobile/use-mobile-disclosure-set";

const marketState = vi.hoisted(() => ({
	routeMarketName: "xyz:GOOGL" as string | undefined,
	selectedMarketName: "xyz:GOOGL",
	mountCount: 0,
}));

vi.mock("@/providers/exchange-scope", () => ({
	useExchangeScope: () => ({ routeMarketName: marketState.routeMarketName }),
}));

vi.mock("@/lib/hyperliquid", () => ({
	useSelectedMarketInfo: () => ({ data: { name: marketState.selectedMarketName } }),
}));

vi.mock("@/components/trade/mobile/mobile-trade-view", async () => {
	const React = await import("react");
	return {
		MobileTradeView: ({
			sizeMode,
			onSizeModeChange,
		}: {
			sizeMode: "base" | "quote";
			onSizeModeChange: (sizeMode: "base" | "quote") => void;
		}) => {
			const [mountId] = React.useState(() => ++marketState.mountCount);
			return (
				<>
					<input aria-label="Mobile order size" data-mount-id={mountId} />
					<button
						type="button"
						aria-label="Toggle mobile size mode"
						data-size-mode={sizeMode}
						onClick={() => onSizeModeChange(sizeMode === "base" ? "quote" : "base")}
					/>
				</>
			);
		},
	};
});

vi.mock("@/components/trade/mobile/mobile-book-view", () => ({
	MobileBookView: () => null,
}));

vi.mock("@/components/trade/mobile/mobile-chart-view", () => ({
	MobileChartView: () => null,
}));

vi.mock("@/components/trade/mobile/mobile-market-bar", () => ({
	MobileMarketBar: () => null,
}));

vi.mock("@/components/trade/mobile/mobile-balances-tab", () => ({
	MobileBalancesTab: () => <div data-mobile-balances />,
}));

vi.mock("@/components/trade/mobile/mobile-positions-view", () => ({
	MobilePositionsView: ({ balancesContent }: { balancesContent?: ReactNode }) => (
		<div data-mobile-positions>{balancesContent}</div>
	),
}));

import { MobileTradeLayout } from "@/components/trade/mobile/mobile-trade-layout";

function MobileTradeLayoutHarness({ active, showOrderForm }: { active: boolean; showOrderForm: boolean }) {
	const disclosureStates = useMobilePositionsDisclosureStates("Mainnet:0x1234");
	return <MobileTradeLayout active={active} showOrderForm={showOrderForm} disclosureStates={disclosureStates} />;
}

describe("MobileTradeLayout market identity", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		marketState.routeMarketName = "xyz:GOOGL";
		marketState.selectedMarketName = "xyz:GOOGL";
		marketState.mountCount = 0;
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	function render(active = true, showOrderForm = true) {
		act(() => {
			root.render(<MobileTradeLayoutHarness active={active} showOrderForm={showOrderForm} />);
		});
	}

	it.each([true, false])("provides spot balances to the mobile account tabs when showOrderForm=%s", (showOrderForm) => {
		render(true, showOrderForm);

		expect(container.querySelector("[data-mobile-positions]")).not.toBeNull();
		expect(container.querySelector("[data-mobile-balances]")).not.toBeNull();
	});

	it("remounts the order form when the canonical route market changes", () => {
		render();
		const initialInput = container.querySelector<HTMLInputElement>('input[aria-label="Mobile order size"]');
		expect(initialInput).not.toBeNull();
		if (!initialInput) return;
		const initialMountId = initialInput.dataset.mountId;

		render();
		const sameMarketInput = container.querySelector<HTMLInputElement>('input[aria-label="Mobile order size"]');
		expect(sameMarketInput?.dataset.mountId).toBe(initialMountId);

		const sizeModeButton = container.querySelector<HTMLButtonElement>('button[aria-label="Toggle mobile size mode"]');
		act(() => sizeModeButton?.click());
		expect(sizeModeButton?.dataset.sizeMode).toBe("base");

		marketState.routeMarketName = "xyz:NVDA";
		marketState.selectedMarketName = "xyz:NVDA";
		render(false);

		const nextMarketInput = container.querySelector<HTMLInputElement>('input[aria-label="Mobile order size"]');
		expect(nextMarketInput?.dataset.mountId).not.toBe(initialMountId);
		const nextSizeModeButton = container.querySelector<HTMLButtonElement>(
			'button[aria-label="Toggle mobile size mode"]',
		);
		expect(nextSizeModeButton?.dataset.sizeMode).toBe("base");
	});
});
