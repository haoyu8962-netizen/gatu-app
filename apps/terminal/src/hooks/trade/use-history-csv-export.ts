import { useLingui } from "@lingui/react/macro";
import type { HistoricalOrdersResponse, UserFillsResponse, UserFundingResponse } from "@nktkas/hyperliquid";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { downloadCsv } from "@/lib/csv";
import { getInfoClient } from "@/lib/hyperliquid";
import { isValidHistoricalOrderHistoryItem } from "@/lib/trade/historical-orders";
import {
	fetchHistoryPageWithRetry,
	fetchTimeRangeHistory,
	MalformedHistoryPageError,
} from "@/lib/trade/history-pagination";
import { getUserFillKey, isValidUserFillHistoryItem } from "@/lib/trade/user-fills";
import {
	getUserFundingKey,
	isValidUserFunding,
	normalizeUserFundingResponse,
	type UserFunding,
} from "@/lib/trade/user-funding";
import { useIsTestnet } from "@/stores/use-global-settings-store";

const USER_FILLS_API_LIMIT = 10_000;
const HISTORICAL_ORDERS_API_LIMIT = 2_000;

interface CsvExportOptions<T> {
	buildRows: (items: T[]) => readonly (readonly string[])[];
	filename: string;
}

interface CsvExportResult {
	exportCsv: () => Promise<void>;
	isExporting: boolean;
}

interface HistoryLoadResult<T> {
	items: T[];
	truncated: boolean;
}

export function isHistoryAbortError(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	return error.name === "AbortError" || (error.cause !== error && isHistoryAbortError(error.cause));
}

export function useHistoryExportRunner() {
	const { address, isConnected } = useWalletSession();
	const isTestnet = useIsTestnet();
	const identity = isConnected && address ? `${isTestnet ? "testnet" : "mainnet"}:${address.toLowerCase()}` : null;
	const identityRef = useRef(identity);
	const controllerRef = useRef<AbortController | null>(null);
	const mountedRef = useRef(false);
	const [isExporting, setIsExporting] = useState(false);
	identityRef.current = identity;

	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
			controllerRef.current?.abort();
		};
	}, []);

	useEffect(() => {
		if (identityRef.current !== identity) return;
		controllerRef.current?.abort();
	}, [identity]);

	async function run<T>(load: (address: `0x${string}`, signal: AbortSignal) => Promise<T>): Promise<T | null> {
		if (!address || !identity || controllerRef.current) return null;
		const capturedIdentity = identity;
		const controller = new AbortController();
		controllerRef.current = controller;
		setIsExporting(true);

		try {
			const result = await load(address, controller.signal);
			if (controller.signal.aborted || identityRef.current !== capturedIdentity) return null;
			return result;
		} finally {
			if (controllerRef.current === controller) {
				controllerRef.current = null;
				if (mountedRef.current) setIsExporting(false);
			}
		}
	}

	return { isExporting, run };
}

export function useFundingHistoryCsvExport(options: CsvExportOptions<UserFunding>): CsvExportResult {
	const { t } = useLingui();
	const { isExporting, run } = useHistoryExportRunner();

	async function exportCsv() {
		const toastId = toast.loading(t`Exporting funding history...`);
		try {
			const result = await run<HistoryLoadResult<UserFunding>>(async (address, signal) => {
				const client = getInfoClient();
				const endTime = Date.now();
				return fetchTimeRangeHistory({
					endTime,
					fetchPage: async (startTime, pageEndTime, pageSignal) => {
						const response = await fetchHistoryPageWithRetry(
							(requestSignal) => client.userFunding({ endTime: pageEndTime, startTime, user: address }, requestSignal),
							{ signal: pageSignal },
						);
						return normalizeUserFundingResponse(response as UserFundingResponse);
					},
					getKey: getUserFundingKey,
					getTime: (funding) => funding.time,
					signal,
					validateItem: isValidUserFunding,
				});
			});
			if (!result) {
				toast.dismiss(toastId);
				return;
			}
			downloadCsv(options.filename, options.buildRows(result.items));
			if (result.truncated) {
				toast.warning(t`CSV export reached the history limit. Some records were not included.`, {
					id: toastId,
				});
			} else {
				toast.success(t`CSV exported.`, { id: toastId });
			}
		} catch (error) {
			if (isHistoryAbortError(error)) toast.dismiss(toastId);
			else toast.error(t`Failed to export funding history.`, { id: toastId });
		}
	}

	return { exportCsv, isExporting };
}

export function useUserFillsCsvExport(options: CsvExportOptions<UserFillsResponse[number]>): CsvExportResult {
	const { t } = useLingui();
	const { isExporting, run } = useHistoryExportRunner();

	async function exportCsv() {
		const toastId = toast.loading(t`Exporting trade history...`);
		try {
			const result = await run<HistoryLoadResult<UserFillsResponse[number]>>(async (address, signal) => {
				const client = getInfoClient();
				const endTime = Date.now();
				return fetchTimeRangeHistory({
					endTime,
					fetchPage: (startTime, pageEndTime, pageSignal) =>
						fetchHistoryPageWithRetry(
							(requestSignal) =>
								client.userFillsByTime(
									{ aggregateByTime: true, endTime: pageEndTime, startTime, user: address },
									requestSignal,
								),
							{ signal: pageSignal },
						),
					getKey: getUserFillKey,
					getTime: (fill) => fill.time,
					maxItems: USER_FILLS_API_LIMIT,
					signal,
					validateItem: isValidUserFillHistoryItem,
				});
			});
			if (!result) {
				toast.dismiss(toastId);
				return;
			}
			downloadCsv(options.filename, options.buildRows(result.items));
			if (result.truncated) {
				toast.warning(
					t`CSV contains Hyperliquid's latest 10,000 fills. Older fills are unavailable through this API.`,
					{
						id: toastId,
					},
				);
			} else {
				toast.success(t`CSV exported.`, { id: toastId });
			}
		} catch (error) {
			if (isHistoryAbortError(error)) toast.dismiss(toastId);
			else toast.error(t`Failed to export trade history.`, { id: toastId });
		}
	}

	return { exportCsv, isExporting };
}

export function useHistoricalOrdersCsvExport(
	options: CsvExportOptions<HistoricalOrdersResponse[number]>,
): CsvExportResult {
	const { t } = useLingui();
	const { isExporting, run } = useHistoryExportRunner();

	async function exportCsv() {
		const toastId = toast.loading(t`Exporting order history...`);
		try {
			const orders = await run<HistoricalOrdersResponse>(async (address, signal) => {
				const client = getInfoClient();
				return fetchHistoryPageWithRetry((requestSignal) => client.historicalOrders({ user: address }, requestSignal), {
					signal,
				});
			});
			if (!orders) {
				toast.dismiss(toastId);
				return;
			}
			if (!Array.isArray(orders) || orders.some((entry) => !isValidHistoricalOrderHistoryItem(entry))) {
				throw new MalformedHistoryPageError();
			}
			downloadCsv(options.filename, options.buildRows(orders));
			if (orders.length >= HISTORICAL_ORDERS_API_LIMIT) {
				toast.warning(
					t`CSV contains Hyperliquid's latest 2,000 orders. Older orders are unavailable through this API.`,
					{
						id: toastId,
					},
				);
			} else {
				toast.success(t`CSV exported. Hyperliquid provides at most the latest 2,000 orders.`, { id: toastId });
			}
		} catch (error) {
			if (isHistoryAbortError(error)) toast.dismiss(toastId);
			else toast.error(t`Failed to export order history.`, { id: toastId });
		}
	}

	return { exportCsv, isExporting };
}
