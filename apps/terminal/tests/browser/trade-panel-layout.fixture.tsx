import { i18n } from "@lingui/core";
import { useState } from "react";
import { Responsive, useContainerWidth } from "react-grid-layout";
import { useDesktopGridLayout } from "@/components/trade/layout/use-desktop-grid-layout";
import { OrderSummary } from "@/components/trade/tradebox/order-summary";
import { TradePanelBody } from "@/components/trade/tradebox/trade-panel-body";
import { buildOrderFeeQuote } from "@/domain/trade/order-fee-quote";
import { createI18nRoot } from "@/lib/tests/harness/react";
import "react-grid-layout/css/styles.css";
import "./mobile-orderbook-cls.css";
import "./desktop-grid-layout.css";

const feeQuote = buildOrderFeeQuote({
	orderValue: 0,
	protocolRate: 0.00045,
	builderFeeTenthsBps: 0,
	marketKind: "perp",
	side: "buy",
	execution: "order",
});

function Fixture() {
	const { width, containerRef, mounted } = useContainerWidth({ measureBeforeMount: true });
	const { gridProps } = useDesktopGridLayout(width, mounted);
	const [mode, setMode] = useState<"market" | "limit" | "tall">("market");
	const [showFeedback, setShowFeedback] = useState(false);
	const [longFeedback, setLongFeedback] = useState(false);
	const [connectClicks, setConnectClicks] = useState(0);
	const [price, setPrice] = useState("");
	return (
		<>
			<nav>
				{(["market", "limit", "tall"] as const).map((value) => (
					<button key={value} type="button" onClick={() => setMode(value)}>
						{value}
					</button>
				))}
				<button type="button" onClick={() => setShowFeedback((value) => !value)}>
					Toggle feedback
				</button>
				<button type="button" onClick={() => setLongFeedback((value) => !value)}>
					Toggle long feedback
				</button>
				<output aria-label="Connection requests">{connectClicks}</output>
			</nav>
			<main ref={containerRef}>
				{mounted ? (
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
							<div style={{ height: "100%" }}>
								<div className="trade-panel-container flex h-full flex-col bg-surface">
									<TradePanelBody
										footer={
											<>
												<div className="flex flex-col gap-3">
													{showFeedback || longFeedback ? (
														<div style={{ height: longFeedback ? 950 : 60 }}>Requested action feedback</div>
													) : null}
													<button
														type="button"
														style={{ height: 44 }}
														onClick={() => setConnectClicks((value) => value + 1)}
													>
														Connect Wallet
													</button>
												</div>
												<div className="border-t border-trading-panel-stroke-row pt-1">
													<OrderSummary
														liqPrice={null}
														liqWarning={false}
														orderValue={0}
														marginRequired={0}
														takerFeeQuote={feeQuote}
														makerFeeQuote={feeQuote}
														slippagePercent={2.5}
														szDecimals={3}
														onSlippageClick={() => {}}
														orderType={mode === "limit" ? "limit" : "market"}
													/>
												</div>
											</>
										}
									>
										<div data-slot="fixture-trade-header" style={{ height: 150 }}>
											Trade controls
										</div>
										<div
											data-slot="fixture-trade-fields"
											className="flex flex-col"
											style={{ height: mode === "tall" ? 850 : mode === "limit" ? 300 : 200 }}
										>
											{mode === "limit" ? (
												<label>
													Price
													<input
														aria-label="Limit price"
														value={price}
														onChange={(event) => setPrice(event.target.value)}
													/>
												</label>
											) : (
												"Order size"
											)}
											<label className="mt-auto">
												Last field
												<input aria-label="Last field" />
											</label>
										</div>
									</TradePanelBody>
								</div>
							</div>
						</div>
						<div key="accountTable" data-panel="accountTable">
							Account table
						</div>
						<div key="accountInfo" data-panel="accountInfo">
							Account
						</div>
					</Responsive>
				) : null}
			</main>
		</>
	);
}

const element = document.getElementById("root");
if (!element) throw new Error("Missing fixture root");
i18n.loadAndActivate({ locale: "en", messages: {} });
createI18nRoot(element).render(<Fixture />);
