import { Button } from "@sairn/ui";
import { i18n } from "@lingui/core";
import { useLingui } from "@lingui/react/macro";
import { useEffect, useState } from "react";
import { Responsive, useContainerWidth } from "react-grid-layout";
import { useDesktopGridLayout } from "@/components/trade/layout/use-desktop-grid-layout";
import { OrderSummary } from "@/components/trade/tradebox/order-summary";
import { ScaleOrderSummary } from "@/components/trade/tradebox/scale-order-summary";
import { TradeFormFields } from "@/components/trade/tradebox/trade-form-fields";
import { TradeHeader } from "@/components/trade/tradebox/trade-header";
import { TradePanelBodyView } from "@/components/trade/tradebox/trade-panel-body-view";
import { TwapOrderSummary } from "@/components/trade/tradebox/twap-order-summary";
import { buildOrderFeeQuote } from "@/domain/trade/order-fee-quote";
import { resolveTwapPriceInputs } from "@/domain/trade/twap-details";
import { createI18nRoot } from "@/lib/tests/harness/react";
import { toNumberOrZero } from "@/lib/trade/numbers";
import { messages as englishMessages } from "@/locales/en/messages.po";
import { messages as chineseMessages } from "@/locales/zh/messages.po";
import {
	useOrderEntryActions,
	useOrderSide,
	useOrderSize,
	useOrderType,
	useScaleEnd,
	useScaleLevels,
	useScaleSkew,
	useScaleStart,
	useSizeMode,
	useTwapAdvancedEnabled,
	useTwapMinutes,
	useTwapStopPrice,
	useTwapTriggerPrice,
} from "@/stores/use-order-entry-store";
import "react-grid-layout/css/styles.css";
import "./mobile-orderbook-cls.css";
import "./desktop-grid-layout.css";

const feeQuote = buildOrderFeeQuote({
	orderValue: 0,
	protocolRate: "0.00045",
	builderFeeTenthsBps: 0,
	marketKind: "perp",
	side: "buy",
	execution: "order",
});

type SizeMessageWindow = Window & { __sairnSetSizeMessage?: (message: string) => void };

interface FixtureTradePanelProps {
	feedback: boolean;
	hasPosition: boolean;
	sizeMessage: string;
}

function FixtureTradePanel({ feedback, hasPosition, sizeMessage }: FixtureTradePanelProps) {
	const { t } = useLingui();
	const actions = useOrderEntryActions();
	const orderType = useOrderType();
	const side = useOrderSide();
	const size = useOrderSize();
	const sizeMode = useSizeMode();
	const scaleStart = useScaleStart();
	const scaleEnd = useScaleEnd();
	const scaleLevels = useScaleLevels();
	const scaleSkew = useScaleSkew();
	const twapMinutes = useTwapMinutes();
	const twapAdvancedEnabled = useTwapAdvancedEnabled();
	const twapTriggerPrice = useTwapTriggerPrice();
	const twapStopPrice = useTwapStopPrice();
	const { triggerPx, stopPx } = resolveTwapPriceInputs(twapAdvancedEnabled, twapTriggerPrice, twapStopPrice, {
		assetId: 0,
		szDecimals: 2,
	});
	const [requests, setRequests] = useState(0);
	const orderEntryData = {
		availableBalance: 1_000,
		baseToken: "CLS_HYPE",
		capabilities: {
			allowsCrossMargin: true,
			hasFunding: true,
			hasMarginMode: true,
			hasReduceOnly: true,
			hasTpSl: true,
			isCanonical: null,
			isLeveraged: true,
			isOnlyIsolated: false,
			maxLeverage: 50,
		},
		displayAvailableBalance: 1_000,
		displayAvailableBalanceToken: "USDC",
		hasAvailabilityError: false,
		isAvailabilityBlocked: false,
		isBalanceAvailabilityBlocked: false,
		isAvailabilityLoading: false,
		isAvailabilityStale: false,
		isSpotMarket: false,
		leverage: 10,
		leverageInteractionIdentity: "fixture:perp:CLS_HYPE",
		maxSize: 10,
		orderValue: 0,
		quoteToken: "USDC",
		sizeModeLabel: sizeMode === "base" ? "CLS_HYPE" : "USDC",
		sizeValue: toNumberOrZero(size),
		szDecimals: 2,
	};

	function summary() {
		if (orderType === "scale") {
			return (
				<ScaleOrderSummary
					compact
					scaleStart={toNumberOrZero(scaleStart)}
					scaleEnd={toNumberOrZero(scaleEnd)}
					scaleLevels={scaleLevels}
					scaleSkew={toNumberOrZero(scaleSkew)}
					orderValue={0}
					marginRequired={0}
					feeQuote={feeQuote}
					szDecimals={2}
				/>
			);
		}
		if (orderType === "twap") {
			return (
				<TwapOrderSummary
					compact
					twapMinutesNum={twapMinutes}
					twapTriggerPriceNum={toNumberOrZero(triggerPx)}
					twapStopPriceNum={toNumberOrZero(stopPx)}
					side={side}
					feeQuote={feeQuote}
					szDecimals={2}
				/>
			);
		}
		return (
			<OrderSummary
				compact
				liqPrice={null}
				liqWarning={false}
				orderValue={0}
				marginRequired={0}
				takerFeeQuote={feeQuote}
				makerFeeQuote={feeQuote}
				slippagePercent={2.5}
				szDecimals={2}
				onSlippageClick={() => {}}
				orderType={orderType}
			/>
		);
	}

	return (
		<div
			className="h-full"
			data-order-type={orderType}
		>
			<TradePanelBodyView
				header={
					<TradeHeader
						compact
						orderType={orderType}
						side={side}
						sideLabels={{ buy: t`Long`, sell: t`Short`, buyAria: t`Buy Long`, sellAria: t`Sell Short` }}
						marketKind="perp"
						onOrderTypeChange={actions.setOrderType}
						onSideChange={actions.setSide}
						marginMode="cross"
						leverage={10}
						isLeveraged
						accountMode="disabled"
					/>
				}
				footer={
					<>
						<div className="flex flex-col gap-3">
							{feedback && (
								<p className="text-xs text-error">
									The requested order could not be submitted. Check the selected account and retry the action.
								</p>
							)}
							<Button
								variant="filled"
								size="xs"
								intent="neutral"
								className="w-full rounded-[12px] px-3 py-2.5 text-sm font-bold whitespace-nowrap shadow-none"
								aria-label="Fixture order action"
								onClick={() => setRequests((value) => value + 1)}
							>
								{t`Connect Wallet`}
							</Button>
							<output className="sr-only" aria-label="Fixture action count">
								{requests}
							</output>
						</div>
						<div data-fixture-summary className="border-t border-trading-panel-stroke-row pt-1">
							{summary()}
						</div>
					</>
				}
			fields={
				<TradeFormFields
					orderEntryData={orderEntryData}
					visibleValidationErrors={
						sizeMessage
							? [
									{
										id: "fixture-size-message",
										code: "INP_004",
										severity: "error",
										category: "input",
										priority: 1,
										message: sizeMessage,
									},
								]
							: []
					}
					price={100.05}
					positionSize={hasPosition ? 0.25 : 0}
					swapTargetToken={null}
					onSizeModeToggle={actions.toggleSizeMode}
					onSizePercentApply={(percent) => actions.setSize(String(percent / 10))}
					onSwapClick={() => {}}
				/>
			} />
		</div>
	);
}

function Fixture() {
	const { width, containerRef, mounted } = useContainerWidth({ measureBeforeMount: true });
	const { gridProps } = useDesktopGridLayout(width, mounted);
	const [feedback, setFeedback] = useState(false);
	const [hasPosition, setHasPosition] = useState(false);
	const [sizeMessage, setSizeMessage] = useState("");
	useEffect(() => {
		const fixtureWindow = window as SizeMessageWindow;
		fixtureWindow.__sairnSetSizeMessage = setSizeMessage;
		return () => {
			delete fixtureWindow.__sairnSetSizeMessage;
		};
	}, []);
	return (
		<>
			<nav>
				<button type="button" onClick={() => i18n.activate("en")}>
					English
				</button>
				<button type="button" onClick={() => i18n.activate("zh")}>
					中文
				</button>
				<button type="button" onClick={() => setFeedback((value) => !value)}>
					Toggle feedback
				</button>
				<button type="button" onClick={() => setHasPosition((value) => !value)}>
					Toggle position
				</button>
			</nav>
			<main ref={containerRef}>
				{mounted && (
					<Responsive {...gridProps}>
						<div key="favoriteCoins" data-panel="favoriteCoins">
							Favorites
						</div>
						<div key="coinInfo" data-panel="coinInfo">
							Market information
						</div>
						<div key="chart" data-panel="chart">
							Chart
						</div>
						<div key="marketData" data-panel="marketData">
							Market data
						</div>
						<div key="tradingInterface" data-panel="tradingInterface">
							<FixtureTradePanel feedback={feedback} hasPosition={hasPosition} sizeMessage={sizeMessage} />
						</div>
						<div key="accountTable" data-panel="accountTable">
							Account table
						</div>
						<div key="accountInfo" data-panel="accountInfo">
							Account information
						</div>
					</Responsive>
				)}
			</main>
		</>
	);
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing fixture root");
i18n.load("en", englishMessages);
i18n.load("zh", chineseMessages);
i18n.activate("en");
createI18nRoot(root).render(<Fixture />);
