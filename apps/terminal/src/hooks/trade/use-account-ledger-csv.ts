import { useLingui } from "@lingui/react/macro";
import { toast } from "sonner";
import { downloadCsv } from "@/lib/csv";
import { getInfoClient } from "@/lib/hyperliquid";
import {
	buildAccountLedgerRows,
	fetchAccountLedgerHistory,
	getAccountLedgerSubAccounts,
	getAccountLedgerUsdcBridge,
} from "@/lib/trade/account-ledger";
import { fetchHistoryPageWithRetry } from "@/lib/trade/history-pagination";
import { useIsTestnet } from "@/stores/use-global-settings-store";
import { useAccountLedgerLabels } from "./use-account-ledger-labels";
import { isHistoryAbortError, useHistoryExportRunner } from "./use-history-csv-export";

interface AccountLedgerCsvResult {
	exportCsv: () => Promise<void>;
	isExporting: boolean;
}

export function useAccountLedgerCsv(): AccountLedgerCsvResult {
	const { t } = useLingui();
	const { getActionLabel, getLocationLabel } = useAccountLedgerLabels();
	const { isExporting, run } = useHistoryExportRunner();
	const isTestnet = useIsTestnet();

	async function exportCsv() {
		const toastId = toast.loading(t`Exporting deposits and withdrawals...`);

		try {
			const result = await run(async (address, signal) => {
				const client = getInfoClient();
				const endTime = Date.now();
				const history = await fetchAccountLedgerHistory(
					(startTime, pageEndTime, pageSignal) =>
						fetchHistoryPageWithRetry(
							(requestSignal) =>
								client.userNonFundingLedgerUpdates({ endTime: pageEndTime, startTime, user: address }, requestSignal),
							{ signal: pageSignal },
						),
					{ endTime, signal },
				);
				const subAccounts = await client.subAccounts({ user: address }, signal).catch(() => null);
				return { history, owner: address, subAccounts };
			});
			if (!result) {
				toast.dismiss(toastId);
				return;
			}
			const { history, owner, subAccounts } = result;
			const { truncated, updates } = history;
			const rows = buildAccountLedgerRows(
				updates,
				owner,
				getAccountLedgerUsdcBridge(isTestnet),
				getAccountLedgerSubAccounts(subAccounts),
			).sort((left, right) => left.time - right.time);
			const csvRows = [
				[t`Time`, t`Action`, t`Source`, t`Destination`, t`Account Value Change`, t`Fee`],
				...rows.map((row) => [
					new Date(row.time).toISOString(),
					getActionLabel(row.action, row.rawType),
					getLocationLabel(row.source),
					getLocationLabel(row.destination),
					row.amount === null ? "--" : `${row.amount}${row.token ? ` ${row.token}` : ""}`,
					row.fee ? `${row.fee.amount} ${row.fee.token}` : "--",
				]),
			];
			const addressSuffix = owner.slice(2, 10).toLowerCase();
			downloadCsv(`deposits_and_withdrawals_${addressSuffix}.csv`, csvRows);

			if (truncated) {
				toast.warning(t`CSV export reached the history limit. Some records were not included.`, { id: toastId });
			} else {
				toast.success(t`CSV exported.`, { id: toastId });
			}
		} catch (error) {
			if (isHistoryAbortError(error)) toast.dismiss(toastId);
			else toast.error(t`Failed to export deposits and withdrawals.`, { id: toastId });
		}
	}

	return { exportCsv, isExporting };
}
