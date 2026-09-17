/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLingeringValue } from "@/hooks/use-lingering-value";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let observed: string | null = "unset";

function Probe({ value }: { value: string | null }) {
	observed = useLingeringValue(value, 250);
	return null;
}

describe("useLingeringValue", () => {
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

	it("keeps the previous value for the exit window, then clears, and switches immediately to a new value", () => {
		act(() => root.render(<Probe value="settings" />));
		expect(observed).toBe("settings");

		act(() => root.render(<Probe value={null} />));
		expect(observed).toBe("settings");

		act(() => {
			vi.advanceTimersByTime(249);
		});
		expect(observed).toBe("settings");

		act(() => {
			vi.advanceTimersByTime(1);
		});
		expect(observed).toBeNull();

		act(() => root.render(<Probe value="swap" />));
		expect(observed).toBe("swap");
		act(() => root.render(<Probe value={null} />));
		act(() => root.render(<Probe value="deposit" />));
		act(() => {
			vi.advanceTimersByTime(300);
		});
		expect(observed).toBe("deposit");
	});
});
