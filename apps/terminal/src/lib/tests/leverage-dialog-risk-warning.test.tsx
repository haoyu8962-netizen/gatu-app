import { clearFeedback } from "./harness/order-feedback";
/** @vitest-environment jsdom */

import { act, createElement, type ReactNode, useState } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LeverageModal } from "@/components/trade/tradebox/leverage-modal";
import { MarginModeModal } from "@/components/trade/tradebox/margin-mode-modal";
import { createI18nRoot } from "./harness/react";

const WARNING = "High leverage significantly increases liquidation risk";
const CONTROL_LEFT = 0;
const CONTROL_WIDTH = 390;
const MAX_LEVERAGE = 40;

function passThrough(tag: string) {
	return ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => {
		const { showClose: _showClose, size: _size, overlayClassName: _overlay, closeLabel: _closeLabel, ...rest } = props;
		return createElement(tag, rest, children);
	};
}

vi.mock("@sairn/ui", () => ({
	AdaptiveModal: ({ children, open }: { children: ReactNode; open: boolean }) =>
		open ? createElement("section", { "data-presentation": "drawer" }, children) : null,
	Button: ({ children, iconLeft: _iconLeft, iconRight: _iconRight, ...props }: Record<string, unknown>) =>
		createElement("button", { ...props, type: "button" }, children as ReactNode),
	Modal: ({ children, open }: { children: ReactNode; open: boolean }) => (open ? children : null),
	ModalContent: passThrough("div"),
	ModalFooter: passThrough("footer"),
	ModalHeader: ({ children }: { children: ReactNode }) => createElement("header", null, children),
	ModalPopup: passThrough("section"),
	ModalTitle: ({ children }: { children: ReactNode }) => createElement("h2", null, children),
	Tabs: passThrough("div"),
	TabsContent: passThrough("div"),
	TabsList: passThrough("div"),
	TabsTrigger: passThrough("button"),
}));

vi.mock("@/components/trade/components/trading-action-button", () => ({
	TradingActionButton: ({
		children,
		containerClassName: _containerClassName,
		isActivationLocked: _isActivationLocked,
		requiresBuilderFee: _requiresBuilderFee,
		...props
	}: Record<string, unknown>) => createElement("button", { ...props, type: "button" }, children as ReactNode),
}));

vi.mock("@/lib/hyperliquid", () => ({
	useHyperliquid: () => ({ clientKey: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", env: "Mainnet" }),
}));

function clientXFor(leverage: number): number {
	return CONTROL_LEFT + ((leverage - 1) / (MAX_LEVERAGE - 1)) * CONTROL_WIDTH;
}

function pointerEvent(type: string, leverage: number): MouseEvent {
	const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: clientXFor(leverage), button: 0 });
	Object.defineProperties(event, {
		pointerId: { value: 1 },
		pointerType: { value: "mouse" },
	});
	return event;
}

interface Surface {
	name: string;
	render: (initial: number, onApply: (leverage: number) => Promise<number | null>) => ReactNode;
}

function LeverageModalHost({
	initial,
	onApply,
}: {
	initial: number;
	onApply: (leverage: number) => Promise<number | null>;
}) {
	const [pending, setPending] = useState<number | null>(null);
	return (
		<LeverageModal
			open
			onOpenChange={vi.fn()}
			currentLeverage={initial}
			pendingLeverage={pending}
			maxLeverage={MAX_LEVERAGE}
			onPendingLeverageChange={setPending}
			isUpdating={false}
			onApply={onApply}
			marketIdentity="BTC"
		/>
	);
}

function MobileLeverageDrawerHost({
	initial,
	onApply,
}: {
	initial: number;
	onApply: (leverage: number) => Promise<number | null>;
}) {
	const [pending, setPending] = useState<number | null>(null);
	return (
		<MarginModeModal
			open
			onOpenChange={vi.fn()}
			presentation="drawer"
			mobileView="leverage"
			currentMode="cross"
			currentLeverage={initial}
			pendingLeverage={pending}
			maxLeverage={MAX_LEVERAGE}
			onPendingLeverageChange={setPending}
			hasPosition={false}
			positionStateReady
			allowsCrossMargin
			allowsIsolatedMarginRemoval
			isUpdating={false}
			showLeverage
			onApply={(_mode, leverage) => onApply(leverage)}
			marketIdentity="BTC"
		/>
	);
}

const SURFACES: Surface[] = [
	{
		name: "desktop leverage dialog",
		render: (initial, onApply) => <LeverageModalHost initial={initial} onApply={onApply} />,
	},
	{
		name: "mobile leverage drawer",
		render: (initial, onApply) => <MobileLeverageDrawerHost initial={initial} onApply={onApply} />,
	},
];

describe.each(SURFACES)("high leverage warning in the $name", (surface) => {
	let container: HTMLDivElement;
	let root: Root;
	let observer: MutationObserver;
	let onApply: ReturnType<typeof vi.fn<(leverage: number) => Promise<number | null>>>;

	beforeEach(() => {
		vi.useFakeTimers();
		clearFeedback();
		vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
		vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		observer = new MutationObserver(() => undefined);
		onApply = vi.fn<(leverage: number) => Promise<number | null>>().mockImplementation(async (leverage) => leverage);
	});

	afterEach(() => {
		observer.disconnect();
		act(() => root.unmount());
		container.remove();
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	function renderSurface(initial: number) {
		act(() => root.render(surface.render(initial, onApply)));
		const control = container.querySelector<HTMLElement>("[data-trade-slider-control]");
		if (!control) throw new Error("Leverage slider control not rendered");
		Object.defineProperties(control, {
			getBoundingClientRect: {
				value: () => ({
					left: CONTROL_LEFT,
					right: CONTROL_LEFT + CONTROL_WIDTH,
					top: 0,
					bottom: 33,
					width: CONTROL_WIDTH,
					height: 33,
					x: CONTROL_LEFT,
					y: 0,
					toJSON: () => undefined,
				}),
			},
			setPointerCapture: { value: vi.fn() },
			hasPointerCapture: { value: vi.fn(() => true) },
			releasePointerCapture: { value: vi.fn() },
		});
		observer.observe(container, { childList: true, subtree: true });
		return control;
	}

	function leverageInput(): HTMLInputElement {
		const input = container.querySelector<HTMLInputElement>('input[aria-label="Leverage"]:not([type="range"])');
		if (!input) throw new Error("Leverage input not rendered");
		return input;
	}

	function findWarning(): HTMLParagraphElement | null {
		return [...container.querySelectorAll("p")].find((node) => node.textContent?.includes(WARNING)) ?? null;
	}

	function warningMutations(): { added: number; removed: number } {
		let added = 0;
		let removed = 0;
		for (const record of observer.takeRecords()) {
			for (const node of record.addedNodes) if (node.textContent?.includes(WARNING)) added += 1;
			for (const node of record.removedNodes) if (node.textContent?.includes(WARNING)) removed += 1;
		}
		return { added, removed };
	}

	function press(control: HTMLElement, leverage: number) {
		act(() => control.dispatchEvent(pointerEvent("pointerdown", leverage)));
		expect(control.dataset.dragging).toBe("true");
	}

	function moveTo(control: HTMLElement, leverage: number) {
		act(() => {
			control.dispatchEvent(pointerEvent("pointermove", leverage));
			vi.advanceTimersByTime(15);
		});
		expect(control.dataset.dragging).toBe("true");
		expect(leverageInput().value).toBe(String(leverage));
	}

	function release(control: HTMLElement, leverage: number) {
		act(() => control.dispatchEvent(pointerEvent("pointerup", leverage)));
		expect(control.dataset.dragging).toBeUndefined();
	}

	it("does not mount the warning while a drag crosses 10x upwards, then shows it on release", async () => {
		const control = renderSurface(5);
		expect(findWarning()).toBeNull();

		press(control, 5);
		for (const leverage of [9, 11, 25, 40, 12]) {
			moveTo(control, leverage);
			expect(findWarning()).toBeNull();
		}
		expect(warningMutations()).toEqual({ added: 0, removed: 0 });

		release(control, 25);
		expect(control.dataset.gestureEnd).toBe("commit");
		expect(leverageInput().value).toBe("25");
		expect(findWarning()).not.toBeNull();
		expect(warningMutations()).toEqual({ added: 1, removed: 0 });

		const confirm = [...container.querySelectorAll("button")].find((button) => button.textContent === "Confirm");
		await act(async () => confirm?.click());
		expect(onApply).toHaveBeenCalledTimes(1);
		expect(onApply).toHaveBeenCalledWith(25);
	});

	it("keeps the same warning node while a drag crosses 10x downwards, then removes it on release", () => {
		const control = renderSurface(25);
		const warning = findWarning();
		expect(warning).not.toBeNull();
		warningMutations();

		press(control, 25);
		for (const leverage of [11, 9, 1, 3]) {
			moveTo(control, leverage);
			expect(findWarning()).toBe(warning);
		}
		expect(warningMutations()).toEqual({ added: 0, removed: 0 });

		release(control, 3);
		expect(control.dataset.gestureEnd).toBe("commit");
		expect(leverageInput().value).toBe("3");
		expect(findWarning()).toBeNull();
		expect(warningMutations()).toEqual({ added: 0, removed: 1 });
	});

	it("leaves the warning as it was when a drag across 10x is cancelled", () => {
		const control = renderSurface(5);

		press(control, 5);
		moveTo(control, 30);
		expect(findWarning()).toBeNull();

		act(() => control.dispatchEvent(pointerEvent("pointercancel", 30)));
		expect(control.dataset.gestureEnd).toBe("cancel:pointer-cancel");
		expect(leverageInput().value).toBe("5");
		expect(findWarning()).toBeNull();
		expect(warningMutations()).toEqual({ added: 0, removed: 0 });
	});
});
