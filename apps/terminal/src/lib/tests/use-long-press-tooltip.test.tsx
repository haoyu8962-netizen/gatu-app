// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLongPressTooltip } from "@/hooks/ui/use-long-press-tooltip";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function createPointerEvent(
	type: string,
	options: { clientX: number; clientY?: number; pointerId?: number; pointerType?: string },
): MouseEvent {
	const event = new MouseEvent(type, {
		bubbles: true,
		button: 0,
		clientX: options.clientX,
		clientY: options.clientY ?? 0,
	});
	Object.defineProperties(event, {
		isPrimary: { value: true },
		pointerId: { value: options.pointerId ?? 1 },
		pointerType: { value: options.pointerType ?? "touch" },
	});
	return event;
}

function Harness({ onSelect }: { onSelect: () => void }) {
	const tooltip = useLongPressTooltip({ enabled: true });
	return (
		<>
			<button
				type="button"
				{...tooltip.handlers}
				onClick={() => {
					if (!tooltip.consumeLongPressClick()) onSelect();
				}}
			>
				Level
			</button>
			<output>{tooltip.open ? "open" : "closed"}</output>
		</>
	);
}

describe("useLongPressTooltip", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		vi.useFakeTimers();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.useRealTimers();
	});

	it("opens after a stationary touch hold and consumes only its synthetic click", () => {
		const onSelect = vi.fn();
		act(() => root.render(<Harness onSelect={onSelect} />));
		const button = container.querySelector("button");
		if (!(button instanceof HTMLButtonElement)) throw new Error("Missing trigger");

		act(() => {
			button.dispatchEvent(createPointerEvent("pointerdown", { clientX: 12, clientY: 8 }));
			vi.advanceTimersByTime(449);
		});
		expect(container.querySelector("output")?.textContent).toBe("closed");

		act(() => vi.advanceTimersByTime(1));
		expect(container.querySelector("output")?.textContent).toBe("open");

		act(() => {
			button.dispatchEvent(createPointerEvent("pointerup", { clientX: 12, clientY: 8 }));
			button.click();
		});
		expect(onSelect).not.toHaveBeenCalled();

		act(() => button.click());
		expect(onSelect).toHaveBeenCalledOnce();
	});

	it("cancels when touch movement exceeds the scroll tolerance", () => {
		const onSelect = vi.fn();
		act(() => root.render(<Harness onSelect={onSelect} />));
		const button = container.querySelector("button");
		if (!(button instanceof HTMLButtonElement)) throw new Error("Missing trigger");

		act(() => {
			button.dispatchEvent(createPointerEvent("pointerdown", { clientX: 12, clientY: 8 }));
			button.dispatchEvent(createPointerEvent("pointermove", { clientX: 21, clientY: 8 }));
			vi.advanceTimersByTime(500);
			button.dispatchEvent(createPointerEvent("pointerup", { clientX: 21, clientY: 8 }));
			button.click();
		});

		expect(container.querySelector("output")?.textContent).toBe("closed");
		expect(onSelect).toHaveBeenCalledOnce();
	});

	it("leaves mouse clicks immediate", () => {
		const onSelect = vi.fn();
		act(() => root.render(<Harness onSelect={onSelect} />));
		const button = container.querySelector("button");
		if (!(button instanceof HTMLButtonElement)) throw new Error("Missing trigger");

		act(() => {
			button.dispatchEvent(createPointerEvent("pointerdown", { clientX: 12, pointerType: "mouse" }));
			vi.advanceTimersByTime(500);
			button.click();
		});

		expect(container.querySelector("output")?.textContent).toBe("closed");
		expect(onSelect).toHaveBeenCalledOnce();
	});
});
