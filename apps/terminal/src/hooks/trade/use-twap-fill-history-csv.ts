import { useLingui } from "@lingui/react/macro";
import { toast } from "sonner";
import { FALLBACK_VALUE_PLACEHOLDER } from "@/config/app";
import { getToolbarNonZeroPnl } from "@/domain/trade/trading-toolbar-metrics";
import { buildCsvRows, downloadCsv } from "@/lib/csv";
import { formatDateTimeShort, formatNumber, formatToken, formatUSD } from "@/lib/format";
import { getInfoClient, useMarkets } from "@/lib/hyperliquid";
import { fetchHistoryPageWithRetry } from "@/lib/trade/history-pagination";
import {
	fetchUserTwapSliceFillHistory,
	hasUserFillExplorerTransaction,
	TWAP_SLICE_FILLS_EXPORT_RATE_LIMIT_FALLBACK_MS,
} from "@/lib/trade/user-fills";
import { isHistoryAbortError, useHistoryExportRunner } from "./use-history-csv-export";

const TWAP_FILL_HISTORY_CSV_FILENAME = "twap_fill_history.csv";

interface TwapFillHistoryCsvResult {
	exportCsv: () => Promise<void>;
	isExporting: boolean;
}

export function useTwapFillHistoryCsv(): TwapFillHistoryCsvResult {
	const { t } = useLingui();
	const markets = useMarkets();
	const { isExporting, run } = useHistoryExportRunner();

	function getDirectionLabel(direction: string) {
		if (direction === "Open Long") return t`Open Long`;
		if (direction === "Close Long") return t`Close Long`;
		if (direction === "Open Short") return t`Open Short`;
		if (direction === "Close Short") return t`Close Short`;
		return direction;
	}

	async function exportCsv() {
		const toastId = toast.loading(t`Exporting TWAP fill history...`);

		try {
			const history = await run(async (address, signal) => {
				const client = getInfoClient();
				const endTime = Date.now();
				return fetchUserTwapSliceFillHistory(
					(startTime, pageEndTime, pageSignal) =>
						fetchHistoryPageWithRetry(
							(requestSignal) =>
								client.userTwapSliceFillsByTime({ endTime: pageEndTime, startTime, user: address }, requestSignal),
							{ rateLimitFallbackMs: TWAP_SLICE_FILLS_EXPORT_RATE_LIMIT_FALLBACK_MS, signal: pageSignal },
						),
					{ endTime, signal },
				);
			});
			if (!history) {
				toast.dismiss(toastId);
				return;
			}
			downloadCsv(
				TWAP_FILL_HISTORY_CSV_FILENAME,
				buildCsvRows(history.items, [
					{ header: t`Time`, getValue: (fill) => formatDateTimeShort(fill.time) },
					{ header: t`Asset`, getValue: (fill) => fill.coin },
					{
						header: t`Direction`,
						getValue: (fill) => (fill.liquidation ? t`Liquidated` : getDirectionLabel(fill.dir)),
					},
					{ header: t`Type`, getValue: () => t`TWAP` },
					{ header: t`Price`, getValue: (fill) => formatUSD(fill.px) },
					{ header: t`Size`, getValue: (fill) => formatNumber(fill.sz, markets.getSzDecimals(fill.coin)) },
					{ header: t`Fee`, getValue: (fill) => formatToken(fill.fee, { symbol: fill.feeToken }) },
					{
						header: t`PNL`,
						getValue: (fill) => {
							const closedPnl = getToolbarNonZeroPnl(fill.closedPnl);
							return closedPnl ? formatUSD(closedPnl, { signDisplay: "exceptZero" }) : FALLBACK_VALUE_PLACEHOLDER;
						},
					},
					{
						header: t`Transaction`,
						getValue: (fill) => (hasUserFillExplorerTransaction(fill) ? fill.hash : FALLBACK_VALUE_PLACEHOLDER),
					},
				]),
			);

			if (history.truncated) {
				toast.warning(t`CSV export reached the history limit. Some records were not included.`, { id: toastId });
			} else {
				toast.success(t`CSV exported.`, { id: toastId });
			}
		} catch (error) {
			if (isHistoryAbortError(error)) toast.dismiss(toastId);
			else toast.error(t`Failed to export TWAP fill history.`, { id: toastId });
		}
	}

	return { exportCsv, isExporting };
}
