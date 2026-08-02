import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { toast } from "sonner";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { downloadCsv } from "@/lib/csv";
import { getInfoClient } from "@/lib/hyperliquid";
import { getHttpStatus } from "@/lib/query-retry";
import { buildAccountLedgerRows, fetchAccountLedgerHistory } from "@/lib/trade/account-ledger";
import { useAccountLedgerLabels } from "./use-account-ledger-labels";

const MAX_RATE_LIMIT_RETRIES = 3;
const RATE_LIMIT_RETRY_DELAY_MS = 60_000;

interface AccountLedgerCsvResult {
	exportCsv: () => Promise<void>;
	isExporting: boolean;
}

export function useAccountLedgerCsv(): AccountLedgerCsvResult {
	const { t } = useLingui();
	const { address } = useWalletSession();
	const { getActionLabel, getLocationLabel } = useAccountLedgerLabels();
	const [isExporting, setIsExporting] = useState(false);

	async function exportCsv() {
		if (!address || isExporting) return;

		setIsExporting(true);
		const toastId = toast.loading(t`Exporting deposits and withdrawals...`);

		try {
			const client = getInfoClient();
			const { truncated, updates } = await fetchAccountLedgerHistory((startTime) =>
				fetchLedgerPageWithRetry(() => client.userNonFundingLedgerUpdates({ user: address, startTime })),
			);
			const rows = buildAccountLedgerRows(updates, address).sort((left, right) => left.time - right.time);
			const csvRows = [
				[t`Time`, t`Action`, t`Source`, t`Destination`, t`Account Value Change`, t`Fee`],
				...rows.map((row) => [
					new Date(row.time).toISOString(),
					getActionLabel(row.action),
					getLocationLabel(row.source),
					getLocationLabel(row.destination),
					`${row.amount} ${row.token}`,
					row.fee ? `${row.fee.amount} ${row.fee.token}` : "--",
				]),
			];
			const addressSuffix = address.slice(2, 10).toLowerCase();
			downloadCsv(`deposits_and_withdrawals_${addressSuffix}.csv`, csvRows);

			if (truncated) {
				toast.warning(t`CSV export reached the history limit. Some older records were not included.`, { id: toastId });
			} else {
				toast.success(t`CSV exported.`, { id: toastId });
			}
		} catch {
			toast.error(t`Failed to export deposits and withdrawals.`, { id: toastId });
		} finally {
			setIsExporting(false);
		}
	}

	return { exportCsv, isExporting };
}

async function fetchLedgerPageWithRetry<T>(request: () => Promise<T>): Promise<T> {
	let rateLimitRetries = 0;

	while (true) {
		try {
			return await request();
		} catch (error) {
			if (getHttpStatus(error) !== 429 || rateLimitRetries >= MAX_RATE_LIMIT_RETRIES) {
				throw error;
			}

			rateLimitRetries++;
			await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_RETRY_DELAY_MS));
		}
	}
}
