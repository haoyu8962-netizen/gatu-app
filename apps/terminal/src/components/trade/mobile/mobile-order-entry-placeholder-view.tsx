import { getInputClassName } from "@/components/ui/input-styles";
import { cn } from "@/lib/cn";
import { TradeSliderView } from "../components/trade-slider-view";
import type { MOBILE_ORDER_ENTRY_PLACEHOLDER } from "../layout/mobile-placeholders";
import { SideToggleView } from "../tradebox/side-toggle-view";
import { TradeCheckboxView } from "../tradebox/trade-checkbox-view";
import { TradeCtaView } from "../tradebox/trade-cta-view";
import { TradeOptionCheckboxesView } from "../tradebox/trade-option-checkboxes-view";
import { TRADE_PERCENT_INPUT_CLASS, TradePercentFrameView } from "../tradebox/trade-percent-frame-view";
import { MobileTradeAvailableView } from "./mobile-trade-available-view";
import { MobileTradeCtaFrameView } from "./mobile-trade-cta-frame-view";
import { MobileTradeFrameView, MobileTradeScrollAreaView, tradeColumn } from "./mobile-trade-frame-view";
import { MobileOrderTypeTriggerView, MobileTradeHeaderView } from "./mobile-trade-header-view";
import { MobileTradeSizeView, sizePercent } from "./mobile-trade-size-view";
import { MobileSlippageRowView, MobileSummaryRowView, MobileTradeSummaryView } from "./mobile-trade-summary-view";

interface Props {
	data: typeof MOBILE_ORDER_ENTRY_PLACEHOLDER;
}
export function MobileOrderEntryPlaceholderView({ data }: Props) {
	const { labels } = data;
	return (
		<MobileTradeFrameView embedded className={tradeColumn}>
			<MobileTradeScrollAreaView embedded>
				<MobileTradeHeaderView
					isLeveraged={data.isLeveraged}
					marginLabel={labels.cross}
					leverage={1}
					orderTypeControl={
						<div className="min-w-0">
							<MobileOrderTypeTriggerView label={labels.market} />
						</div>
					}
					sideToggle={<SideToggleView mobile side={data.side} labels={data.sideLabels} />}
				/>
				<MobileTradeAvailableView
					label={labels.available}
					value={data.availableValue}
					token={data.availableToken}
					disabled
				/>
				<MobileTradeSizeView
					label={labels.size}
					unit={data.sizeUnit}
					disabled
					slider={
						<TradeSliderView
							dir={data.direction}
							inputId="mobile-placeholder-size-slider"
							ariaLabel={`${labels.size} (%)`}
							showTicks
							ticks={[0, 25, 50, 75, 100]}
							progress={0}
							rtl={data.direction === "rtl"}
							unavailable
							inputProps={{ min: 0, max: 100, step: 1, defaultValue: 0, disabled: true, "aria-valuetext": "0%" }}
						/>
					}
					percent={
						<TradePercentFrameView
							frameClassName={sizePercent}
							input={
								<input
									type="text"
									dir="ltr"
									inputMode="numeric"
									data-slot="input"
									data-size="sm"
									defaultValue="0"
									disabled
									min={0}
									max={100}
									aria-label={`${labels.size} (%)`}
									className={getInputClassName(
										"sm",
										cn("w-full", TRADE_PERCENT_INPUT_CLASS, "text-trading-panel-subtle"),
										true,
									)}
								/>
							}
						/>
					}
				/>
				<TradeOptionCheckboxesView
					tradingPanel
					mobile
					embedded
					reduceOnly={
						data.isLeveraged ? <TradeCheckboxView label={labels.reduceOnly} ariaLabel={labels.reduceOnly} /> : undefined
					}
					tpSl={
						data.isLeveraged ? <TradeCheckboxView spanAll label={labels.tpSl} ariaLabel={labels.tpSlAria} /> : undefined
					}
				/>
				<MobileTradeSummaryView embedded>
					{data.isLeveraged && (
						<MobileSummaryRowView label={labels.liqPrice} value="-" valueClass="text-trading-panel-muted" compact />
					)}
					<MobileSummaryRowView label={labels.orderValue} value="-" compact />
					{data.isLeveraged && <MobileSummaryRowView label={labels.marginRequired} value="-" compact />}
					<MobileSlippageRowView labels={labels} value="-" slippagePercent={data.slippagePercent} embedded />
					<MobileSummaryRowView
						label={labels.estimatedFee}
						value={<span className="whitespace-nowrap">{data.feeValue}</span>}
						valueClass="min-w-0 flex-1 shrink whitespace-normal text-trading-panel-muted"
						compact
					/>
				</MobileTradeSummaryView>
			</MobileTradeScrollAreaView>
			<MobileTradeCtaFrameView embedded>
				<TradeCtaView mobile embedded variant="cyan" label={data.cta} />
			</MobileTradeCtaFrameView>
		</MobileTradeFrameView>
	);
}
