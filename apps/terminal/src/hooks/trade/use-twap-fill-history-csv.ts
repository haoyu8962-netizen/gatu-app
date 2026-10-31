import { useLingui } from "@lingui/react/macro";
import { toast } from "sonner";
import { FALLBACK_VALUE_PLACEHOLDER } from "@/config/app";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { buildCsvRows, downloadCsv } from "@/lib/csv";
import { formatDateTime } from "@/lib/format";
import { getInfoClient } from "@/lib/hyperliquid";
import { getNetwork } from "@/lib/network";
import { getFillDirectionPresentation } from "@/lib/trade/fill-direction";
import {
	fetchUserTwapSliceFillHistory,
	getTwapSliceFillsExportPacer,
	hasUserFillExplorerTransaction,
	type UserTwapSliceFillHistoryResult,
} from "@/lib/trade/user-fills";
import { isHistoryAbortError, useHistoryExportRunner } from "./use-history-csv-export";

const TWAP_FILL_HISTORY_CSV_FILENAME = "twap_fill_history.csv";

interface TwapFillHistoryCsvResult {
	exportCsv: () => Promise<void>;
	isExporting: boolean;
}

interface TwapSliceFillsCsvExportOptions {
	buildRows: (fills: UserTwapSliceFillHistoryResult["items"]) => readonly (readonly string[])[];
	filename: string;
}

export function useTwapFillHistoryCsv(): TwapFillHistoryCsvResult {
	const { i18n, t } = useLingui();

	const { address } = useWalletSession();

	function getDirection(fill: UserTwapSliceFillHistoryResult["items"][number]) {
		return getFillDirectionPresentation(fill, address, (descriptor) => t(descriptor));
	}

	return useTwapSliceFillsCsvExport({
		filename: TWAP_FILL_HISTORY_CSV_FILENAME,
		buildRows: (fills) =>
			buildCsvRows(fills, [
				{
					header: t`Time`,
					getValue: (fill) =>
						formatDateTime(fill.time, { locale: i18n.locale, dateStyle: "short", timeStyle: "short" }),
				},
				{ header: t`Asset`, getValue: (fill) => fill.coin },
				{
					header: t`Direction`,
					getValue: (fill) => getDirection(fill).label,
				},
				{ header: t`Type`, getValue: () => t`TWAP` },
				{ header: t`Price`, getValue: (fill) => fill.px },
				{ header: t`Size`, getValue: (fill) => fill.sz },
				{ header: t`Fee`, getValue: (fill) => fill.fee },
				{ header: t`Fee Token`, getValue: (fill) => fill.feeToken },
				{ header: t`PNL`, getValue: (fill) => fill.closedPnl },
				{
					header: t`Transaction`,
					getValue: (fill) => (hasUserFillExplorerTransaction(fill) ? fill.hash : FALLBACK_VALUE_PLACEHOLDER),
				},
			]),
	});
}

function useTwapSliceFillsCsvExport(options: TwapSliceFillsCsvExportOptions): TwapFillHistoryCsvResult {
	const { t } = useLingui();
	const { isExporting, run } = useHistoryExportRunner();

	async function exportCsv() {
		const toastId = toast.loading(t`Exporting TWAP fill history...`);

		try {
			const history = await run(async (address, signal) => {
				const client = getInfoClient();
				const endTime = Date.now();
				return fetchUserTwapSliceFillHistory(
					(startTime, pageEndTime, requestSignal) =>
						client.userTwapSliceFillsByTime({ endTime: pageEndTime, startTime, user: address }, requestSignal),
					{ endTime, pacer: getTwapSliceFillsExportPacer(getNetwork()), signal },
				);
			});
			if (!history) {
				toast.dismiss(toastId);
				return;
			}
			downloadCsv(options.filename, options.buildRows(history.items));

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
