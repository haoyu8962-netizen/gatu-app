// @vitest-environment jsdom
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { i18n, type Messages } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommandMenu } from "@/components/trade/components/command-menu";

const mocks = vi.hoisted(() => ({ markets: [] as unknown[] }));

vi.mock("@/components/ui/command", () => ({
	CommandDialog: ({ title, description, children }: { title: string; description: string; children: ReactNode }) => (
		<div data-title={title} data-description={description}>
			{children}
		</div>
	),
	CommandInput: ({ placeholder }: { placeholder: string }) => <input placeholder={placeholder} readOnly />,
	CommandList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	CommandEmpty: ({ children }: { children: ReactNode }) => <p data-empty="">{children}</p>,
	CommandItem: ({ children }: { children: ReactNode }) => <div data-item="">{children}</div>,
}));

vi.mock("@/components/trade/components/asset-display", () => ({
	AssetDisplay: ({ coin }: { coin: string }) => <span>{coin}</span>,
}));

vi.mock("@/lib/hyperliquid", () => ({ useMarketsInfo: () => ({ markets: mocks.markets }) }));
vi.mock("@/hooks/trade/use-market-navigation", () => ({ useMarketNavigation: () => vi.fn() }));
vi.mock("@/stores/use-global-modal-store", () => ({
	useCommandMenuOpen: () => true,
	useCommandMenuActions: () => ({ close: vi.fn() }),
}));

const MENU_MESSAGES = [
	"Search markets",
	"Search for a market to trade",
	"Search markets...",
	"No markets found.",
	"Perp",
	"Spot",
];

function readChineseMessages(): Messages {
	const catalog = readFileSync(resolve(__dirname, "../../locales/zh/messages.po"), "utf8");
	return Object.fromEntries(
		MENU_MESSAGES.map((message) => {
			const match = new RegExp(`\\nmsgid "${message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"\\nmsgstr "(.+)"\\n`).exec(
				catalog,
			);
			if (!match) throw new Error(`no Chinese translation for ${message}`);
			return [createHash("sha256").update(`${message}\x1f`).digest("base64").slice(0, 6), match[1]];
		}),
	);
}

describe("command menu", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
		mocks.markets = [
			{ kind: "perp", name: "BTC", shortName: "BTC", pairName: "BTC-USDC", szDecimals: 5, markPx: "77559.123" },
			{
				kind: "spot",
				name: "@107",
				shortName: "HYPE",
				pairName: "HYPE/USDC",
				tokensInfo: [{ name: "HYPE" }, { name: "USDC" }],
				szDecimals: 0,
				markPx: "0.12345678",
			},
			{
				kind: "builderPerp",
				name: "xyz:AAPL",
				shortName: "AAPL",
				pairName: "AAPL-USDC",
				dex: "xyz",
				quoteToken: null,
				szDecimals: 2,
				markPx: "0.123456",
			},
		];
		i18n.loadAndActivate({ locale: "zh", messages: readChineseMessages() });
		container = document.createElement("div");
		document.body.append(container);
		root = createRoot(container);
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<CommandMenu />
				</I18nProvider>,
			),
		);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		i18n.loadAndActivate({ locale: "en", messages: {} });
	});

	it("names the dialog, the search field and the empty result in the interface language", () => {
		const dialog = container.querySelector<HTMLElement>("[data-title]");

		expect(dialog?.dataset.title).toBe("搜索市场");
		expect(dialog?.dataset.description).toBe("搜索要交易的市场");
		expect(container.querySelector("input")?.placeholder).toBe("搜索市场...");
		expect(container.querySelector("[data-empty]")?.textContent).toBe("未找到市场。");
	});

	it("labels each market kind like the market selector and prices spot markets with spot decimals", () => {
		const rows = [...container.querySelectorAll("[data-item]")].map((row) => row.textContent);

		expect(rows).toEqual(["BTC$77,559.1永续", "@107$0.12345678现货", "xyz:AAPL$0.1235xyz"]);
	});
});
