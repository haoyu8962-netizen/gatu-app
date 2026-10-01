// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StatusScreen } from "@/components/trade/tradebox/deposit/shared-ui";
import { createI18nRoot } from "./harness/react";

describe("deposit StatusScreen semantics", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		vi.stubGlobal("matchMedia", () => ({
			addEventListener: vi.fn(),
			matches: false,
			removeEventListener: vi.fn(),
		}));
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.unstubAllGlobals();
	});

	it("accepts block descriptions while keeping actions outside the live region", () => {
		act(() => {
			root.render(
				createElement(
					StatusScreen,
					{
						description: createElement(
							"div",
							{ "data-testid": "block-description" },
							createElement("div", null, "Amount: 10 USDC"),
						),
						heading: "Deposit submitted",
						icon: "success",
						onClose: () => {},
						open: true,
						title: "Deposit",
					},
					createElement("button", { type: "button" }, "Done"),
				),
			);
		});

		const liveRegion = document.body.querySelector<HTMLElement>('[role="status"]');
		const description = document.body.querySelector<HTMLElement>('[data-testid="block-description"]');
		const action = [...document.body.querySelectorAll("button")].find((button) => button.textContent === "Done");
		expect(liveRegion?.getAttribute("aria-atomic")).toBe("true");
		expect(description?.parentElement?.tagName).toBe("DIV");
		expect(liveRegion?.contains(description ?? null)).toBe(true);
		expect(liveRegion?.contains(action ?? null)).toBe(false);
		expect(liveRegion?.querySelector("svg[data-brand-motion]")?.getAttribute("data-brand-motion")).toBe("success");
	});

	it.each([
		["wallet", "wallet-awaiting", "status", true],
		["awaiting", "awaiting-result", "status", true],
		["error", "error", "alert", false],
	] as const)("draws the %s screen with the %s motion", (icon, motion, role, loading) => {
		act(() => {
			root.render(
				createElement(StatusScreen, { heading: "Deposit", icon, onClose: () => {}, open: true, title: "Deposit" }),
			);
		});

		const svg = document.body.querySelector(`[role="${role}"] svg[data-brand-motion]`);
		expect(svg?.getAttribute("data-brand-motion")).toBe(motion);
		expect(svg?.getAttribute("width")).toBe("64");
		expect(svg?.hasAttribute("data-loading-indicator")).toBe(loading);
		expect(document.body.querySelector(".animate-spin, .animate-ping")).toBeNull();
	});
});
