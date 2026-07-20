import { t } from "@lingui/core/macro";
import { TrendDownIcon, TrendUpIcon } from "@phosphor-icons/react";
import { useMemo } from "react";
import { NumberInput } from "@/components/ui/number-input";
import { SL_QUICK_PERCENT_OPTIONS, TP_QUICK_PERCENT_OPTIONS } from "@/config/trade";
import { getRiskRewardRatio } from "@/domain/market";
import { cn } from "@/lib/cn";
import { formatUSD, szDecimalsToPriceDecimals } from "@/lib/format";
import { isPositive, toNumber } from "@/lib/trade/numbers";
import {
	calculateEstimatedPnl,
	calculateSlPrice,
	calculateSlPriceFromRoe,
	calculateTpPrice,
	calculateTpPriceFromRoe,
	formatRiskRewardRatio,
} from "@/lib/trade/tpsl";
import { PriceInputWithPercent } from "./price-input-with-percent";

interface Props {
	side: "buy" | "sell";
	referencePrice: number;
	size: number;
	szDecimals?: number;
	tpPrice: string;
	slPrice: string;
	onTpPriceChange: (value: string) => void;
	onSlPriceChange: (value: string) => void;
	tpError?: string | null;
	slError?: string | null;
	disabled?: boolean;
	compact?: boolean;
	quickPercentMode?: "price" | "roe";
	leverage?: number;
}

export function TpSlSection({
	side,
	referencePrice,
	size,
	szDecimals,
	tpPrice,
	slPrice,
	onTpPriceChange,
	onSlPriceChange,
	tpError,
	slError,
	disabled,
	compact,
	quickPercentMode = "price",
	leverage,
}: Props) {
	const tpPriceNum = toNumber(tpPrice);
	const slPriceNum = toNumber(slPrice);

	const tpPnl = useMemo(() => {
		if (!isPositive(tpPriceNum) || !isPositive(referencePrice) || !isPositive(size)) return null;
		return calculateEstimatedPnl({ referencePrice, side, size }, tpPriceNum);
	}, [tpPriceNum, referencePrice, side, size]);

	const slPnl = useMemo(() => {
		if (!isPositive(slPriceNum) || !isPositive(referencePrice) || !isPositive(size)) return null;
		return calculateEstimatedPnl({ referencePrice, side, size }, slPriceNum);
	}, [slPriceNum, referencePrice, side, size]);

	const riskRewardRatio = useMemo(() => getRiskRewardRatio(tpPnl, slPnl), [tpPnl, slPnl]);

	const riskRewardDisplay = useMemo(() => {
		if (riskRewardRatio === null || tpPnl === null || slPnl === null) return null;
		const rrDisplay = formatRiskRewardRatio(riskRewardRatio);
		if (!rrDisplay) return null;
		return { rrDisplay, tpPnl, slPnl };
	}, [riskRewardRatio, tpPnl, slPnl]);

	const priceDecimals = szDecimalsToPriceDecimals(szDecimals ?? 4);
	const quickPercentDisabled = quickPercentMode === "roe" && !isPositive(leverage);

	function handleTpPercentClick(percent: number) {
		const price =
			quickPercentMode === "roe"
				? calculateTpPriceFromRoe(referencePrice, side, percent, leverage, priceDecimals)
				: calculateTpPrice(referencePrice, side, percent, priceDecimals);
		if (price) onTpPriceChange(price);
	}

	function handleSlPercentClick(percent: number) {
		const price =
			quickPercentMode === "roe"
				? calculateSlPriceFromRoe(referencePrice, side, percent, leverage, priceDecimals)
				: calculateSlPrice(referencePrice, side, percent, priceDecimals);
		if (price) onSlPriceChange(price);
	}

	if (compact) {
		return (
			<div className="rounded-8 min-w-0 border border-stroke-weak/50 bg-surface p-2.5">
				<div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))] gap-2">
					<div className="min-w-0">
						<NumberInput
							label={t`Take Profit`}
							placeholder={t`TP Price`}
							value={tpPrice}
							onChange={(e) => onTpPriceChange(e.target.value)}
							className={cn(
								"w-full box-border bg-background text-xs tabular-nums",
								!!tpError && "border-stroke-error-strong focus:border-stroke-error-strong",
							)}
							disabled={disabled}
						/>
						{tpError && <div className="mt-1 text-xs text-error">{tpError}</div>}
					</div>
					<div className="min-w-0">
						<NumberInput
							label={t`Stop Loss`}
							placeholder={t`SL Price`}
							value={slPrice}
							onChange={(e) => onSlPriceChange(e.target.value)}
							className={cn(
								"w-full box-border bg-background text-xs tabular-nums",
								!!slError && "border-stroke-error-strong focus:border-stroke-error-strong",
							)}
							disabled={disabled}
						/>
						{slError && <div className="mt-1 text-xs text-error">{slError}</div>}
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="min-w-0 space-y-4 py-1">
			<PriceInputWithPercent
				label={t`Take Profit`}
				icon={TrendUpIcon}
				value={tpPrice}
				onChange={onTpPriceChange}
				percentOptions={TP_QUICK_PERCENT_OPTIONS}
				onPercentClick={handleTpPercentClick}
				pnlValue={tpPnl}
				error={tpError}
				disabled={disabled}
				quickPercentDisabled={quickPercentDisabled}
				referencePrice={referencePrice}
			/>

			<PriceInputWithPercent
				label={t`Stop Loss`}
				icon={TrendDownIcon}
				value={slPrice}
				onChange={onSlPriceChange}
				percentOptions={SL_QUICK_PERCENT_OPTIONS}
				onPercentClick={handleSlPercentClick}
				pnlValue={slPnl}
				error={slError}
				disabled={disabled}
				quickPercentDisabled={quickPercentDisabled}
				referencePrice={referencePrice}
			/>

			{riskRewardDisplay && (
				<div className="rounded-8 space-y-2 border border-stroke-weak/40 bg-surface p-2.5">
					<div className="flex min-w-0 items-center justify-between gap-2">
						<span className="min-w-0 truncate text-xs text-fg">{t`Risk/Reward`}</span>
						<span
							className={cn(
								"shrink-0 whitespace-nowrap text-xs font-semibold tabular-nums",
								riskRewardDisplay.rrDisplay.isFavorable ? "text-success" : "text-warning",
							)}
						>
							{riskRewardDisplay.rrDisplay.label}
						</span>
					</div>
					<div className="flex h-1.5 rounded-full overflow-hidden bg-surface">
						<div
							className="bg-error"
							style={{
								width: `${(riskRewardDisplay.rrDisplay.risk / (riskRewardDisplay.rrDisplay.risk + riskRewardDisplay.rrDisplay.reward)) * 100}%`,
							}}
						/>
						<div
							className="bg-success-soft"
							style={{
								width: `${(riskRewardDisplay.rrDisplay.reward / (riskRewardDisplay.rrDisplay.risk + riskRewardDisplay.rrDisplay.reward)) * 100}%`,
							}}
						/>
					</div>
					<div className="flex flex-wrap items-center justify-between gap-2 text-xs">
						<span className="whitespace-nowrap tabular-nums text-error">
							{formatUSD(riskRewardDisplay.slPnl, { signDisplay: "exceptZero" })}
						</span>
						<span className="whitespace-nowrap tabular-nums text-success">
							{formatUSD(riskRewardDisplay.tpPnl, { signDisplay: "exceptZero" })}
						</span>
					</div>
				</div>
			)}
		</div>
	);
}
