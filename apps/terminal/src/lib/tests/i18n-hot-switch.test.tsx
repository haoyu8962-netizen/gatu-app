// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { i18n, type Messages } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, type ReactNode, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageSwitcher } from "@/components/trade/header/language-switcher";
import { ThemeToggle } from "@/components/trade/header/theme-toggle";
import { MobileBottomNav } from "@/components/trade/mobile/mobile-bottom-nav";
import { OrderbookPanel } from "@/components/trade/orderbook/orderbook-panel";
import { PositionsTab } from "@/components/trade/positions/positions-tab";
import { AccountPanel } from "@/components/trade/tradebox/account-panel";
import { OrderConfirmationModal } from "@/components/trade/tradebox/order-confirmation-modal";
import { OrderSummary } from "@/components/trade/tradebox/order-summary";
import { TradeFormTif } from "@/components/trade/tradebox/trade-form-tif";
import { TradeOptionCheckboxes } from "@/components/trade/tradebox/trade-option-checkboxes";
import { FALLBACK_VALUE_PLACEHOLDER } from "@/config/app";
import type { OrderConfirmationDraft } from "@/domain/trade/order-confirmation";
import { buildOrderFeeQuote } from "@/domain/trade/order-fee-quote";
import { useOrderDisplayLabels } from "@/hooks/trade/use-order-display-labels";
import { useOrderEntryActions, useTif } from "@/stores/use-order-entry-store";

const zhTranslations: Record<string, string> = {
	Type: "类型",
	Side: "方向",
	Long: "多",
	Short: "空",
	"Post Only": "只挂单",
	"Connect your wallet to view positions.": "连接钱包查看仓位。",
	"Switch to dark mode": "切换到深色模式",
	"Switch to light mode": "切换到浅色模式",
	"Reduce Only": "只减仓",
	"Take Profit / Stop Loss": "止盈 / 止损",
	"TP/SL": "止盈止损",
	"Order Value": "订单价值",
	"Est. Slippage": "预估滑点",
	Slippage: "滑点",
	"Order Book": "订单簿",
	Price: "价格",
	Size: "数量",
	Total: "合计",
	"Portfolio Value": "投资组合价值",
	"Cross Maintenance Margin": "全仓维持保证金",
	Withdraw: "提款",
	Language: "语言",
	"Language and number format": "语言和数字格式",
	"Primary navigation": "主导航",
	Markets: "市场",
	Trade: "交易",
	Account: "账户",
	"Stop Market": "止损市价",
	"Price above {price}": "价格高于 {price}",
	Canceled: "已取消",
	Rejected: "已拒绝",
	"TWAP Slice": "TWAP 分片",
	"Vault Close": "金库平仓",
	"Spot Dust Conversion": "现货零头转换",
	Buy: "买入",
	"Close Long": "平多",
	"Close Short": "平空",
	Sell: "卖出",
	Trigger: "触发",
};

function getMessageId(message: string, context = ""): string {
	return createHash("sha256").update(`${message}\x1f${context}`).digest("base64").slice(0, 6);
}

const zhMessages: Messages = Object.fromEntries(
	Object.entries(zhTranslations).map(([message, translation]) => [getMessageId(message), translation]),
);
zhMessages[getMessageId("Limit", "Order type")] = "限价";

function activateLocale(locale: "en" | "zh") {
	i18n.loadAndActivate({ locale, messages: locale === "zh" ? zhMessages : {} });
}

vi.mock("@/lib/hyperliquid", () => ({
	getExplorerTxUrl: (hash: string) => `https://example.test/tx/${hash}`,
	useHyperliquid: () => ({ clientKey: "disconnected", env: "Mainnet" }),
	useMarkets: () => ({ builderPerp: [], getToken: () => ({ index: 0 }) }),
	useMarketsInfo: () => ({ getMarketInfo: () => undefined }),
	useUserPositions: () => ({ positions: [], isLoading: false, hasError: false, isStale: false }),
	useSelectedMarketInfo: () => ({
		data: { kind: "perp", markPx: "70", name: "HYPE", pairName: "HYPE-USDC", szDecimals: 2 },
	}),
	useSubscription: () => ({ data: undefined, error: null, status: "idle" }),
}));

vi.mock("@/hooks/trade/use-spot-token-usd-prices", () => ({
	useSpotTokenUsdPriceState: () => ({ prices: undefined, status: "success" }),
	useSpotTokenUsdPrices: () => undefined,
}));

vi.mock("@/lib/performance/render-profile", () => ({
	useRenderCommitTrack: () => {},
}));

vi.mock("@/lib/i18n", () => ({
	dynamicActivate: vi.fn(),
}));

vi.mock("@/components/trade/orderbook/use-orderbook-rows", () => ({
	useOrderbookRows: () => [{ rowCount: 4, fullRowCount: 4, rowHeightPx: 23 }, { current: null }],
}));

vi.mock(import("../../stores/use-global-settings-store"), async (importOriginal) => {
	const actual = await importOriginal();
	return {
		...actual,
		getResolvedFormatLocale: () => "en-US",
		useGlobalSettings: () => ({
			...actual.useGlobalSettings(),
			numberFormatLocale: "en-US" as const,
			showOrderbookInQuote: false,
		}),
		useGlobalSettingsActions: () => ({
			...actual.useGlobalSettingsActions(),
			setNumberFormatLocale: vi.fn(),
			setShowOrderbookInQuote: vi.fn(),
		}),
		useIsTestnet: () => false,
		useTheme: () => "light" as const,
		useSetTheme: () => vi.fn(),
	};
});

vi.mock("@/hooks/trade/use-market-navigation", () => ({ useMarketNavigation: () => vi.fn() }));
vi.mock("@/hooks/trade/use-position-market-close-action", () => ({
	usePositionMarketCloseAction: () => ({ open: vi.fn(), pendingAssetId: null }),
}));
vi.mock("@/components/trade/positions/position-close-all-modal", () => ({ PositionCloseAllController: () => null }));
vi.mock("@/components/trade/positions/position-isolated-margin-modal", () => ({
	PositionIsolatedMarginModal: () => null,
}));
vi.mock("@/components/trade/positions/position-limit-close-modal", () => ({ PositionLimitCloseModal: () => null }));
vi.mock("@/components/trade/positions/position-pnl-share-modal", () => ({ PositionPnlShareModal: () => null }));
vi.mock("@/components/trade/positions/position-reverse-confirmation-controller", () => ({
	PositionReverseConfirmationController: () => null,
}));
vi.mock("@/components/trade/positions/position-tpsl-modal", () => ({ PositionTpSlModal: () => null }));
vi.mock("@/components/trade/components/trading-action-button", () => ({
	TradingActionButton: ({ children, onClick }: { children: ReactNode; onClick: () => void }) => (
		<button type="button" onClick={onClick}>
			{children}
		</button>
	),
}));

const balanceSnapshot = {
	accountAbstraction: "unifiedAccount",
	allDexClearinghouseStates: [],
	dex: "",
	hasAllDexsSnapshot: true,
	hasSpotStateSnapshot: true,
	isLoading: false,
	marginSummary: { accountValue: "100" },
	perpSummary: { accountValue: "100" },
	perpPositions: [],
	crossMaintenanceMarginUsed: "0",
	portfolioMarginRatio: null,
	spotAvailableAfterMaintenance: 0,
	spotBalances: [],
	withdrawable: "100",
	hasError: false,
	isDataStale: false,
	perpStateStatus: "success",
	perpStateReceivedAt: Date.now(),
	spotStateStatus: "success",
	spotStateReceivedAt: Date.now(),
};

const bridgeEntryState = vi.hoisted(() => ({
	hasExistingExecution: false,
}));

const walletState = vi.hoisted(() => ({ isConnected: true }));

vi.mock("@/hooks/trade/use-account-balances", () => ({
	isSupportedAccountAbstraction: (value: unknown) =>
		value === "disabled" || value === "unifiedAccount" || value === "portfolioMargin",
	useDefaultDexBalances: () => balanceSnapshot,
	useSelectedDexBalances: () => balanceSnapshot,
}));

vi.mock("@/domain/trade/balances", () => ({
	accountOverviewNeedsTokenUsdPrices: () => false,
	getAccountBalanceSummary: () => ({ accountEquity: 150000, mode: "unified" }),
	getAccountEquityValue: () => "150000",
	getSpotAccountValueUsdValue: () => "150000",
	getTokenAmountUsdValue: () => "150000",
	getPerpRiskSummary: () => ({ crossMaintenanceMarginUsed: 12000, totalNtlPos: 200000, unrealizedPnl: 20000 }),
	getPerpRiskSummaryValue: () => ({
		crossMaintenanceMarginUsed: "12000",
		totalMarginUsed: "12000",
		totalNtlPos: "200000",
		unrealizedPnl: "20000",
	}),
	getPerpRiskSummaryUsdValue: () => ({
		crossMaintenanceMarginUsed: "12000",
		totalMarginUsed: "12000",
		totalNtlPos: "200000",
		unrealizedPnl: "20000",
	}),
	getUnifiedAccountMarginRatioValue: () => "0.08",
	isQuoteBalanceSharedWithPerps: () => true,
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({
		hasWalletAccess: true,
		isConnected: walletState.isConnected,
		sessionMode: "wallet",
		walletAddress: "0x1111111111111111111111111111111111111111",
	}),
}));

vi.mock("@/hooks/trade/use-deposit-availability", () => ({
	useDepositAvailability: () => ({
		available: true,
		path: "external",
		reason: null,
		unavailableLabel: "Deposit unavailable",
		unavailableReason: null,
	}),
}));

vi.mock("@/lib/lifi/bridge-execution-state", () => ({
	useHasExistingBridgeExecution: () => bridgeEntryState.hasExistingExecution,
}));

vi.mock("@/hooks/use-geo-restriction", () => ({
	useGeoRestriction: () => ({ actionsBlocked: false, tradeRestricted: false }),
}));

vi.mock("@/stores/use-global-modal-store", () => ({
	useDepositModalActions: () => ({ open: vi.fn() }),
	useTransferModalActions: () => ({ open: vi.fn() }),
}));

Object.assign(globalThis, {
	IS_REACT_ACT_ENVIRONMENT: true,
	ResizeObserver: class ResizeObserverMock {
		disconnect() {}
		observe() {}
		unobserve() {}
	},
});

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
				orderValue={150000}
				marginRequired={12000}
				takerFeeQuote={buildOrderFeeQuote({
					orderValue: 150000,
					protocolRate: 0.0005,
					builderFeeTenthsBps: 10,
					marketKind: "perp",
					side: "buy",
					execution: "order",
				})}
				makerFeeQuote={buildOrderFeeQuote({
					orderValue: 150000,
					protocolRate: 0.00015,
					builderFeeTenthsBps: 10,
					marketKind: "perp",
					side: "buy",
					execution: "order",
				})}
				slippagePercent={2.5}
				estimatedSlippage={{ avgPx: 100.37, exceedsVisibleDepth: false, refPx: 100, slippageBps: 37 }}
				szDecimals={2}
				onSlippageClick={() => {}}
				orderType="market"
			/>
			<div style={{ height: 320 }}>
				<OrderbookPanel />
			</div>
			<AccountPanel />
			<OrderLabelsProbe />
		</>
	);
}

function OrderLabelsProbe() {
	const {
		getAdvancedOrderTypeLabel,
		getHistoricalOrderStatusLabel,
		getOrderSideLabel,
		getOrderTypeLabel,
		getQueueOrderTypeLabel,
		getTriggerConditionLabel,
	} = useOrderDisplayLabels();

	return (
		<div data-testid="order-labels">
			<span data-label="type">{getOrderTypeLabel("Stop Market")}</span>
			<span data-label="twap-slice">{getOrderTypeLabel("Twap Slice")}</span>
			<span data-label="vault-close">{getOrderTypeLabel("Vault Close")}</span>
			<span data-label="spot-dust-conversion">{getOrderTypeLabel("Spot Dust Conversion")}</span>
			<span data-label="unknown-type">
				{getOrderTypeLabel("Unexpected Type" as Parameters<typeof getOrderTypeLabel>[0])}
			</span>
			<span data-label="advanced">{getAdvancedOrderTypeLabel("stopMarket")}</span>
			<span data-label="condition">{getTriggerConditionLabel("Price above 70")}</span>
			<span data-label="status">{getHistoricalOrderStatusLabel("internalCancel")}</span>
			<span data-label="rejected-status">{getHistoricalOrderStatusLabel("tooManyOpenOrdersRejected")}</span>
			<span data-label="buy-side">{getOrderSideLabel("B", false)}</span>
			<span data-label="sell-side">{getOrderSideLabel("A", false)}</span>
			<span data-label="close-short-side">{getOrderSideLabel("B", true)}</span>
			<span data-label="close-long-side">{getOrderSideLabel("A", true)}</span>
			<span data-label="queue-type">{getQueueOrderTypeLabel("trigger")}</span>
		</div>
	);
}

function TifSurface() {
	const { setTif } = useOrderEntryActions();
	const tif = useTif();
	return (
		<>
			<button type="button" onClick={() => setTif("Alo")}>
				Select Alo
			</button>
			<output data-testid="tif-value">{tif}</output>
			<TradeFormTif orderType="limit" disabled={false} />
		</>
	);
}

const confirmationDraft: OrderConfirmationDraft = {
	assetId: 0,
	marketLabel: "BTC-USDC",
	marketKind: "perp",
	isLeveraged: false,
	side: "buy",
	orderType: "limit",
	tif: "Alo",
	baseToken: "BTC",
	szDecimals: 4,
	sizeValue: 0.5,
	orderValue: 50_000,
	limitPrice: 100_000,
	triggerPrice: null,
	scaleStartPrice: null,
	scaleEndPrice: null,
	scaleLevels: null,
	scaleSkew: null,
	twapMinutes: null,
	twapRandomize: false,
	twapTriggerPrice: null,
	twapStopPrice: null,
	tpSlEnabled: false,
	tpPrice: null,
	slPrice: null,
	reduceOnly: false,
	leverage: null,
	marginMode: "cross",
	marginRequired: 0,
	feeQuote: buildOrderFeeQuote({
		orderValue: 50_000,
		protocolRate: 0.00015,
		builderFeeTenthsBps: 10,
		marketKind: "perp",
		side: "buy",
		execution: "order",
	}),
	liqPrice: null,
	liqWarning: false,
	slippagePercent: 2.5,
};

describe("language hot switching", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		activateLocale("en");
		bridgeEntryState.hasExistingExecution = false;
		walletState.isConnected = true;
		Object.defineProperty(window, "matchMedia", {
			configurable: true,
			value: vi.fn().mockReturnValue({
				addEventListener: vi.fn(),
				matches: false,
				removeEventListener: vi.fn(),
			}),
		});
		window.history.replaceState({}, "", "/trade/HYPE");
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	it("updates disconnected position text, theme aria and the selected TIF without remounting", () => {
		walletState.isConnected = false;
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<ThemeToggle />
					<TifSurface />
					<PositionsTab directionFilter="all" marketFilter={{ type: "all" }} currentMarket={null} />
				</I18nProvider>,
			),
		);
		const selectAlo = [...container.querySelectorAll("button")].find((button) => button.textContent === "Select Alo");
		act(() => selectAlo?.click());
		const selector = container.querySelector('[aria-label="TIF: Post Only"]');
		const theme = container.querySelector('[aria-label="Switch to dark mode"]');
		expect(selector).not.toBeNull();
		expect(theme).not.toBeNull();
		expect(container.textContent).toContain("Connect your wallet to view positions.");

		act(() => activateLocale("zh"));
		expect(container.textContent).toContain("连接钱包查看仓位。");
		expect(container.textContent).not.toContain("Connect your wallet to view positions.");
		expect(container.querySelector('[aria-label="TIF: 只挂单"]')).toBe(selector);
		expect(container.querySelector('[aria-label="切换到深色模式"]')).toBe(theme);
		expect(container.querySelector('[data-testid="tif-value"]')?.textContent).toBe("Alo");

		act(() => activateLocale("en"));
		expect(container.textContent).toContain("Connect your wallet to view positions.");
		expect(container.querySelector('[aria-label="TIF: Post Only"]')).toBe(selector);
		expect(container.querySelector('[aria-label="Switch to dark mode"]')).toBe(theme);
		expect(container.querySelector('[data-testid="tif-value"]')?.textContent).toBe("Alo");
	});

	it.each([
		{ marketKind: "perp", side: "buy", english: "Long", chinese: "多" },
		{ marketKind: "perp", side: "sell", english: "Short", chinese: "空" },
		{ marketKind: "spot", side: "buy", english: "Buy", chinese: "买入" },
		{ marketKind: "spot", side: "sell", english: "Sell", chinese: "卖出" },
	] as const)(
		"hot-switches a stable $marketKind $side confirmation without sending it",
		({ marketKind, side, english, chinese }) => {
			const onConfirm = vi.fn();
			const draft = { ...confirmationDraft, marketKind, side };
			act(() =>
				root.render(
					<I18nProvider i18n={i18n}>
						<OrderConfirmationModal
							open
							draft={draft}
							isSubmitting={false}
							dontShowAgain={false}
							onDontShowAgainChange={() => {}}
							onConfirm={onConfirm}
							onOpenChange={() => {}}
						/>
					</I18nProvider>,
				),
			);
			const rows = document.querySelector('[data-testid="order-confirmation-rows"]');
			expect(rows?.textContent).toContain("Limit · Post Only");
			expect(rows?.textContent).toContain(`Side${english}`);
			const cta = [...document.querySelectorAll("button")].find((button) => button.textContent === english);
			expect(cta).not.toBeUndefined();
			act(() => activateLocale("zh"));
			expect(document.querySelector('[data-testid="order-confirmation-rows"]')).toBe(rows);
			expect(rows?.textContent).toContain("类型限价 · 只挂单");
			expect(rows?.textContent).toContain(`方向${chinese}`);
			expect(cta?.textContent).toBe(chinese);
			expect(rows?.textContent).toContain("$50,000.00");
			act(() => activateLocale("en"));
			expect(document.querySelector('[data-testid="order-confirmation-rows"]')).toBe(rows);
			expect(rows?.textContent).toContain("TypeLimit · Post Only");
			expect(rows?.textContent).toContain(`Side${english}`);
			expect(cta?.textContent).toBe(english);
			expect(draft.tif).toBe("Alo");
			expect(draft.side).toBe(side);
			expect(onConfirm).not.toHaveBeenCalled();
		},
	);

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
		expect(container.textContent).toContain("$150,000.00");
		expect(container.textContent).toContain("$12,000.00");
		expect(container.textContent).toContain("Est. Slippage");
		expect(container.textContent).toContain("0.37%");
		expect(container.textContent).toContain("Slippage");
		expect(container.textContent).toContain("2.5%");

		act(() => checkbox?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
		expect(checkbox?.getAttribute("aria-checked")).toBe("true");

		const originalCheckbox = checkbox;
		const originalMobileNav = container.querySelector<HTMLElement>('[aria-label="Primary navigation"]');
		const originalPath = window.location.pathname;
		act(() => activateLocale("zh"));

		expect(container.querySelector('[aria-label="语言和数字格式"]')).not.toBeNull();
		const localizedCheckbox = container.querySelector<HTMLElement>('[aria-label="只减仓"]');
		expect(localizedCheckbox).toBe(originalCheckbox);
		expect(localizedCheckbox?.getAttribute("aria-checked")).toBe("true");
		expect(window.location.pathname).toBe(originalPath);
		expect(container.textContent).toContain("只减仓");
		expect(container.textContent).toContain("止盈止损");
		expect(container.textContent).toContain("订单价值");
		expect(container.textContent).toContain("预估滑点");
		expect(container.textContent).toContain("滑点");
		expect(container.textContent).toContain("价格");
		expect(container.textContent).toContain("数量");
		expect(container.textContent).toContain("合计");
		expect(container.textContent).toContain("投资组合价值");
		expect(container.textContent).toContain("全仓维持保证金");
		expect(container.querySelector('[aria-label="订单簿"]')).not.toBeNull();
		expect(container.querySelector('[aria-label="提款"]')).not.toBeNull();
		const localizedMobileNav = container.querySelector<HTMLElement>('[aria-label="主导航"]');
		expect(localizedMobileNav).toBe(originalMobileNav);
		expect(localizedMobileNav?.textContent).toContain("市场");
		expect(localizedMobileNav?.textContent).toContain("交易");
		expect(localizedMobileNav?.textContent).toContain("账户");
		const orderLabels = container.querySelector('[data-testid="order-labels"]');
		expect(orderLabels?.querySelector('[data-label="type"]')?.textContent).toBe("止损市价");
		expect(orderLabels?.querySelector('[data-label="twap-slice"]')?.textContent).toBe("TWAP 分片");
		expect(orderLabels?.querySelector('[data-label="vault-close"]')?.textContent).toBe("金库平仓");
		expect(orderLabels?.querySelector('[data-label="spot-dust-conversion"]')?.textContent).toBe("现货零头转换");
		expect(orderLabels?.querySelector('[data-label="unknown-type"]')?.textContent).toBe(FALLBACK_VALUE_PLACEHOLDER);
		expect(orderLabels?.querySelector('[data-label="advanced"]')?.textContent).toBe("止损市价");
		expect(orderLabels?.querySelector('[data-label="condition"]')?.textContent).toBe("价格高于 70");
		expect(orderLabels?.querySelector('[data-label="status"]')?.textContent).toBe("已取消");
		expect(orderLabels?.querySelector('[data-label="rejected-status"]')?.textContent).toBe("已拒绝");
		expect(orderLabels?.querySelector('[data-label="buy-side"]')?.textContent).toBe("买入");
		expect(orderLabels?.querySelector('[data-label="sell-side"]')?.textContent).toBe("卖出");
		expect(orderLabels?.querySelector('[data-label="close-short-side"]')?.textContent).toBe("平空");
		expect(orderLabels?.querySelector('[data-label="close-long-side"]')?.textContent).toBe("平多");
		expect(orderLabels?.querySelector('[data-label="queue-type"]')?.textContent).toBe("触发");
	});

	it("hides the desktop bridge entry while creation is gated and restores it for an existing execution", () => {
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<AccountPanel />
				</I18nProvider>,
			),
		);
		expect(container.querySelector('[aria-label="Bridge"]')).toBeNull();

		bridgeEntryState.hasExistingExecution = true;
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<AccountPanel />
				</I18nProvider>,
			),
		);
		expect(container.querySelector('[aria-label="Bridge"]')).not.toBeNull();
	});
});
