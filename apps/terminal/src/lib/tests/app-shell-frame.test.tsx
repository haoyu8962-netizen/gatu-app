/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppShellSkeleton } from "@/components/trade/layout/app-shell-skeleton";

describe("AppShellSkeleton desktop frame", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		act(() => root.render(<AppShellSkeleton />));
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("draws the terminal chrome the real page replaces, with placeholders instead of data", () => {
		const desktop = container.querySelector("[data-shell-desktop]");
		const text = desktop?.textContent ?? "";
		for (const label of [
			"Trade",
			"Portfolio",
			"Connect Wallet",
			"Mark",
			"24h Volume",
			"Order Book",
			"Trades",
			"Spread",
			"Market",
			"Limit",
			"Long",
			"Short",
			"Reduce Only",
			"Liq. Price",
			"Fees",
			"Positions",
			"Funding Payments",
			"Deposit",
			"Account Summary",
			"Docs",
			"Risk Disclosure",
		]) {
			expect(text, label).toContain(label);
		}
		const visibleDesktop = document.createElement("div");
		visibleDesktop.innerHTML = desktop?.innerHTML ?? "";
		for (const sample of visibleDesktop.querySelectorAll(".invisible")) sample.remove();
		expect(visibleDesktop.textContent).not.toMatch(/\d{2,}\.\d/);
		expect(container.querySelectorAll("[data-shell-panel]")).toHaveLength(7);
		for (const panel of container.querySelectorAll("[data-shell-panel]")) expect(panel.childElementCount).toBe(1);
	});

	it("stays inert: nothing focusable, no links, no live regions besides the loading announcement", () => {
		const decorative = container.querySelector('[aria-hidden="true"][inert]');
		expect(decorative).not.toBeNull();
		expect(decorative?.querySelectorAll("button").length).toBeGreaterThan(0);
		for (const control of container.querySelectorAll("button, a, input, select, textarea, [tabindex], nav, form")) {
			expect(control.closest("[inert]")).toBe(decorative);
		}
		expect(container.querySelectorAll("[aria-hidden='true']").length).toBeGreaterThan(0);
		expect(container.querySelectorAll("output")).toHaveLength(1);
		expect(container.querySelectorAll('[class*="animate-"]')).toHaveLength(0);
	});

	it("keeps the mobile frame's connect entry and three-tab navigation", () => {
		const mobile = container.querySelector("[data-shell-mobile]");
		const text = mobile?.textContent ?? "";
		expect(text).toContain("Connect Wallet");
		expect(text).toContain("Markets");
		expect(text).toContain("Account");
		expect(mobile?.lastElementChild?.querySelectorAll(".flex-1")).toHaveLength(3);
	});
});
