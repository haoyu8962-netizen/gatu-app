// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Button, Tabs, TabsList, TabsTrigger } from "@gatu/ui";
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, createRef, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { renderDesktopPanel } from "@/components/trade/layout/app-shell-skeleton";
import {
	ACCOUNT_OVERVIEW_PLACEHOLDER,
	ACCOUNT_TABLE_PLACEHOLDER,
	DESKTOP_PANEL_PLACEHOLDER,
} from "@/components/trade/layout/desktop-placeholders";
import { TerminalLoadingWorkspace } from "@/components/trade/layout/terminal-loading-workspace";
import { AccountTabStripView } from "@/components/trade/positions/account-tab-strip-view";
import {
	ACCOUNT_TAB_COUNT_CLASS,
	ACCOUNT_TAB_INDICATOR_CLASS,
	ACCOUNT_TAB_LIST_CLASS,
	ACCOUNT_TAB_TRIGGER_CLASS,
	ACCOUNT_TABLE_AUTO_HEIGHT_CLASS,
	ACCOUNT_TABLE_FIXED_CLASS,
	ACCOUNT_TABLE_PANEL_CLASS,
	AccountTableHeaderView,
} from "@/components/trade/positions/account-table-header-view";
import { AccountActionButtonView } from "@/components/trade/tradebox/account-action-button-view";
import { AccountPanelFrameView } from "@/components/trade/tradebox/account-panel-frame-view";
import { DisconnectedAccountOverview } from "@/components/trade/tradebox/disconnected-account-overview";
import { ACCOUNT_LABELS } from "@/config/account-labels";
import { POSITIONS_TABS } from "@/config/trade";
import { formatNumber, formatPercent, formatUSD } from "@/lib/format";
import {
	getNumberFormatLocale,
	useGlobalSettingsActions,
	usePositionsActiveTab,
} from "@/stores/use-global-settings-store";

vi.mock("@/providers/exchange-scope", () => ({ useExchangeScope: () => ({ routeMarketName: "BTC" }) }));

function dom(node: ReactNode) {
	const root = document.createElement("div");
	root.innerHTML = renderToString(node);
	return root;
}

function geometry(element: Element): unknown {
	return {
		tag: element.tagName,
		classes: [...element.classList].sort(),
		children: [...element.children].map(geometry),
	};
}

function attributes(element: Element) {
	return Object.fromEntries(
		[...element.attributes].map(({ name, value }) => [
			name,
			name === "class" ? value.split(" ").sort().join(" ") : value,
		]),
	);
}

function required<T>(value: T | null | undefined): T {
	if (value == null) throw new Error("Missing expected element");
	return value;
}

function source(path: string) {
	return readFileSync(resolve(__dirname, "../..", path), "utf8");
}

const viewPaths = [
	"positions/account-table-header-view.tsx",
	"positions/account-tab-strip-view.tsx",
	"tradebox/account-overview-view.tsx",
	"tradebox/account-action-button-view.tsx",
	"tradebox/account-panel-frame-view.tsx",
];

const i18n = setupI18n({ locale: "en", messages: { en: {} } });
function translated(node: ReactNode) {
	return <I18nProvider i18n={i18n}>{node}</I18nProvider>;
}

describe("account panels single-source parity", () => {
	it("shares panel, header, strip and overview geometry with sample real props", () => {
		const sample = {
			...DESKTOP_PANEL_PLACEHOLDER,
			accountTable: {
				...ACCOUNT_TABLE_PLACEHOLDER,
				active: "history",
				tabs: ACCOUNT_TABLE_PLACEHOLDER.tabs.map((tab) => ({ ...tab, label: `Translated ${tab.value}` })),
			},
			accountOverview: {
				...ACCOUNT_OVERVIEW_PLACEHOLDER,
				accountTitle: "账户",
				title: "账户概览",
				rows: ACCOUNT_OVERVIEW_PLACEHOLDER.rows.map((row) => ({
					...row,
					label: `Translated ${row.key}`,
					value: "123.00",
				})),
			},
		};
		for (const panel of ["accountTable", "accountInfo"] as const) {
			const placeholder = dom(renderDesktopPanel(panel, DESKTOP_PANEL_PLACEHOLDER));
			const real = dom(renderDesktopPanel(panel, sample));
			// The underline moves to the selected content-sized button; its geometry is pinned separately below.
			placeholder.querySelector('[role="presentation"]')?.remove();
			real.querySelector('[role="presentation"]')?.remove();
			expect(geometry(placeholder)).toEqual(geometry(real));
		}
		expect(ACCOUNT_TABLE_PANEL_CLASS).toBe("flex flex-col bg-surface");
		expect(ACCOUNT_TABLE_FIXED_CLASS).toBe("h-full overflow-hidden");
		expect(ACCOUNT_TABLE_AUTO_HEIGHT_CLASS).toBe("min-h-64");
		expect(
			geometry(
				dom(
					<AccountPanelFrameView title="Account">
						<span>Placeholder</span>
					</AccountPanelFrameView>,
				),
			),
		).toEqual(
			geometry(
				dom(
					<AccountPanelFrameView title="账户">
						<span>Real</span>
					</AccountPanelFrameView>,
				),
			),
		);
	});

	it.each([false, true])("pins the static strip against Tabs SSR, including count slots (%s)", (counts) => {
		const tabs = ACCOUNT_TABLE_PLACEHOLDER.tabs.map((tab) => ({ ...tab, count: counts ? "(2)" : undefined }));
		const placeholder = dom(<AccountTabStripView tabs={tabs} active="positions" />);
		const runtime = dom(
			<Tabs value="positions" size="xs" variant="underline">
				<TabsList className={ACCOUNT_TAB_LIST_CLASS} indicatorClassName={ACCOUNT_TAB_INDICATOR_CLASS}>
					{tabs.map((tab) => (
						<TabsTrigger key={tab.value} value={tab.value} className={ACCOUNT_TAB_TRIGGER_CLASS}>
							<span>{tab.label}</span>
							{counts ? <span className={ACCOUNT_TAB_COUNT_CLASS}>{tab.count}</span> : null}
						</TabsTrigger>
					))}
				</TabsList>
			</Tabs>,
		);
		// Sole structural exception: Base UI measures a sibling indicator with CSS variables;
		// the inert static strip anchors its underline inside the active content-sized button.
		const underline = required(placeholder.querySelector('[role="presentation"]'));
		expect(underline.className).toBe("absolute inset-x-0 -bottom-px h-0.5 bg-market-close-fg");
		expect(underline.parentElement?.getAttribute("data-positions-tab")).toBe("positions");
		expect(underline.parentElement?.hasAttribute("data-active")).toBe(true);
		underline.remove();
		for (const button of placeholder.querySelectorAll("button")) {
			expect(button.classList.contains("relative")).toBe(true);
			button.classList.remove("relative");
		}
		const list = required(runtime.querySelector('[role="tablist"]'));
		const indicator = required(list.querySelector('[role="presentation"]'));
		expect(indicator.getAttribute("style")).toContain("var(--active-tab-width)");
		indicator.remove();
		expect(geometry(required(placeholder.firstElementChild))).toEqual(geometry(list));
		expect(placeholder.querySelectorAll("[data-position-tab-count]")).toHaveLength(counts ? 7 : 0);
	});

	it.each(["filled", "outline"] as const)(
		"pins %s action button attributes and classes against Button SSR",
		(variant) => {
			for (const disabled of [false, true])
				for (const focusableWhenDisabled of [false, true]) {
					const common = {
						disabled,
						focusableWhenDisabled,
						"aria-describedby": "reason",
						title: "Deposit unavailable",
					};
					const actual = required(
						dom(<AccountActionButtonView variant={variant} label="Deposit" {...common} />).querySelector("button"),
					);
					const primitive = required(
						dom(
							<Button
								variant={variant}
								intent="neutral"
								className="min-h-8 min-w-0 rounded-8 font-semibold shadow-none"
								{...common}
							>
								Deposit
							</Button>,
						).querySelector("button"),
					);
					expect(attributes(actual)).toEqual(attributes(primitive));
					expect(actual.textContent).toBe(primitive.textContent);
				}
		},
	);

	it("forwards refs and enabled events but prevents focusable disabled activation", () => {
		const host = document.createElement("div");
		const root = createRoot(host);
		const ref = createRef<HTMLButtonElement>();
		const onClick = vi.fn();
		try {
			act(() =>
				root.render(
					<AccountActionButtonView
						ref={ref}
						variant="filled"
						label="Deposit"
						onClick={onClick}
						disabled
						focusableWhenDisabled
					/>,
				),
			);
			const button = required(ref.current);
			act(() => button.click());
			expect(onClick).not.toHaveBeenCalled();
			const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
			button.dispatchEvent(enter);
			expect(enter.defaultPrevented).toBe(true);
			const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
			button.dispatchEvent(tab);
			expect(tab.defaultPrevented).toBe(false);
			act(() => root.render(<AccountActionButtonView ref={ref} variant="filled" label="Deposit" onClick={onClick} />));
			expect(ref.current).toBe(button);
			act(() => button.click());
			expect(onClick).toHaveBeenCalledOnce();
		} finally {
			act(() => root.unmount());
		}
	});

	it("preserves scroller and toolbar ref targets and optional action padding", () => {
		const host = document.createElement("div");
		const root = createRoot(host);
		const scrollRef = createRef<HTMLDivElement>();
		const actionsRef = createRef<HTMLDivElement>();
		try {
			act(() =>
				root.render(<AccountTableHeaderView scrollRef={scrollRef} actionsRef={actionsRef} tabs={<span>Tabs</span>} />),
			);
			expect(scrollRef.current).toBe(host.querySelector('[data-testid="positions-tabs-scroll"]'));
			expect(actionsRef.current?.className).toBe("flex shrink-0 items-center gap-2");
			act(() =>
				root.render(
					<AccountTableHeaderView
						scrollRef={scrollRef}
						actionsRef={actionsRef}
						tabs={<span>Tabs</span>}
						actions={<button type="button">Filter</button>}
					/>,
				),
			);
			expect(actionsRef.current?.className).toBe("flex shrink-0 items-center gap-2 pl-3");
		} finally {
			act(() => root.unmount());
		}
	});

	it("mirrors the real disconnected overview's five visible zero values", () => {
		const shell = dom(renderDesktopPanel("accountInfo", DESKTOP_PANEL_PLACEHOLDER));
		const runtime = dom(
			translated(
				<AccountPanelFrameView title="Account">
					<DisconnectedAccountOverview depositEnabled={false} />
				</AccountPanelFrameView>,
			),
		);
		expect(geometry(shell)).toEqual(geometry(runtime));
		const values = (node: Element) =>
			[...node.querySelectorAll('[data-slot="info-row-value"]')].map((row) => row.textContent);
		expect(values(shell)).toEqual(["0.00%", "$0.00", "$0.00", "$0.00", "0.00x"]);
		expect(values(runtime)).toEqual(values(shell));
		expect(shell.querySelectorAll("[data-grid-content-part]")).toHaveLength(1);
		expect(shell.querySelectorAll(".invisible")).toHaveLength(0);
		expect([...shell.querySelectorAll('[data-slot="info-row-label"]')].map((row) => row.textContent)).toEqual([
			"Account Margin Ratio",
			"Portfolio Value",
			"Unrealized PNL",
			"Cross Maintenance Margin",
			"Cross Account Leverage",
		]);
		expect(shell.querySelector("h3")?.textContent).toBe("Account Summary");
		expect(shell.querySelectorAll("[data-disabled]")).toHaveLength(2);
	});

	it("passes the accessible description and preserves the sponsored deposit action", () => {
		const onDeposit = vi.fn();
		const host = document.createElement("div");
		const root = createRoot(host);
		try {
			act(() =>
				root.render(
					translated(
						<DisconnectedAccountOverview
							depositEnabled={false}
							depositDisabledReason="Unavailable"
							onDeposit={onDeposit}
						/>,
					),
				),
			);
			const button = required(host.querySelector("button"));
			expect(button.getAttribute("aria-disabled")).toBe("true");
			expect(host.querySelector(`[id="${button.getAttribute("aria-describedby")}"]`)?.textContent).toBe("Unavailable");
			act(() => button.click());
			expect(onDeposit).not.toHaveBeenCalled();
			act(() => root.render(translated(<DisconnectedAccountOverview depositEnabled onDeposit={onDeposit} />)));
			expect(host.querySelector("button")).toBe(button);
			expect(button.hasAttribute("aria-describedby")).toBe(false);
			act(() => button.click());
			expect(onDeposit).toHaveBeenCalledOnce();
			expect(host.querySelectorAll("button")[1].disabled).toBe(true);
		} finally {
			act(() => root.unmount());
		}
	});

	it("reads persisted tabs synchronously, validates defaults, formats zeros and hot switches without remounting", () => {
		let actions: ReturnType<typeof useGlobalSettingsActions> | undefined;
		let previousTab = "positions";
		const previousFormat = getNumberFormatLocale();
		function Probe() {
			actions = useGlobalSettingsActions();
			previousTab = usePositionsActiveTab();
			return null;
		}
		const host = document.createElement("div");
		const root = createRoot(host);
		act(() => root.render(<Probe />));
		const settings = required(actions);
		const restoreTab = previousTab;
		try {
			act(() => settings.setPositionsActiveTab("funding"));
			act(() => settings.setNumberFormatLocale("de-DE"));
			act(() =>
				root.render(
					translated(
						<>
							<TerminalLoadingWorkspace />
							<DisconnectedAccountOverview depositEnabled={false} />
						</>,
					),
				),
			);
			const header = required(host.querySelector('[data-testid="positions-toolbar-header"]'));
			const tab = required(header.querySelector('[data-positions-tab="funding"]'));
			expect(tab.hasAttribute("data-active")).toBe(true);
			const overviews = [...host.querySelectorAll('[data-slot="disconnected-account-overview"]')];
			expect(overviews).toHaveLength(2);
			const expected = [
				formatPercent(0, 2),
				formatUSD(0, { compact: false }),
				formatUSD(0, { compact: false }),
				formatUSD(0, { compact: false }),
				`${formatNumber(0, 2)}x`,
			];
			expect(expected[0]).toContain("0,00");
			for (const overview of overviews)
				expect([...overview.querySelectorAll('[data-slot="info-row-value"]')].map((node) => node.textContent)).toEqual(
					expected,
				);
			const zh = Object.fromEntries(
				Object.entries(ACCOUNT_LABELS).map(([key, descriptor]) => [descriptor.id, `中文${key}`]),
			);
			zh[POSITIONS_TABS[5].label.id] = "资金费率";
			act(() => i18n.loadAndActivate({ locale: "zh", messages: zh }));
			expect(host.querySelector('[data-testid="positions-toolbar-header"]')).toBe(header);
			expect(header.querySelector('[data-positions-tab="funding"]')).toBe(tab);
			expect(tab.textContent).toBe("资金费率");
			overviews.forEach((overview, index) => {
				expect(host.querySelectorAll('[data-slot="disconnected-account-overview"]')[index]).toBe(overview);
				expect(overview.querySelector("h3")?.textContent).toBe("中文summary");
			});
			act(() => settings.setPositionsActiveTab("transfers"));
			expect(header.querySelector('[data-positions-tab="positions"]')?.hasAttribute("data-active")).toBe(true);
			act(() => settings.setNumberFormatLocale("en-US"));
			expect(overviews[0].querySelector('[data-slot="info-row-value"]')?.textContent).toBe("0.00%");
			expect(
				dom(renderDesktopPanel("accountTable", DESKTOP_PANEL_PLACEHOLDER))
					.querySelector("[data-active]")
					?.getAttribute("data-positions-tab"),
			).toBe("positions");
		} finally {
			act(() => root.unmount());
			settings.setPositionsActiveTab(restoreTab);
			settings.setNumberFormatLocale(previousFormat);
			i18n.loadAndActivate({ locale: "en", messages: {} });
		}
	});

	it.each(viewPaths)("keeps %s deterministic and props-only", (path) => {
		const text = source(`components/trade/${path}`);
		expect(text).toContain("interface Props");
		expect(text).toMatch(/export function \w+View\(/);
		expect(text).not.toMatch(
			/\buse[A-Z]\w*|@gatu\/ui|@lingui|\/stores\/|\bwindow\b|\bdocument\b|Date\.|Math\.random|\/\//,
		);
	});

	it("wires both runtime containers and both placeholder callers through the shared views", () => {
		const positions = source("components/trade/positions/positions-panel.tsx");
		expect(positions).toContain("<AccountTableHeaderView");
		for (const event of ["onPointerEnter", "onPointerDown", "onFocus"])
			expect(positions).toContain(`${event}={() => preloadHistoryTab(tab.value)}`);
		expect(positions).toContain("actionsRef={setToolbarTarget}");
		expect(positions).toContain("scrollRef={tabScrollRef}");
		expect(positions).toContain("hasActions={hasHeaderActions}");
		expect(source("components/trade/tradebox/account-panel.tsx")).toContain("<AccountPanelFrameView");
		expect(source("components/trade/tradebox/disconnected-account-overview.tsx")).toContain("<AccountOverviewView");
		const shell = source("components/trade/layout/app-shell-skeleton.tsx");
		for (const name of [
			"AccountTableFrame",
			"AccountInfoFrame",
			"renderDesktopPanelFrame",
			"PanelFrameLabels",
			"UNDERLINE_TAB_CLASS",
			"SUMMARY_ROW_CLASS",
		]) {
			if (name === "PanelFrameLabels") expect(shell).not.toContain("interface PanelFrameLabels");
			else expect(shell).not.toContain(name);
		}
		expect(shell).toContain("renderDesktopPanel(panelId, DESKTOP_PANEL_PLACEHOLDER)");
		expect(source("components/trade/layout/terminal-loading-workspace.tsx")).toContain("renderDesktopPanel(panelId, {");
	});
});
