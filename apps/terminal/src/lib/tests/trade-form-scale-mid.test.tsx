/** @vitest-environment jsdom */

import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TradeFormScale } from "@/components/trade/tradebox/trade-form-scale";
import { notifyNumberFormatChange } from "@/lib/number-format-reactivity";
import { createI18nRoot } from "./harness/react";

const mocks = vi.hoisted(() => ({
	formatLocale: "en-US",
	setScaleEnd: vi.fn(),
	setScaleLevels: vi.fn(),
	setScaleSkew: vi.fn(),
	setScaleStart: vi.fn(),
}));

vi.mock("@/stores/use-global-settings-store", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/stores/use-global-settings-store")>()),
	getResolvedFormatLocale: () => mocks.formatLocale,
}));

vi.mock("@/stores/use-order-entry-store", () => ({
	useOrderEntryActions: () => mocks,
	useScaleEnd: () => "",
	useScaleLevels: () => 4,
	useScaleSkew: () => "1",
	useScaleStart: () => "",
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("TradeFormScale Mid controls", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		mocks.formatLocale = "en-US";
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		mocks.setScaleEnd.mockReset();
		mocks.setScaleLevels.mockReset();
		mocks.setScaleSkew.mockReset();
		mocks.setScaleStart.mockReset();
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("names both Mid actions with the number-format separators and fills the protocol price", () => {
		act(() =>
			root.render(<TradeFormScale midPrice="1234.56789" szDecimals={2} marketType="perp" disabled={false} desktop />),
		);
		const midButtons = () =>
			[...container.querySelectorAll<HTMLButtonElement>("button")].filter((button) => button.textContent === "Mid");
		expect(midButtons().map((button) => button.getAttribute("aria-label"))).toEqual([
			"Use mid price 1,234.6",
			"Use mid price 1,234.6",
		]);

		mocks.formatLocale = "fr-FR";
		act(() => notifyNumberFormatChange());
		expect(midButtons().map((button) => button.getAttribute("aria-label"))).toEqual([
			"Use mid price 1 234,6",
			"Use mid price 1 234,6",
		]);
		expect(container.textContent).toContain("0,01–100");
		act(() => midButtons()[0]?.click());
		expect(mocks.setScaleStart).toHaveBeenCalledExactlyOnceWith("1234.6");
	});

	it("fills both scale boundaries from the provided market reference", () => {
		act(() =>
			root.render(<TradeFormScale midPrice="101.25" szDecimals={2} marketType="perp" disabled={false} compact />),
		);

		const midButtons = [...container.querySelectorAll<HTMLButtonElement>("button")].filter(
			(button) => button.textContent?.trim() === "Mid",
		);
		expect(midButtons).toHaveLength(2);
		expect(midButtons.every((button) => button.className.includes("min-w-11"))).toBe(true);
		expect(midButtons.every((button) => button.className.includes("after:inset-0"))).toBe(true);
		expect(midButtons.every((button) => !button.className.includes("after:size-11"))).toBe(true);
		expect(midButtons.every((button) => button.className.includes("ms-1"))).toBe(true);
		expect(midButtons.every((button) => !button.className.includes("ml-1"))).toBe(true);

		act(() => midButtons[0]?.click());
		act(() => midButtons[1]?.click());

		expect(mocks.setScaleStart).toHaveBeenCalledWith("101.25");
		expect(mocks.setScaleEnd).toHaveBeenCalledWith("101.25");
	});

	it("keeps compact mobile fields readable with exactly one working mid control per boundary", () => {
		function render(disabled: boolean) {
			act(() =>
				root.render(
					<TradeFormScale midPrice="101.25" szDecimals={2} marketType="perp" disabled={disabled} compact mobileSafe />,
				),
			);
		}
		render(false);
		const inputs = [...container.querySelectorAll<HTMLInputElement>("input")];
		expect(inputs).toHaveLength(4);
		for (const input of inputs) {
			expect(input.classList.contains("h-7")).toBe(true);
			expect(input.closest(".h-8")).not.toBeNull();
			expect(input.classList.contains("max-[1000px]:text-base")).toBe(true);
			expect(input.classList.contains("max-[1000px]:leading-5")).toBe(true);
			expect(input.disabled).toBe(false);
		}
		const midButtons = [...container.querySelectorAll<HTMLButtonElement>("button")];
		expect(midButtons).toHaveLength(2);
		for (const button of midButtons) {
			expect(button.getAttribute("aria-label")).toBe("Use mid price 101.25");
			expect(button.classList.contains("text-trading-panel-success")).toBe(true);
			expect(button.disabled).toBe(false);
			act(() => button.click());
		}
		expect(mocks.setScaleStart).toHaveBeenCalledExactlyOnceWith("101.25");
		expect(mocks.setScaleEnd).toHaveBeenCalledExactlyOnceWith("101.25");
		render(true);
		for (const input of inputs) expect(input.disabled).toBe(true);
		for (const button of midButtons) {
			expect(button.disabled).toBe(true);
			act(() => button.click());
		}
		expect(mocks.setScaleStart).toHaveBeenCalledTimes(1);
		expect(mocks.setScaleEnd).toHaveBeenCalledTimes(1);
	});

	it.each(["compact", "desktop"] as const)(
		"preserves both %s Mid actions and input frames while prices are missing or invalid, then restores filling",
		(surface) => {
			function render(midPrice: string | undefined) {
				act(() =>
					root.render(
						<TradeFormScale
							midPrice={midPrice}
							szDecimals={2}
							marketType="perp"
							disabled={false}
							compact={surface === "compact"}
							desktop={surface === "desktop"}
						/>,
					),
				);
			}
			render("101.25");
			const buttons = [...container.querySelectorAll<HTMLButtonElement>("button")];
			const inputs = [...container.querySelectorAll<HTMLInputElement>("input")];
			const buttonClasses = buttons.map((button) => button.className);
			const inputClasses = inputs.map((input) => input.className);
			const frames = buttons.map((button) => button.parentElement);
			const frameClasses = frames.map((frame) => frame?.className);
			expect(buttons).toHaveLength(2);

			for (const invalidPrice of [undefined, "0", "-1", "invalid"]) {
				render(invalidPrice);
				expect([...container.querySelectorAll("button")]).toEqual(buttons);
				expect([...container.querySelectorAll("input")]).toEqual(inputs);
				expect(buttons.map((button) => button.className)).toEqual(buttonClasses);
				expect(inputs.map((input) => input.className)).toEqual(inputClasses);
				expect(buttons.map((button) => button.parentElement)).toEqual(frames);
				expect(frames.map((frame) => frame?.className)).toEqual(frameClasses);
				for (const button of buttons) {
					expect(button.disabled).toBe(true);
					expect(button.textContent).toBe("Mid");
					expect(button.getAttribute("aria-label")).toBe("Use mid price");
					act(() => button.click());
				}
				expect(mocks.setScaleStart).not.toHaveBeenCalled();
				expect(mocks.setScaleEnd).not.toHaveBeenCalled();
			}

			render("102.5");
			expect([...container.querySelectorAll("button")]).toEqual(buttons);
			for (const button of buttons) {
				expect(button.disabled).toBe(false);
				expect(button.getAttribute("aria-label")).toBe("Use mid price 102.50");
				act(() => button.click());
			}
			expect(mocks.setScaleStart).toHaveBeenCalledExactlyOnceWith("102.50");
			expect(mocks.setScaleEnd).toHaveBeenCalledExactlyOnceWith("102.50");
		},
	);
});
