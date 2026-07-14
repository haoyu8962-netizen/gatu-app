// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { i18n, type Messages } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageSwitcher } from "@/components/trade/header/language-switcher";
import { MobileBottomNav } from "@/components/trade/mobile/mobile-bottom-nav";
import { OrderbookPanel } from "@/components/trade/orderbook/orderbook-panel";
import { AccountPanel } from "@/components/trade/tradebox/account-panel";
import { OrderSummary } from "@/components/trade/tradebox/order-summary";
import { TradeOptionCheckboxes } from "@/components/trade/tradebox/trade-option-checkboxes";

const zhTranslations: Record<string, string> = {
	"Reduce Only": "只减仓",
	"Take Profit / Stop Loss": "止盈 / 止损",
	"TP/SL": "止盈止损",
	"Order Value": "订单价值",
	"Order Book": "订单簿",
	Price: "价格",
	Size: "数量",
	Total: "合计",
	"Portfolio Value": "投资组合价值",
	Withdraw: "提款",
	Language: "语言",
	"Primary navigation": "主导航",
	Markets: "市场",
	Trade: "交易",
	Account: "账户",
};

function getMessageId(message: string): string {
	return createHash("sha256").update(`${message}\x1f`).digest("base64").slice(0, 6);
}

const zhMessages: Messages = Object.fromEntries(
	Object.entries(zhTranslations).map(([message, translation]) => [getMessageId(message), translation]),
);

function activateLocale(locale: "en" | "zh") {
	i18n.loadAndActivate({ locale, messages: locale === "zh" ? zhMessages : {} });
}

vi.mock("@lingui/react/macro", async () => {
	const [{ createHash: hash }, linguiReact] = await Promise.all([import("node:crypto"), import("@lingui/react")]);
	return {
		useLingui: () => {
			const context = linguiReact.useLingui();
			const translate = context.i18n._.bind(context.i18n);
			return {
				...context,
				t: (strings: TemplateStringsArray, ...values: unknown[]) => {
					const message = strings.reduce((result, part, index) => `${result}${part}${values[index] ?? ""}`, "");
					const id = hash("sha256").update(`${message}\x1f`).digest("base64").slice(0, 6);
					return translate({ id, message });
				},
			};
		},
	};
});

vi.mock("@/lib/hyperliquid", () => ({
	getExplorerTxUrl: (hash: string) => `https://example.test/tx/${hash}`,
	useSelectedMarketInfo: () => ({
		data: { kind: "perp", markPx: "70", name: "HYPE", pairName: "HYPE-USDC", szDecimals: 2 },
	}),
	useSubscription: () => ({ data: undefined, error: null, status: "idle" }),
}));

vi.mock("@/lib/performance/render-profile", () => ({
	useRenderCommitTrack: () => {},
}));

vi.mock("@/lib/i18n", () => ({
	dynamicActivate: vi.fn(),
}));

vi.mock("@/components/trade/orderbook/use-orderbook-rows", () => ({
	useOrderbookRows: () => [4, { current: null }],
}));

vi.mock("@/stores/use-global-settings-store", () => ({
	getResolvedFormatLocale: () => "en-US",
	useGlobalSettings: () => ({ showOrderbookInQuote: false }),
	useGlobalSettingsActions: () => ({ setShowOrderbookInQuote: vi.fn() }),
}));

const balanceSnapshot = {
	accountAbstraction: "unifiedAccount",
	allDexClearinghouseStates: [],
	dex: "",
	marginSummary: { accountValue: "100" },
	perpSummary: { accountValue: "100" },
	spotAvailableAfterMaintenance: 0,
	spotBalances: [],
	withdrawable: "100",
};

vi.mock("@/hooks/trade/use-account-balances", () => ({
	useDefaultDexBalances: () => balanceSnapshot,
	useSelectedDexBalances: () => balanceSnapshot,
}));

vi.mock("@/domain/trade/balances", () => ({
	getAccountBalanceSummary: () => ({ accountEquity: 100 }),
	getPerpRiskSummary: () => ({ crossMaintenanceMarginUsed: 5, totalNtlPos: 20, unrealizedPnl: 2 }),
	isQuoteBalanceSharedWithPerps: () => true,
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({ isConnected: true, sessionMode: "wallet" }),
}));

vi.mock("@/hooks/use-geo-restriction", () => ({
	useGeoRestriction: () => ({ tradeRestricted: false }),
}));

vi.mock("@/stores/use-global-modal-store", () => ({
	useDepositModalActions: () => ({ open: vi.fn() }),
	useTransferModalActions: () => ({ open: vi.fn() }),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function TestSurface() {
	const [reduceOnly, setReduceOnly] = useState(false);

	return (
		<>
			<LanguageSwitcher />
			<MobileBottomNav activeTab="markets" onTabChange={() => {}} className="static" />
			<TradeOptionCheckboxes
				reduceOnly={{ checked: reduceOnly, disabled: false, onCheckedChange: setReduceOnly }}
				tpSl={{ checked: false, disabled: false, onCheckedChange: () => {} }}
			/>
			<OrderSummary
				liqPrice={65}
				liqWarning={false}
				orderValue={100}
				marginRequired={10}
				estimatedFee={0.05}
				feeRatePercent="0.0500%"
				slippagePercent={2.5}
				szDecimals={2}
				onSlippageClick={() => {}}
				orderType="limit"
			/>
			<div style={{ height: 320 }}>
				<OrderbookPanel />
			</div>
			<AccountPanel />
		</>
	);
}

describe("language hot switching", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		activateLocale("en");
		window.history.replaceState({}, "", "/trade/HYPE");
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.clearAllMocks();
	});

	it("updates labels and aria without remounting or losing checkbox state", () => {
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<TestSurface />
				</I18nProvider>,
			),
		);

		const checkbox = container.querySelector<HTMLElement>('[aria-label="Reduce Only"]');
		expect(checkbox).not.toBeNull();
		expect(checkbox?.getAttribute("aria-checked")).toBe("false");

		act(() => checkbox?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
		expect(checkbox?.getAttribute("aria-checked")).toBe("true");

		const originalCheckbox = checkbox;
		const originalMobileNav = container.querySelector<HTMLElement>('[aria-label="Primary navigation"]');
		const originalPath = window.location.pathname;
		act(() => activateLocale("zh"));

		expect(container.querySelector('[aria-label="语言"]')).not.toBeNull();
		const localizedCheckbox = container.querySelector<HTMLElement>('[aria-label="只减仓"]');
		expect(localizedCheckbox).toBe(originalCheckbox);
		expect(localizedCheckbox?.getAttribute("aria-checked")).toBe("true");
		expect(window.location.pathname).toBe(originalPath);
		expect(container.textContent).toContain("只减仓");
		expect(container.textContent).toContain("止盈止损");
		expect(container.textContent).toContain("订单价值");
		expect(container.textContent).toContain("价格");
		expect(container.textContent).toContain("数量");
		expect(container.textContent).toContain("合计");
		expect(container.textContent).toContain("投资组合价值");
		expect(container.querySelector('[aria-label="订单簿"]')).not.toBeNull();
		expect(container.querySelector('[aria-label="提款"]')).not.toBeNull();
		const localizedMobileNav = container.querySelector<HTMLElement>('[aria-label="主导航"]');
		expect(localizedMobileNav).toBe(originalMobileNav);
		expect(localizedMobileNav?.textContent).toContain("市场");
		expect(localizedMobileNav?.textContent).toContain("交易");
		expect(localizedMobileNav?.textContent).toContain("账户");
	});
});
