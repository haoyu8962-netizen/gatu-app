/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppShellSkeleton } from "@/components/trade/layout/app-shell-skeleton";

import { ORDERBOOK_PANEL_CLASS, ORDERBOOK_TAB_CONTENT_CLASS } from "@/components/trade/orderbook/orderbook-panel-view";

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

	it("renders the real trade root and regions with inert inputs and static chrome", () => {
		const panel = container.querySelector("[data-shell-desktop] .trade-panel-container");
		expect(panel?.className).toBe("trade-panel-container flex h-full flex-col bg-surface font-market-close");
		expect(panel?.querySelector('[data-slot="trade-panel-header"]')?.className).toBe("shrink-0 px-3 pt-3");
		expect(panel?.querySelector('[data-slot="trade-panel-footer"]')?.className).toBe(
			"flex shrink-0 flex-col gap-2 px-3 py-3",
		);
		expect(panel?.querySelectorAll(".trade-control-button")).toHaveLength(3);
		expect(panel?.querySelectorAll(".trade-order-type-button")).toHaveLength(3);
		expect(panel?.querySelector('input[data-size="default"]')?.getAttribute("value")).toBe("");
		expect(panel?.querySelector("[class*='animate-']")).toBeNull();
		for (const input of panel?.querySelectorAll("input,button") ?? []) expect(input.closest("[inert]")).not.toBeNull();
	});

	it("renders the shared account headers and five real disconnected zero values", () => {
		const desktop = container.querySelector("[data-shell-desktop]");
		const header = desktop?.querySelector('[data-testid="positions-toolbar-header"]');
		expect(header?.className).toContain("h-[45px]");
		expect(header?.querySelectorAll("button")).toHaveLength(7);
		expect(header?.querySelector("[data-active]")?.getAttribute("data-positions-tab")).toBe("positions");
		expect(header?.querySelector('[data-testid="positions-header-actions"]')?.childElementCount).toBe(0);
		expect(header?.querySelector("[data-position-tab-count]")).toBeNull();
		const overview = desktop?.querySelector('[data-slot="disconnected-account-overview"]');
		expect(overview?.hasAttribute("data-grid-content-part")).toBe(true);
		expect(
			[...(overview?.querySelectorAll('[data-slot="info-row-value"]') ?? [])].map((node) => node.textContent),
		).toEqual(["0.00%", "$0.00", "$0.00", "$0.00", "0.00x"]);
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

	it("keeps all controls and navigation inert with one loading announcement", () => {
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

	it("uses the fixed shared chrome and scrolling desktop frame", () => {
		const desktop = container.querySelector("[data-shell-desktop]");
		for (const token of ["min-h-dvh", "overflow-x-hidden", "pb-8", "pt-14"])
			expect(desktop?.classList.contains(token)).toBe(true);
		expect(desktop?.classList.contains("h-screen")).toBe(false);
		expect(desktop?.querySelector("main")?.className).toBe("min-h-0 flex-1 bg-grid-container");
		expect(desktop?.querySelector("header")?.classList.contains("fixed")).toBe(true);
		expect(desktop?.querySelector("footer")?.classList.contains("fixed")).toBe(true);
		expect(desktop?.querySelector("footer .tabular-nums.invisible")?.textContent).toBe("00:00 AM");
	});

	it("renders the shared book chrome with empty sides and no visible waiting notice", () => {
		const book = container.querySelector("[data-shell-desktop] .orderbook-panel-container");
		expect(book?.className).toBe(ORDERBOOK_PANEL_CLASS);
		expect(book?.lastElementChild?.className).toBe(ORDERBOOK_TAB_CONTENT_CLASS);
		expect(book?.querySelectorAll(".orderbook-tab-label")).toHaveLength(2);
		expect(book?.querySelectorAll(".orderbook-asset-heading.invisible")).toHaveLength(2);
		expect(book?.querySelector('[data-slot="orderbook-spread"] .tabular-nums')?.textContent).toBe("—");
		for (const side of book?.querySelectorAll("[data-orderbook-side-container]") ?? [])
			expect(side.children).toHaveLength(0);
		expect(book?.textContent).not.toContain("Waiting");
		expect(book?.querySelector('[data-slot="trades-pending"]')).toBeNull();
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
