// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TradingActionButton } from "@/components/trade/components/trading-action-button";

const testState = vi.hoisted(() => ({
	enableTrading: vi.fn(),
	error: null as Error | null,
	guardAction: vi.fn(),
	guardOptions: [] as Array<{ requiresBuilderFee?: boolean }>,
	isEnabling: false,
	isReady: false,
	needsOwnerApproval: false,
	needsTrading: true,
}));

vi.mock("@/lib/hyperliquid", () => ({
	useTradingGuard: (options: { requiresBuilderFee?: boolean }) => {
		testState.guardOptions.push(options);
		return {
			isReady: testState.isReady,
			isEnabling: testState.isEnabling,
			needsTrading: testState.needsTrading,
			needsOwnerApproval: testState.needsOwnerApproval,
			enableTrading: testState.enableTrading,
			guardAction: testState.guardAction,
			error: testState.error,
		};
	},
}));

describe("TradingActionButton", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		container = document.createElement("div");
		document.body.appendChild(container);
		const reactRoot = createRoot(container);
		root = {
			render: (children) => reactRoot.render(<I18nProvider i18n={i18n}>{children}</I18nProvider>),
			unmount: () => reactRoot.unmount(),
		} as Root;
		testState.error = null;
		testState.enableTrading.mockReset();
		testState.guardAction.mockReset();
		testState.guardOptions.length = 0;
		testState.isEnabling = false;
		testState.isReady = false;
		testState.needsTrading = true;
		testState.needsOwnerApproval = false;
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.useRealTimers();
	});

	it("shows the mono button indicator while the trading signer is being enabled", () => {
		testState.isEnabling = true;

		act(() => {
			root.render(<TradingActionButton onClick={vi.fn()}>Swap</TradingActionButton>);
		});

		const button = container.querySelector("button");
		const indicator = button?.querySelector('svg[data-brand-motion="button-loading"]');
		expect(button?.textContent).toBe("Enabling");
		expect(indicator?.getAttribute("data-appearance")).toBe("mono");
		expect(indicator?.getAttribute("aria-hidden")).toBe("true");
		expect(button?.querySelector(".animate-spin")).toBeNull();
	});

	it("surfaces trading enablement errors next to the action", () => {
		testState.error = new Error("Selected wallet does not match the connected account.");

		act(() => {
			root.render(<TradingActionButton onClick={vi.fn()}>Swap</TradingActionButton>);
		});

		const alert = container.querySelector('[role="alert"]');
		expect(alert?.textContent).toContain("Selected wallet does not match");
		expect(testState.guardOptions.at(-1)).toEqual({ requiresBuilderFee: true });
	});

	it("stays disabled with the desktop-required reason when an Agent-only session lacks an approval", () => {
		testState.needsTrading = false;
		testState.needsOwnerApproval = true;
		const onClick = vi.fn();

		act(() => {
			root.render(<TradingActionButton onClick={onClick}>Market Close</TradingActionButton>);
		});

		const button = container.querySelector("button");
		expect(button?.textContent).toBe("Market Close");
		expect(button?.hasAttribute("disabled")).toBe(true);
		expect(container.querySelector("output")?.textContent).toContain("Finish trading authorization on desktop first");
		act(() => button?.click());
		expect(testState.enableTrading).not.toHaveBeenCalled();
		expect(testState.guardAction).not.toHaveBeenCalled();
	});

	it("can guard an Agent-only action without requiring builder fee approval", () => {
		act(() => {
			root.render(
				<TradingActionButton onClick={vi.fn()} requiresBuilderFee={false}>
					Update leverage
				</TradingActionButton>,
			);
		});

		expect(testState.guardOptions.at(-1)).toEqual({ requiresBuilderFee: false });
	});

	it("requires a second explicit action after enabling when requested", () => {
		const onClick = vi.fn();
		act(() => {
			root.render(
				<TradingActionButton onClick={onClick} requireReadyConfirmation>
					Market Close
				</TradingActionButton>,
			);
		});

		const button = container.querySelector("button");
		if (!(button instanceof HTMLButtonElement)) throw new Error("Trading action button not found");
		act(() => button.click());
		expect(testState.enableTrading).toHaveBeenCalledOnce();
		expect(testState.guardAction).not.toHaveBeenCalled();
		expect(onClick).not.toHaveBeenCalled();

		testState.isReady = true;
		testState.needsTrading = false;
		act(() => {
			root.render(
				<TradingActionButton onClick={onClick} requireReadyConfirmation>
					Market Close
				</TradingActionButton>,
			);
		});
		act(() => button.click());
		expect(testState.guardAction).toHaveBeenCalledWith(onClick);
	});

	it.each([
		["the enable step before readiness", false],
		["the guarded action once ready", true],
	])("ignores an activation of %s while the caller reports a lock", (_label, isReady) => {
		testState.isReady = isReady;
		testState.needsTrading = !isReady;
		let locked = true;
		const onClick = vi.fn();
		act(() => {
			root.render(
				<TradingActionButton onClick={onClick} requireReadyConfirmation isActivationLocked={() => locked}>
					Market Close
				</TradingActionButton>,
			);
		});
		const button = container.querySelector("button");
		expect(button?.disabled).toBe(false);

		act(() => button?.click());
		expect(testState.enableTrading).not.toHaveBeenCalled();
		expect(testState.guardAction).not.toHaveBeenCalled();

		locked = false;
		act(() => button?.click());
		expect(testState.enableTrading).toHaveBeenCalledTimes(isReady ? 0 : 1);
		expect(testState.guardAction).toHaveBeenCalledTimes(isReady ? 1 : 0);
		if (isReady) expect(testState.guardAction).toHaveBeenCalledWith(onClick);
	});

	it("keeps ordinary click behavior until an optional hold is armed", () => {
		const onClick = vi.fn();
		act(() => {
			root.render(
				<TradingActionButton onClick={onClick} requireReadyConfirmation holdDurationMs={800}>
					Market Close
				</TradingActionButton>,
			);
		});

		const button = getButton(container);
		act(() => button.click());
		expect(testState.enableTrading).toHaveBeenCalledOnce();
		expect(testState.guardAction).not.toHaveBeenCalled();

		testState.isReady = true;
		testState.needsTrading = false;
		act(() => {
			root.render(
				<TradingActionButton onClick={onClick} requireReadyConfirmation holdDurationMs={800}>
					Market Close
				</TradingActionButton>,
			);
		});
		act(() => button.click());
		expect(testState.guardAction).not.toHaveBeenCalled();
	});

	it("keeps the guard-owned ordinary click path before readiness without explicit enable confirmation", () => {
		const onClick = vi.fn();
		act(() => {
			root.render(
				<TradingActionButton onClick={onClick} holdDurationMs={800}>
					Market Close
				</TradingActionButton>,
			);
		});

		act(() => getButton(container).click());
		expect(testState.guardAction).toHaveBeenCalledOnce();
		expect(testState.guardAction).toHaveBeenCalledWith(onClick);
	});

	it("completes one guarded pointer hold and suppresses its synthesized click", () => {
		vi.useFakeTimers();
		testState.isReady = true;
		testState.needsTrading = false;
		const onClick = vi.fn();
		act(() => {
			root.render(
				<TradingActionButton onClick={onClick} holdDurationMs={800} holdProgressClassName="test-hold-progress">
					Market Close
				</TradingActionButton>,
			);
		});

		const button = getButton(container);
		const progress = getProgress(container);
		expect(progress.className).toContain("test-hold-progress");
		expect(progress.getAttribute("aria-hidden")).toBe("true");
		expect(progress.style.width).toBe("0%");

		dispatchPointer(button, "pointerdown");
		expect(button.getAttribute("data-holding")).toBe("true");
		expect(button.textContent).toBe("Market Close");
		act(() => vi.advanceTimersByTime(400));
		expect(Number.parseFloat(progress.style.width)).toBeGreaterThan(40);
		expect(Number.parseFloat(progress.style.width)).toBeLessThan(60);
		expect(testState.guardAction).not.toHaveBeenCalled();

		act(() => vi.advanceTimersByTime(400));
		expect(testState.guardAction).toHaveBeenCalledOnce();
		expect(testState.guardAction).toHaveBeenCalledWith(onClick);
		expect(button.hasAttribute("data-holding")).toBe(false);

		dispatchPointer(button, "pointerup");
		act(() => button.click());
		expect(testState.guardAction).toHaveBeenCalledOnce();
		expect(progress.style.width).toBe("0%");
	});

	it("ignores non-primary pointer presses", () => {
		vi.useFakeTimers();
		testState.isReady = true;
		testState.needsTrading = false;
		act(() => {
			root.render(
				<TradingActionButton onClick={vi.fn()} holdDurationMs={800}>
					Market Close
				</TradingActionButton>,
			);
		});

		const button = getButton(container);
		act(() => {
			button.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 2, cancelable: true }));
			vi.advanceTimersByTime(1_000);
		});

		expect(testState.guardAction).not.toHaveBeenCalled();
		expect(button.hasAttribute("data-holding")).toBe(false);
		expect(getProgress(container).style.width).toBe("0%");
	});

	it("cancels a captured touch hold when the pointer moves outside the button", () => {
		vi.useFakeTimers();
		testState.isReady = true;
		testState.needsTrading = false;
		const onClick = vi.fn();
		act(() => {
			root.render(
				<TradingActionButton onClick={onClick} holdDurationMs={800}>
					Market Close
				</TradingActionButton>,
			);
		});

		const button = getButton(container);
		vi.spyOn(button, "getBoundingClientRect").mockReturnValue({
			bottom: 144,
			height: 44,
			left: 20,
			right: 220,
			top: 100,
			width: 200,
			x: 20,
			y: 100,
			toJSON: () => ({}),
		});
		dispatchPointerAt(button, "pointerdown", 80, 120);
		act(() => vi.advanceTimersByTime(300));
		dispatchPointerAt(button, "pointermove", 230, 120);
		act(() => vi.advanceTimersByTime(800));

		expect(onClick).not.toHaveBeenCalled();
		expect(testState.guardAction).not.toHaveBeenCalled();
		expect(button.hasAttribute("data-holding")).toBe(false);
		expect(getProgress(container).style.width).toBe("0%");
	});

	it.each(["Enter", " "])("supports a %j keyboard hold without duplicate click activation", (key) => {
		vi.useFakeTimers();
		testState.isReady = true;
		testState.needsTrading = false;
		const onClick = vi.fn();
		act(() => {
			root.render(
				<TradingActionButton onClick={onClick} holdDurationMs={800}>
					Market Close
				</TradingActionButton>,
			);
		});

		const button = getButton(container);
		dispatchKey(button, "keydown", key);
		act(() => vi.advanceTimersByTime(800));
		expect(testState.guardAction).toHaveBeenCalledOnce();
		dispatchKey(button, "keydown", key, true);
		act(() => vi.advanceTimersByTime(800));
		expect(testState.guardAction).toHaveBeenCalledOnce();

		dispatchKey(button, "keyup", key);
		act(() => button.click());
		expect(testState.guardAction).toHaveBeenCalledOnce();
	});

	it.each(["pointerup", "pointercancel", "blur", "visibilitychange", "Escape"])(
		"cancels an incomplete hold on %s",
		(interruption) => {
			vi.useFakeTimers();
			testState.isReady = true;
			testState.needsTrading = false;
			act(() => {
				root.render(
					<TradingActionButton onClick={vi.fn()} holdDurationMs={800}>
						Market Close
					</TradingActionButton>,
				);
			});

			const button = getButton(container);
			const progress = getProgress(container);
			dispatchPointer(button, "pointerdown");
			act(() => vi.advanceTimersByTime(300));
			expect(Number.parseFloat(progress.style.width)).toBeGreaterThan(0);

			act(() => {
				if (interruption === "pointerup" || interruption === "pointercancel") {
					button.dispatchEvent(new MouseEvent(interruption, { bubbles: true, cancelable: true }));
				} else if (interruption === "blur") {
					window.dispatchEvent(new Event("blur"));
				} else if (interruption === "visibilitychange") {
					Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
					document.dispatchEvent(new Event("visibilitychange"));
					Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
				} else {
					window.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
				}
			});
			act(() => vi.advanceTimersByTime(1_000));

			expect(testState.guardAction).not.toHaveBeenCalled();
			expect(button.hasAttribute("data-holding")).toBe(false);
			expect(progress.style.width).toBe("0%");
		},
	);
});

function getButton(container: HTMLElement): HTMLButtonElement {
	const button = container.querySelector("button");
	if (!(button instanceof HTMLButtonElement)) throw new Error("Trading action button not found");
	return button;
}

function getProgress(container: HTMLElement): HTMLSpanElement {
	const progress = container.querySelector('[data-slot="hold-progress"]');
	if (!(progress instanceof HTMLSpanElement)) throw new Error("Hold progress not found");
	return progress;
}

function dispatchPointer(button: HTMLButtonElement, type: "pointerdown" | "pointerup"): void {
	act(() => {
		button.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0, cancelable: true }));
	});
}

function dispatchPointerAt(
	button: HTMLButtonElement,
	type: "pointerdown" | "pointermove",
	clientX: number,
	clientY: number,
): void {
	act(() => {
		const event = new MouseEvent(type, { bubbles: true, button: 0, cancelable: true, clientX, clientY });
		Object.defineProperties(event, {
			isPrimary: { value: true },
			pointerId: { value: 7 },
			pointerType: { value: "touch" },
		});
		button.dispatchEvent(event);
	});
}

function dispatchKey(button: HTMLButtonElement, type: "keydown" | "keyup", key: string, repeat = false): void {
	act(() => {
		button.dispatchEvent(new KeyboardEvent(type, { bubbles: true, cancelable: true, key, repeat }));
	});
}
