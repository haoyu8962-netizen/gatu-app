/** @vitest-environment jsdom */

import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TradeFormTwap } from "@/components/trade/tradebox/trade-form-twap";
import { useOrderEntryActions, useTwapMinutes } from "@/stores/use-order-entry-store";
import { createI18nRoot } from "./harness/react";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function changeInput(input: HTMLInputElement, value: string) {
	const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
	setter?.call(input, value);
	input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe.each(["desktop", "compact"] as const)("TWAP duration on %s", (surface) => {
	let container: HTMLDivElement;
	let root: Root;
	let actions: ReturnType<typeof useOrderEntryActions>;
	let duration: number;

	function Form() {
		actions = useOrderEntryActions();
		duration = useTwapMinutes();
		return (
			<TradeFormTwap
				disabled={false}
				side="buy"
				quoteToken="USDC"
				markPx={100}
				assetId={0}
				szDecimals={2}
				desktop={surface === "desktop"}
				compact={surface === "compact"}
				mobileSafe={surface === "compact"}
			/>
		);
	}

	function input(label: string) {
		const element = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
		if (!element) throw new Error(`Missing TWAP ${label} input`);
		return element;
	}

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		act(() => root.render(<Form />));
		act(() => actions.resetForm());
	});

	afterEach(() => {
		act(() => actions.resetForm());
		act(() => root.unmount());
		container.remove();
	});

	it("keeps the thirty-minute default as an actual value", () => {
		expect(input("Hour(s)").value).toBe("0");
		expect(input("Minute(s)").value).toBe("30");
		expect(input("Minute(s)").placeholder).toBe("0");
		expect(duration).toBe(30);
	});

	it.each([
		{ total: 60, hours: "1", minutes: "0" },
		{ total: 0, hours: "0", minutes: "0" },
	])("displays every zero component of $total minutes explicitly", ({ total, hours, minutes }) => {
		act(() => actions.setTwapMinutes(total));
		expect(input("Hour(s)").value).toBe(hours);
		expect(input("Minute(s)").value).toBe(minutes);
		expect(duration).toBe(total);
	});

	it("shows a disabled zero-minute field at seven days and restores editing below the limit", () => {
		act(() => changeInput(input("Hour(s)"), "168"));
		expect(input("Hour(s)").value).toBe("168");
		expect(input("Minute(s)").value).toBe("0");
		expect(input("Minute(s)").disabled).toBe(true);
		expect(input("Minute(s)").readOnly).toBe(true);
		expect(duration).toBe(10_080);
		act(() => changeInput(input("Hour(s)"), "167"));
		expect(input("Minute(s)").disabled).toBe(false);
		expect(input("Minute(s)").readOnly).toBe(false);
		act(() => changeInput(input("Minute(s)"), "59"));
		expect(duration).toBe(10_079);
	});

	it("clears and replaces minutes without restoring the default or changing the hour", () => {
		act(() => actions.setTwapMinutes(90));
		act(() => changeInput(input("Minute(s)"), ""));
		expect(input("Hour(s)").value).toBe("1");
		expect(input("Minute(s)").value).toBe("0");
		expect(duration).toBe(60);
		act(() => changeInput(input("Minute(s)"), "5"));
		expect(input("Minute(s)").value).toBe("5");
		expect(duration).toBe(65);
		act(() => changeInput(input("Hour(s)"), ""));
		expect(input("Hour(s)").value).toBe("0");
		expect(duration).toBe(5);
	});

	it("retains integer-only inputs and caps each duration component", () => {
		act(() => changeInput(input("Minute(s)"), "1.5"));
		expect(input("Minute(s)").value).toBe("30");
		expect(duration).toBe(30);
		act(() => changeInput(input("Minute(s)"), "99"));
		expect(input("Minute(s)").value).toBe("59");
		expect(duration).toBe(59);
		act(() => changeInput(input("Hour(s)"), "999"));
		expect(input("Hour(s)").value).toBe("168");
		expect(input("Minute(s)").value).toBe("0");
		expect(duration).toBe(10_080);
	});
});
