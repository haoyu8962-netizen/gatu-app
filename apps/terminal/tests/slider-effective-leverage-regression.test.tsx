/** @vitest-environment jsdom */

import { type ReactNode, act, createElement, useState } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createI18nRoot } from "@/lib/tests/harness/react";

const leverageHarness = vi.hoisted(() => ({
	sliderProps: null as Record<string, unknown> | null,
}));

vi.mock("@gatu/ui", () => ({
	AdaptiveModal: ({ children, open }: { children: ReactNode; open: boolean }) =>
		open ? createElement("section", null, children) : null,
	Button: ({
		children,
		iconLeft: _iconLeft,
		iconRight: _iconRight,
		intent: _intent,
		size: _size,
		variant: _variant,
		...props
	}: Record<string, unknown>) => createElement("button", { ...props, type: "button" }, children as ReactNode),
	Modal: ({ children, open }: { children: ReactNode; open: boolean }) => (open ? children : null),
	ModalContent: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) =>
		createElement("div", props, children),
	ModalFooter: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) =>
		createElement("footer", props, children),
	ModalHeader: ({
		children,
		divider: _divider,
		...props
	}: { children: ReactNode; divider?: boolean } & Record<string, unknown>) =>
		createElement("header", props, children),
	ModalPopup: ({ children }: { children: ReactNode }) => createElement("section", null, children),
	ModalTitle: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) =>
		createElement("h2", props, children),
	Tabs: ({ children }: { children: ReactNode }) => createElement("div", null, children),
	TabsContent: ({ children }: { children: ReactNode }) => createElement("div", null, children),
	TabsList: ({ children }: { children: ReactNode }) => createElement("div", null, children),
	TabsTrigger: ({ children }: { children: ReactNode }) => createElement("button", { type: "button" }, children),
}));

vi.mock("@/components/trade/components/trading-action-button", () => ({
	TradingActionButton: ({
		children,
		containerClassName: _containerClassName,
		requiresBuilderFee: _requiresBuilderFee,
		...props
	}: Record<string, unknown>) => createElement("button", { ...props, type: "button" }, children as ReactNode),
}));

vi.mock("@/components/trade/tradebox/leverage-slider", () => ({
	LeverageSlider: (props: Record<string, unknown>) => {
		leverageHarness.sliderProps = props;
		return createElement("div", { "data-testid": "leverage-slider" });
	},
}));

import { LeverageModal } from "@/components/trade/tradebox/leverage-modal";
import { MarginModeModal } from "@/components/trade/tradebox/margin-mode-modal";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function getButton(container: HTMLElement, label: string): HTMLButtonElement {
	const button = [...container.querySelectorAll("button")].find((candidate) => candidate.textContent?.includes(label));
	if (!(button instanceof HTMLButtonElement)) throw new Error(`${label} button not found`);
	return button;
}

function setNativeInputValue(input: HTMLInputElement, value: string) {
	const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
	setter?.call(input, value);
	input.dispatchEvent(new Event("input", { bubbles: true }));
}

function DesktopCommittedValueHarness({ maxLeverage }: { maxLeverage: number }) {
	const [pendingLeverage, setPendingLeverage] = useState<number | null>(null);
	const [storeLeverage, setStoreLeverage] = useState(3);
	const [committedLeverage, setCommittedLeverage] = useState<number | null>(null);

	async function applyLeverage(requestedLeverage: number): Promise<void> {
		const committed = Math.max(1, Math.min(Math.round(requestedLeverage), maxLeverage));
		setStoreLeverage(committed);
		setPendingLeverage(committed);
		setCommittedLeverage(committed);
	}

	return (
		<>
			<output data-testid="pending-leverage">{pendingLeverage ?? "none"}</output>
			<output data-testid="store-leverage">{storeLeverage}</output>
			<LeverageModal
				open
				onOpenChange={() => {}}
				currentLeverage={storeLeverage}
				pendingLeverage={pendingLeverage}
				committedLeverage={committedLeverage}
				maxLeverage={maxLeverage}
				onPendingLeverageChange={setPendingLeverage}
				isUpdating={false}
				updateError={null}
				onApply={applyLeverage}
				marketIdentity="HYPE"
			/>
		</>
	);
}

function MobileCapabilityHarness({ maxLeverage, showLeverage }: { maxLeverage: number; showLeverage: boolean }) {
	const [pendingLeverage, setPendingLeverage] = useState<number | null>(null);

	return (
		<MarginModeModal
			open
			onOpenChange={() => {}}
			currentMode="cross"
			currentLeverage={10}
			pendingLeverage={pendingLeverage}
			committedLeverage={null}
			maxLeverage={maxLeverage}
			onPendingLeverageChange={setPendingLeverage}
			hasPosition={false}
			positionStateReady
			allowsCrossMargin
			allowsIsolatedMarginRemoval
			isUpdating={false}
			updateError={null}
			showLeverage={showLeverage}
			onApply={async () => {}}
			presentation="drawer"
			mobileView="leverage"
			marketIdentity="HYPE"
		/>
	);
}

describe("slider effective leverage contracts", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		leverageHarness.sliderProps = null;
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("A1 makes input, pending, success, and effective store use the leverage committed under the latest max", async () => {
		act(() => root.render(<DesktopCommittedValueHarness maxLeverage={20} />));
		const input = container.querySelector<HTMLInputElement>('input[aria-label="Leverage"]');
		if (!input) throw new Error("Leverage input not found");

		act(() => setNativeInputValue(input, "15"));
		expect(input.value).toBe("15");

		act(() => root.render(<DesktopCommittedValueHarness maxLeverage={10} />));
		await act(async () => getButton(container, "Confirm").click());

		const canonicalInput = container.querySelector<HTMLInputElement>('input[aria-label="Leverage"]');
		const successButton = getButton(container, "Updated");
		expect.soft(canonicalInput?.value).toBe("10");
		expect.soft(container.querySelector('[data-testid="pending-leverage"]')?.textContent).toBe("10");
		expect.soft(container.querySelector('[data-testid="store-leverage"]')?.textContent).toBe("10");
		expect.soft(leverageHarness.sliderProps?.value).toBe(10);
		expect.soft(successButton.textContent).toContain("10x");
	});

	it("A1 discards a mobile drag draft when leverage capability unmounts and later remounts", () => {
		act(() => root.render(<MobileCapabilityHarness maxLeverage={20} showLeverage />));
		const onDrag = leverageHarness.sliderProps?.onChange as ((value: number) => void) | undefined;
		act(() => onDrag?.(15));
		expect(container.querySelector<HTMLInputElement>('input[aria-label="Leverage"]')?.value).toBe("15");

		act(() => root.render(<MobileCapabilityHarness maxLeverage={1} showLeverage={false} />));
		expect.soft(container.querySelector('[data-testid="leverage-slider"]')).toBeNull();
		expect.soft(container.textContent).toContain("Leverage is fixed at 10× for this market.");

		act(() => root.render(<MobileCapabilityHarness maxLeverage={10} showLeverage />));
		expect.soft(container.querySelector<HTMLInputElement>('input[aria-label="Leverage"]')?.value).toBe("10");
		expect.soft(leverageHarness.sliderProps?.value).toBe(10);
	});
});
