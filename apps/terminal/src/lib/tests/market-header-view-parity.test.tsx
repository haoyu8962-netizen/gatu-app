/** @vitest-environment jsdom */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, createRef, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { TokenSelectorTriggerView } from "@/components/trade/chart/token-selector-trigger-view";
import { AssetIconSlotView } from "@/components/trade/components/asset-icon-slot-view";
import { FavoritesStripView } from "@/components/trade/header/favorites-strip-view";
import { AppShellSkeleton } from "@/components/trade/layout/app-shell-skeleton";
import { FAVORITES_PLACEHOLDER, MARKET_HEADER_PLACEHOLDER } from "@/components/trade/layout/desktop-placeholders";
import { MarketHeaderView } from "@/components/trade/layout/market-header-view";
import { TerminalLoadingWorkspace } from "@/components/trade/layout/terminal-loading-workspace";
import { MarketOverviewView } from "@/components/trade/market-overview-view";
import { MARKET_HEADER_LABELS } from "@/config/market-header";
import { ExchangeScopeProvider } from "@/providers/exchange-scope";

const route = vi.hoisted(() => ({ pathname: "/", search: {} }));
vi.mock("@tanstack/react-router", () => ({ useLocation: () => route }));

const COLOR_OR_TONE =
	/^(?:(?:hover|active|aria-expanded|data-disabled):)*(?:text-(?:fg(?:-.+)?|success|error|market-(?:up|down|neutral)|trading-panel-(?:fg|success|error|subtle|muted))|bg-.+|border-stroke-.+|opacity-\d+)$/;

function geometry(node: ReactNode) {
	const root = document.createElement("div");
	root.innerHTML = renderToString(node);
	return [...root.querySelectorAll("*")].map((element) => ({
		tag: element.tagName,
		classes: [...element.classList].filter((token) => token !== "invisible" && !COLOR_OR_TONE.test(token)).sort(),
	}));
}

const sampleStats = MARKET_HEADER_PLACEHOLDER.stats.map((stat, index) => ({
	...stat,
	value: ["71,700.0", "71,698.0", "+120.0 / +0.17%", "$123,456,789", "$345,678,901", "0.0010% 00:42:15"][index],
	valueClass: index === 2 ? "text-trading-panel-success" : undefined,
}));
const disc = <span className="size-[26px] rounded-full bg-fill-weak" />;
const realDisc = <span className="size-[26px] rounded-full bg-market-up" />;

function placeholderHead() {
	return (
		<>
			<AssetIconSlotView interactive icon={disc} />
			<TokenSelectorTriggerView {...MARKET_HEADER_PLACEHOLDER.trigger} />
		</>
	);
}

function sampleHead() {
	return (
		<>
			<AssetIconSlotView interactive icon={realDisc} aria-label="View asset information" />
			<TokenSelectorTriggerView
				{...MARKET_HEADER_PLACEHOLDER.trigger}
				pairName="BTC-USDC"
				kindBadge="Perp"
				leverageBadge="40x"
			/>
		</>
	);
}

describe("market header view parity", () => {
	it("reserves typical widths invisibly with no visible dash placeholders", () => {
		const container = document.createElement("div");
		container.innerHTML = renderToString(
			<>
				<FavoritesStripView {...FAVORITES_PLACEHOLDER} />
				<MarketHeaderView
					head={placeholderHead()}
					overview={<MarketOverviewView stats={MARKET_HEADER_PLACEHOLDER.stats} ariaLabel="Price" />}
				/>
			</>,
		);
		expect(
			[...container.querySelectorAll("[data-favorites-strip] .invisible")].map((node) => node.textContent),
		).toEqual(FAVORITES_PLACEHOLDER.items.map(() => "-0.00%"));
		expect([...container.querySelectorAll("[data-market-header] .invisible")].map((node) => node.textContent)).toEqual([
			"BTC-USDC",
			"Perp",
			"20x",
			"0,000.0",
			"0,000.0",
			"-0,000 / -0.00%",
			"$0,000,000,000.00",
			"$0,000,000,000.00",
			"+0.0000% 00:00:00",
		]);
		for (const node of container.querySelectorAll(".invisible")) node.remove();
		expect(container.textContent).not.toContain("—");
		expect([...container.querySelectorAll("span")].some((node) => node.textContent === "-")).toBe(false);
		expect(container.textContent).not.toMatch(/0[.,]00|Perp|20x/);
	});

	it("leaves actual fallback values visible and omits badges when undefined", () => {
		const container = document.createElement("div");
		container.innerHTML = renderToString(
			<>
				<TokenSelectorTriggerView
					{...MARKET_HEADER_PLACEHOLDER.trigger}
					pairName="BTC-USDC"
					kindBadge={undefined}
					leverageBadge={undefined}
				/>
				<MarketOverviewView
					ariaLabel="Price"
					stats={[
						{ id: "price", label: "Mark", value: "-", valueSample: "0,000.0" },
						{ id: "funding", label: "Funding", value: "—" },
					]}
				/>
			</>,
		);
		expect(container.querySelector(".invisible")).toBeNull();
		expect(container.querySelector("button")?.textContent).toBe("BTC-USDC");
		expect(container.querySelector('[data-market-stat="price"]')?.textContent).toBe("Mark-");
		expect(container.querySelector('[data-market-stat="funding"]')?.textContent).toBe("Funding—");
	});

	it("keeps favorite chips and remove controls mounted without handlers or change data", () => {
		const real = FAVORITES_PLACEHOLDER.items.map((item, index) => ({
			...item,
			active: index === 0,
			changeText: "+1.2%",
			changeTone: "up" as const,
		}));
		expect(geometry(<FavoritesStripView {...FAVORITES_PLACEHOLDER} />)).toEqual(
			geometry(<FavoritesStripView items={real} emptyLabel="收藏市场" onSelect={() => {}} onRemove={() => {}} />),
		);
		expect(geometry(<FavoritesStripView items={[]} emptyLabel="Select favorite markets" />)).toEqual(
			geometry(<FavoritesStripView items={[]} emptyLabel="选择收藏市场" onSelect={() => {}} />),
		);
	});

	it("shares the desktop button, caret and badge geometry", () => {
		expect(geometry(<TokenSelectorTriggerView {...MARKET_HEADER_PLACEHOLDER.trigger} />)).toEqual(
			geometry(
				<TokenSelectorTriggerView
					{...MARKET_HEADER_PLACEHOLDER.trigger}
					pairName="BTC-USDC"
					kindBadge="Perp"
					leverageBadge="40x"
					ref={createRef<HTMLButtonElement>()}
					onClick={() => {}}
				/>,
			),
		);
		const html = renderToString(
			<TokenSelectorTriggerView
				{...MARKET_HEADER_PLACEHOLDER.trigger}
				open
				role="combobox"
				aria-label="Select token"
			/>,
		);
		expect(html).toContain("rotate-180");
		expect(html).toContain('aria-expanded="true"');
		expect(html).toContain('role="combobox"');
	});

	it.each([true, false])("shares the asset slot geometry (interactive=%s)", (interactive) => {
		expect(geometry(<AssetIconSlotView interactive={interactive} icon={disc} />)).toEqual(
			geometry(<AssetIconSlotView interactive={interactive} icon={realDisc} aria-label="View asset information" />),
		);
	});

	it("shares the content-sized stat columns and scrolling region", () => {
		expect(geometry(<MarketOverviewView stats={MARKET_HEADER_PLACEHOLDER.stats} ariaLabel="Price" />)).toEqual(
			geometry(<MarketOverviewView stats={sampleStats} ariaLabel="BTC-USDC" />),
		);
		const html = renderToString(<MarketOverviewView stats={sampleStats} ariaLabel="BTC-USDC" />);
		expect(html).toContain("gap-8");
		expect(html).not.toMatch(/min-w-\[|w-max|min-w-full/);
		expect(html).toContain('tabindex="0"');
	});

	it.each([undefined, <span key="socials">Socials</span>])(
		"shares header slot layout with optional socials",
		(socials) => {
			expect(
				geometry(
					<MarketHeaderView
						head={placeholderHead()}
						socials={socials}
						overview={<MarketOverviewView stats={MARKET_HEADER_PLACEHOLDER.stats} ariaLabel="Price" />}
					/>,
				),
			).toEqual(
				geometry(
					<MarketHeaderView
						head={sampleHead()}
						socials={socials}
						overview={<MarketOverviewView stats={sampleStats} ariaLabel="BTC-USDC" />}
					/>,
				),
			);
		},
	);

	it("uses the same views in the shell and real grid panels", () => {
		const html = renderToString(<AppShellSkeleton />);
		expect(html).toContain("data-market-overview");
		expect(html).toContain("data-market-header");
		expect(html).toContain("data-favorites-strip");
		expect(html).toContain("BTC-USDC");
		expect(html).toContain("inert");
		const workspace = readFileSync(resolve(__dirname, "../../components/trade/layout/main-workspace.tsx"), "utf8");
		for (const view of ["FavoritesStripView", "MarketHeaderView"]) {
			expect(workspace).toMatch(new RegExp(`import \\{ ${view} \\}`));
			expect(workspace).toContain(`<${view}`);
		}
		expect(workspace).not.toContain("flex items-center overflow-hidden border-b border-stroke-weak bg-surface px-2");
		expect(workspace).not.toContain(
			"flex min-w-0 items-center overflow-hidden border-b border-trading-panel-stroke-row",
		);
		expect(workspace).not.toContain("[&>span]:size-9");
	});
});

it("forwards native button events and refs while retaining inert placeholder controls", () => {
	const container = document.createElement("div");
	const root = createRoot(container);
	const selected: string[] = [];
	const removed: string[] = [];
	const triggerRef = createRef<HTMLButtonElement>();
	try {
		act(() =>
			root.render(
				<>
					<FavoritesStripView
						{...FAVORITES_PLACEHOLDER}
						onSelect={(name) => selected.push(name)}
						onRemove={(name) => removed.push(name)}
						selectLabel={(name) => `Select ${name}`}
						removeLabel={(name) => `Remove ${name}`}
					/>
					<TokenSelectorTriggerView
						{...MARKET_HEADER_PLACEHOLDER.trigger}
						ref={triggerRef}
						onClick={() => selected.push("trigger")}
					/>
				</>,
			),
		);
		act(() => container.querySelector<HTMLButtonElement>('[aria-label="Select BTC"]')?.click());
		act(() => container.querySelector<HTMLButtonElement>('[aria-label="Remove BTC"]')?.click());
		act(() => triggerRef.current?.click());
		expect(selected).toEqual(["BTC", "trigger"]);
		expect(removed).toEqual(["BTC"]);
		expect(triggerRef.current?.tagName).toBe("BUTTON");
		expect(container.querySelector("button button")).toBeNull();
	} finally {
		act(() => root.unmount());
	}
});

it("reactively translates mounted runtime placeholders using the shared descriptors", () => {
	const i18n = setupI18n({ locale: "en", messages: { en: {} } });
	i18n.load("zh", {
		[MARKET_HEADER_LABELS.oracle.id as string]: "预言机",
		[MARKET_HEADER_LABELS.volume24h.id as string]: "24小时成交量",
		[MARKET_HEADER_LABELS.price.id as string]: "价格",
	});
	const container = document.createElement("div");
	const root = createRoot(container);
	try {
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<TerminalLoadingWorkspace />
				</I18nProvider>,
			),
		);
		const overview = container.querySelector("[data-market-overview]");
		const oracle = container.querySelector('[data-market-stat="oracle"]');
		expect(oracle?.textContent).toBe("Oracle0,000.0");
		act(() => i18n.activate("zh"));
		expect(container.querySelector("[data-market-overview]")).toBe(overview);
		expect(container.querySelector('[data-market-stat="oracle"]')).toBe(oracle);
		expect(oracle?.textContent).toBe("预言机0,000.0");
		expect(overview?.getAttribute("aria-label")).toBe("价格");
		expect(container.querySelector('[data-market-stat="volume24h"]')?.textContent).toBe(
			"24小时成交量$0,000,000,000.00",
		);
		act(() => i18n.activate("en"));
		expect(oracle?.textContent).toBe("Oracle0,000.0");
		expect(overview?.closest("[inert]")).not.toBeNull();
	} finally {
		act(() => root.unmount());
	}
});

it.each([
	["/trade/BTC", "BTC-USDC", "Perp", false, "BTC-USDC"],
	["/trade/ETH", "ETH-USDC", "Perp", false, "ETH-USDC"],
	["/trade/HYPE/USDC", "HYPE-USDC", "Spot", true, null],
	["/trade/xyz:SILVER", "SILVER-USDC", "xyz", false, null],
	["/trade/@107", null, "Spot", true, null],
	["/perp", null, null, false, null],
] as const)(
	"uses known route values in runtime placeholders at %s",
	(pathname, pairName, kindBadge, isSpot, activeLabel) => {
		route.pathname = pathname;
		const i18n = setupI18n({ locale: "en", messages: { en: {} } });
		const container = document.createElement("div");
		try {
			container.innerHTML = renderToString(
				<I18nProvider i18n={i18n}>
					<ExchangeScopeProvider>
						<TerminalLoadingWorkspace />
					</ExchangeScopeProvider>
				</I18nProvider>,
			);
			const trigger = container.querySelector("[data-market-header] button[aria-expanded]");
			const expectedTrigger = (
				<TokenSelectorTriggerView
					{...MARKET_HEADER_PLACEHOLDER.trigger}
					pairName={pairName}
					kindBadge={kindBadge}
					isSpot={isSpot}
				/>
			);
			expect(trigger?.outerHTML).toBe(
				renderToString(
					<TokenSelectorTriggerView
						{...MARKET_HEADER_PLACEHOLDER.trigger}
						pairName={pairName}
						kindBadge={kindBadge}
						isSpot={isSpot}
						aria-label="Price"
					/>,
				),
			);
			expect(geometry(expectedTrigger)).toEqual(
				geometry(
					<TokenSelectorTriggerView
						{...MARKET_HEADER_PLACEHOLDER.trigger}
						pairName={pairName ?? "BTC-USDC"}
						kindBadge={kindBadge ?? "Perp"}
						leverageBadge="40x"
						isSpot={isSpot}
					/>,
				),
			);
			const activeFavorites = container.querySelectorAll('[data-favorites-strip] [aria-pressed="true"]');
			expect(activeFavorites).toHaveLength(activeLabel ? 1 : 0);
			if (activeLabel) expect(activeFavorites[0].firstElementChild?.textContent).toBe(activeLabel);
			const shell = document.createElement("div");
			shell.innerHTML = renderToString(<AppShellSkeleton />);
			expect(shell.querySelector('[data-favorites-strip] [aria-pressed="true"]')).toBeNull();
		} finally {
			route.pathname = "/";
		}
	},
);
