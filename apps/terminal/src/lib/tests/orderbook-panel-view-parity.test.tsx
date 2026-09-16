// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Dropdown, Tabs, TabsContent, TabsList, TabsTrigger } from "@gatu/ui";
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { BookBookmarkIcon, ListDashesIcon } from "@phosphor-icons/react";
import { act, createRef, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { renderDesktopPanel } from "@/components/trade/layout/app-shell-skeleton";
import { DESKTOP_PANEL_PLACEHOLDER, ORDERBOOK_PLACEHOLDER } from "@/components/trade/layout/desktop-placeholders";
import { TerminalLoadingWorkspace } from "@/components/trade/layout/terminal-loading-workspace";
import { OrderbookGroupingTriggerView } from "@/components/trade/orderbook/orderbook-grouping-trigger-view";
import {
	ORDERBOOK_PANEL_CLASS,
	ORDERBOOK_TAB_CONTENT_CLASS,
	OrderbookPanelView,
} from "@/components/trade/orderbook/orderbook-panel-view";
import { OrderbookTabsView } from "@/components/trade/orderbook/orderbook-tabs-view";
import { ORDERBOOK_LABELS } from "@/config/orderbook-labels";
import { getPriceGroupingOptions } from "@/lib/trade/orderbook";

const route = vi.hoisted(() => ({ routeMarketName: undefined as string | undefined, routeDex: "xyz" }));
vi.mock("@/providers/exchange-scope", () => ({ useExchangeScope: () => route }));

const IGNORED_ATTRIBUTES = /^(?:role|id|aria-.*|data-.*|tabindex|hidden|style)$/;
const IGNORED_CLASSES = new Set(["invisible", "[&[hidden]]:!hidden", "data-[ending-style]:!hidden"]);
const INDICATOR_CLASSES = [
	"absolute",
	"-bottom-px",
	"h-0.5",
	"bg-action",
	"transition-[left,width]",
	"duration-200",
	"ease-in-out",
	"motion-reduce:transition-none",
];

function dom(node: ReactNode) {
	const root = document.createElement("div");
	root.innerHTML = renderToString(node);
	return root;
}

function geometry(element: Element): unknown {
	return {
		tag: element.tagName,
		attributes: [...element.attributes]
			.filter(({ name }) => name !== "class" && !IGNORED_ATTRIBUTES.test(name))
			.map(({ name, value }) => [name, value])
			.sort(),
		classes: [...element.classList].filter((token) => !IGNORED_CLASSES.has(token)).sort(),
		children: [...element.children].map(geometry),
	};
}

function runtimeTabs(active: "book" | "trades") {
	return (
		<Tabs value={active} fullWidth size="sm" variant="underline" className={ORDERBOOK_PANEL_CLASS}>
			<div className="flex items-center justify-between">
				<TabsList className="w-full min-w-0">
					<TabsTrigger value="book" className="min-w-0" icon={<BookBookmarkIcon className="size-3.5 shrink-0" />}>
						<span className="orderbook-tab-label min-w-0 truncate">Order Book</span>
					</TabsTrigger>
					<TabsTrigger value="trades" className="min-w-0" icon={<ListDashesIcon className="size-3.5 shrink-0" />}>
						<span className="orderbook-tab-label min-w-0 truncate">Trades</span>
					</TabsTrigger>
				</TabsList>
			</div>
			<TabsContent value="book" className={ORDERBOOK_TAB_CONTENT_CLASS}>
				<OrderbookPanelView {...ORDERBOOK_PLACEHOLDER} />
			</TabsContent>
		</Tabs>
	);
}

const dropdownProps = {
	items: [],
	size: "xxs",
	align: "start",
	triggerVariant: "minimal",
	triggerAriaLabel: "Price grouping",
	triggerClassName: "min-w-0 max-w-full",
	className: "min-w-0 flex-1 overflow-hidden",
	popupClassName: "min-w-0 w-max",
} as const;

function source(path: string) {
	return readFileSync(resolve(__dirname, "../..", path), "utf8");
}

describe("desktop order book chrome single-source parity", () => {
	it("shares placeholder and sample real chrome structure and geometry", () => {
		const placeholder = dom(<OrderbookPanelView {...ORDERBOOK_PLACEHOLDER} />);
		const sample = dom(
			<OrderbookPanelView
				{...ORDERBOOK_PLACEHOLDER}
				labels={{ price: "价格", size: "数量", total: "累计", spread: "价差" }}
				assetLabel="ETH"
				spreadText="0.10 (0.010%)"
				grouping={
					<Dropdown {...dropdownProps} items={[]} renderTrigger={<OrderbookGroupingTriggerView label="0.1" />} />
				}
			/>,
		);
		expect(geometry(placeholder)).toEqual(geometry(sample));
		expect(placeholder.querySelectorAll(".orderbook-asset-heading.invisible")).toHaveLength(2);
		for (const asset of placeholder.querySelectorAll(".orderbook-asset-heading"))
			expect(asset.textContent).toBe("(BTC)");
		expect(placeholder.querySelector('[data-slot="orderbook-spread"] .tabular-nums')?.textContent).toBe("—");
		for (const side of ["ask", "bid"])
			expect(placeholder.querySelector(`[data-orderbook-side-container="${side}"]`)?.children).toHaveLength(0);
	});

	it.each(["book", "trades"] as const)("matches the real resolved tab strip (%s)", (active) => {
		const runtime = dom(runtimeTabs(active)).firstElementChild?.firstElementChild;
		const placeholder = dom(
			<OrderbookTabsView labels={ORDERBOOK_PLACEHOLDER.labels} active={active} />,
		).firstElementChild;
		if (!runtime || !placeholder) throw new Error("Missing tab strip");
		expect(runtime.querySelectorAll(".bg-action")).toHaveLength(1);
		for (const indicator of runtime.querySelectorAll(".bg-action"))
			expect([...indicator.classList].sort()).toEqual([...INDICATOR_CLASSES].sort());
		const indicator = placeholder.querySelector<HTMLElement>(".bg-action");
		expect([...(indicator?.classList ?? [])].sort()).toEqual([...INDICATOR_CLASSES].sort());
		expect(indicator?.style.left).toBe(active === "book" ? "0%" : "50%");
		expect(indicator?.style.width).toBe("50%");
		expect(indicator?.hasAttribute("hidden")).toBe(false);
		expect(geometry(placeholder)).toEqual(geometry(runtime));
		expect(placeholder.querySelectorAll("[data-active]")).toHaveLength(1);
		expect(placeholder.querySelector("[data-active]")?.textContent).toBe(active === "book" ? "Order Book" : "Trades");
	});

	it("preserves the legacy minimal xxs trigger and renderTrigger geometry", () => {
		const bare = dom(<OrderbookGroupingTriggerView label="—" />).firstElementChild;
		const legacy = dom(
			<Dropdown
				{...dropdownProps}
				items={[]}
				trigger={<span className="block min-w-0 truncate text-xs tabular-nums">—</span>}
			/>,
		).querySelector("button");
		const runtime = dom(
			<Dropdown {...dropdownProps} items={[]} renderTrigger={<OrderbookGroupingTriggerView label="—" />} />,
		).querySelector("button");
		if (!bare || !legacy || !runtime) throw new Error("Missing grouping trigger");
		expect(geometry(bare)).toEqual(geometry(legacy));
		expect(geometry(bare)).toEqual(geometry(runtime));
		expect(getPriceGroupingOptions(undefined, 2)).toEqual([]);
		expect(dom(ORDERBOOK_PLACEHOLDER.grouping).querySelector("span")?.textContent).toBe("—");
		expect(dom(ORDERBOOK_PLACEHOLDER.grouping).querySelector(".invisible")).toBeNull();
		expect(dom(<OrderbookGroupingTriggerView label={null} />).querySelector(".invisible")?.textContent).toBe("0.01");
	});

	it("shares shell root and content classes with real Tabs primitives", () => {
		const shell = dom(renderDesktopPanel("marketData", DESKTOP_PANEL_PLACEHOLDER));
		const runtime = dom(runtimeTabs("book"));
		expect(shell.firstElementChild?.className).toBe(ORDERBOOK_PANEL_CLASS);
		expect(runtime.firstElementChild?.className).toBe(ORDERBOOK_PANEL_CLASS);
		expect(shell.firstElementChild?.lastElementChild?.className).toBe(ORDERBOOK_TAB_CONTENT_CLASS);
		expect(geometry(shell)).toEqual(geometry(runtime));
	});

	it("forwards ladder ref, both side styles and row slots without owning them", () => {
		const host = document.createElement("div");
		const root = createRoot(host);
		const ladderRef = createRef<HTMLDivElement>();
		Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
		act(() =>
			root.render(
				<OrderbookPanelView
					{...ORDERBOOK_PLACEHOLDER}
					ladderRef={ladderRef}
					sideStyle={{ visibility: "hidden" }}
					asks={<span>ask slot</span>}
					bids={<span>bid slot</span>}
				/>,
			),
		);
		expect(ladderRef.current?.children).toHaveLength(3);
		for (const side of ["ask", "bid"]) {
			const node = host.querySelector<HTMLElement>(`[data-orderbook-side-container="${side}"]`);
			expect(node?.style.visibility).toBe("hidden");
			expect(node?.textContent).toBe(`${side} slot`);
		}
		act(() => root.unmount());
	});

	it.each([
		["BTC", "BTC"],
		["xyz:TSLA", "TSLA"],
		["PURR/USDC", "PURR"],
		["@107", null],
		[undefined, null],
	])("uses only synchronously known route assets in the runtime placeholder (%s)", (name, asset) => {
		route.routeMarketName = name ?? undefined;
		const i18n = setupI18n({ locale: "en", messages: { en: {} } });
		const loading = dom(
			<I18nProvider i18n={i18n}>
				<TerminalLoadingWorkspace />
			</I18nProvider>,
		);
		const book = loading.querySelector(".orderbook-panel-container");
		expect(book?.className).toBe(ORDERBOOK_PANEL_CLASS);
		for (const heading of book?.querySelectorAll(".orderbook-asset-heading") ?? []) {
			expect(heading.textContent).toBe(`(${asset ?? "BTC"})`);
			expect(heading.classList.contains("invisible")).toBe(asset === null);
		}
		expect(book?.closest("[inert]")).not.toBeNull();
		expect(book?.querySelector("button span.tabular-nums")?.textContent).toBe("—");
	});

	it("hot-switches runtime placeholder labels without replacing its panel", () => {
		route.routeMarketName = "BTC";
		const i18n = setupI18n({
			locale: "en",
			messages: { en: {}, zh: { [ORDERBOOK_LABELS.orderBook.id]: "订单簿", [ORDERBOOK_LABELS.spread.id]: "价差" } },
		});
		const host = document.createElement("div");
		const root = createRoot(host);
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<TerminalLoadingWorkspace />
				</I18nProvider>,
			),
		);
		const book = host.querySelector(".orderbook-panel-container");
		expect(book?.textContent).toContain("Order Book");
		act(() => i18n.activate("zh"));
		expect(host.querySelector(".orderbook-panel-container")).toBe(book);
		expect(book?.textContent).toContain("订单簿");
		expect(book?.querySelector('[data-slot="orderbook-spread"]')?.textContent).toBe("价差—");
		act(() => i18n.activate("en"));
		expect(host.querySelector(".orderbook-panel-container")).toBe(book);
		expect(book?.textContent).toContain("Order Book");
		act(() => root.unmount());
	});

	it("preserves native refs and Dropdown keyboard selection", async () => {
		const host = document.createElement("div");
		document.body.appendChild(host);
		const root = createRoot(host);
		const ref = createRef<HTMLButtonElement>();
		const selected = vi.fn();
		try {
			await act(async () =>
				root.render(
					<Dropdown
						{...dropdownProps}
						renderTrigger={<OrderbookGroupingTriggerView ref={ref} label="0.01" />}
						items={[{ label: "0.1", onSelect: selected }]}
					/>,
				),
			);
			expect(ref.current?.getAttribute("aria-label")).toBe("Price grouping");
			await act(async () =>
				ref.current?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })),
			);
			expect(ref.current?.getAttribute("aria-expanded")).toBe("true");
			await act(async () => document.querySelector<HTMLButtonElement>('[role="menuitem"]')?.click());
			expect(selected).toHaveBeenCalledOnce();
			expect(host.querySelector("button button")).toBeNull();
		} finally {
			await act(async () => root.unmount());
			host.remove();
		}
	});

	it("keeps views pure and all callers connected to the shared views and constants", () => {
		for (const name of ["panel", "tabs", "grouping-trigger"]) {
			const view = source(`components/trade/orderbook/orderbook-${name}-view.tsx`);
			expect(view).toContain("interface Props");
			expect(view).toContain("export function Orderbook");
			expect(view).not.toMatch(
				/\buse[A-Z]\w*|@lingui|@gatu\/ui|stores\/|window|document|Date\.|Math\.random|useId|\/\/|\/\*/,
			);
		}
		const runtime = source("components/trade/orderbook/orderbook-panel.tsx");
		const shell = source("components/trade/layout/app-shell-skeleton.tsx");
		const loading = source("components/trade/layout/terminal-loading-workspace.tsx");
		for (const caller of [runtime, shell]) {
			expect(caller).toContain("<OrderbookPanelView");
			expect(caller).toContain("className={ORDERBOOK_PANEL_CLASS}");
			expect(caller).toContain("className={ORDERBOOK_TAB_CONTENT_CLASS}");
		}
		expect(runtime).toMatch(/renderTrigger=\{\s*<OrderbookGroupingTriggerView/);
		expect(runtime).toContain("{...hover.containerProps}");
		expect(runtime).toContain("ladderRef={orderbookContainerRef}");
		expect(runtime).toContain("aria-busy={!hasCurrentSnapshot && !hasFailure}");
		expect(runtime).toContain('<output aria-live="polite" className="sr-only">');
		expect(runtime).toMatch(/<TabsContent value="trades" keepMounted/);
		expect(shell).not.toContain("OrderBookFrame");
		expect(shell).toContain("<OrderbookTabsView");
		expect(loading).toContain("...ORDERBOOK_PLACEHOLDER");
		expect(loading).toContain('getBaseQuoteFromPairName(kind === "spot" ? routeMarketName : pairName, kind).baseToken');
		expect(loading).toContain("renderDesktopPanel(panelId, {");
		for (const label of ["orderBook", "trades", "price", "size", "total", "spread"])
			expect(loading).toContain(`t(ORDERBOOK_LABELS.${label})`);
	});
});
