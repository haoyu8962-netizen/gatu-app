import { t } from "@lingui/core/macro";
import { ArrowsDownUpIcon, ArrowsLeftRightIcon, PaperPlaneTiltIcon, WalletIcon } from "@phosphor-icons/react";
import { useId, useMemo, useState } from "react";
import { useConnection } from "wagmi";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DEFAULT_QUOTE_TOKEN, HL_ALL_DEXS } from "@/config/constants";
import {
	type BalanceRow,
	filterBalanceRowsByUsdValue,
	getBalanceRows,
	getTotalUsdValue,
} from "@/domain/trade/balances";
import { useAccountBalances } from "@/hooks/trade/use-account-balances";
import { cn } from "@/lib/cn";
import { formatToken, formatUSD } from "@/lib/format";
import { useSubscription } from "@/lib/hyperliquid";
import { useSpotTokens } from "@/lib/hyperliquid/markets/use-spot-tokens";
import { toNumberOrZero } from "@/lib/trade/numbers";
import { useSwapModalActions } from "@/stores/use-global-modal-store";
import { useGlobalSettingsActions, useHideSmallBalances } from "@/stores/use-global-settings-store";
import { AssetDisplay } from "../components/asset-display";
import { SendDialog } from "../positions/send-dialog";
import { TransferDialog } from "../positions/transfer-dialog";
import { BalancesTabSkeleton } from "./mobile-card-skeleton";

type TransferDirection = "toSpot" | "toPerp";
const SMALL_BALANCE_THRESHOLD = 1;

interface Props {
	className?: string;
}

export function MobileBalancesTab({ className }: Props) {
	const { isConnected } = useConnection();
	const { getToken } = useSpotTokens();
	const checkboxId = useId();
	const hideSmallBalances = useHideSmallBalances();
	const { setHideSmallBalances } = useGlobalSettingsActions();
	const { open: openSwapModal } = useSwapModalActions();
	const [transferState, setTransferState] = useState<{ open: boolean; direction: TransferDirection }>({
		open: false,
		direction: "toSpot",
	});
	const [sendState, setSendState] = useState<{ open: boolean; asset: string; accountType: "perp" | "spot" }>({
		open: false,
		asset: DEFAULT_QUOTE_TOKEN,
		accountType: "spot",
	});

	const { perpSummary, spotBalances, isLoading, hasError } = useAccountBalances();
	const { data: allMidsEvent } = useSubscription("allMids", { dex: HL_ALL_DEXS }, { enabled: isConnected });
	const mids = allMidsEvent?.mids;

	const balances = useMemo(() => getBalanceRows(perpSummary, spotBalances), [perpSummary, spotBalances]);
	const filteredBalances = useMemo(() => {
		if (!hideSmallBalances) return balances;
		return filterBalanceRowsByUsdValue(balances, SMALL_BALANCE_THRESHOLD);
	}, [balances, hideSmallBalances]);

	const perpBalances = useMemo(() => filteredBalances.filter((row) => row.type === "perp"), [filteredBalances]);
	const spotBalancesFiltered = useMemo(() => filteredBalances.filter((row) => row.type === "spot"), [filteredBalances]);
	const totalValue = useMemo(() => getTotalUsdValue(balances), [balances]);

	function getPnl(row: BalanceRow): { pnl: number; pnlPercent: number } | null {
		if (row.type === "perp") return null;
		const entryNtl = toNumberOrZero(row.entryNtl);
		if (entryNtl === 0) return null;
		const midPx = toNumberOrZero(mids?.[row.asset]);
		if (midPx === 0) return null;
		const total = toNumberOrZero(row.total);
		const currentValue = total * midPx;
		const pnl = currentValue - entryNtl;
		const pnlPercent = (pnl / entryNtl) * 100;
		return { pnl, pnlPercent };
	}

	function handleTransferClick(row: BalanceRow) {
		if (row.asset !== DEFAULT_QUOTE_TOKEN) return;
		setTransferState({ open: true, direction: row.type === "perp" ? "toSpot" : "toPerp" });
	}

	function handleSendClick(row: BalanceRow) {
		setSendState({ open: true, asset: row.asset, accountType: row.type });
	}

	if (!isConnected) {
		return (
			<div className="flex-1 flex items-center justify-center p-6 text-sm text-text-500">
				{t`Connect your wallet to view balances.`}
			</div>
		);
	}

	if (isLoading) {
		return <BalancesTabSkeleton />;
	}

	if (hasError) {
		return (
			<div className="flex-1 flex items-center justify-center p-6 text-sm text-market-down">
				{t`Failed to load balances.`}
			</div>
		);
	}

	if (balances.length === 0) {
		return (
			<div className="flex-1 flex items-center justify-center p-6 text-sm text-text-500">
				{t`No balances found. Deposit funds to start trading.`}
			</div>
		);
	}

	function renderBalanceCard(row: BalanceRow) {
		const token = getToken(row.asset);
		const decimals = row.type === "perp" ? 2 : (token?.szDecimals ?? 2);
		const canTransfer = row.asset === DEFAULT_QUOTE_TOKEN && parseFloat(row.available) > 0;
		const canSwap = row.type === "spot" && parseFloat(row.available) > 0;
		const canSend = parseFloat(row.available) > 0;
		const transferLabel = row.type === "perp" ? t`To Spot` : t`To Perp`;
		const pnlData = getPnl(row);

		return (
			<div key={`${row.type}-${row.asset}`} className="rounded-sm border border-border/40 bg-surface-base/50">
				<div className="flex items-center justify-between px-3 py-2.5 border-b border-border/40">
					<AssetDisplay coin={row.asset} nameClassName="text-sm font-semibold" />
					<div className="text-right">
						<div className="text-sm font-semibold tabular-nums text-market-up-600">
							{formatUSD(row.usdValue, { compact: true })}
						</div>
						{pnlData && (
							<div
								className={cn(
									"text-3xs tabular-nums",
									pnlData.pnl >= 0 ? "text-market-up-600" : "text-market-down-600",
								)}
							>
								{pnlData.pnl >= 0 ? "+" : ""}
								{formatUSD(pnlData.pnl, { compact: true })} ({pnlData.pnlPercent >= 0 ? "+" : ""}
								{pnlData.pnlPercent.toFixed(1)}%)
							</div>
						)}
					</div>
				</div>

				<div className="grid grid-cols-2 gap-px bg-border/20">
					<MetricCell label={t`Available`} value={formatToken(row.available, decimals)} />
					<MetricCell label={t`Total`} value={formatToken(row.total, decimals)} />
				</div>

				{(canTransfer || canSwap || canSend) && (
					<div className="flex items-center gap-2 px-3 py-2.5">
						{canTransfer && (
							<Button
								variant="outlined"
								size="sm"
								onClick={() => handleTransferClick(row)}
								className="min-h-[36px] text-xs gap-1"
							>
								<ArrowsLeftRightIcon className="size-3.5" />
								{transferLabel}
							</Button>
						)}
						{canSwap && (
							<Button
								variant="outlined"
								size="sm"
								onClick={() => openSwapModal(row.asset)}
								className="min-h-[36px] text-xs gap-1"
							>
								<ArrowsDownUpIcon className="size-3.5" />
								{t`Swap`}
							</Button>
						)}
						{canSend && (
							<Button
								variant="outlined"
								size="sm"
								onClick={() => handleSendClick(row)}
								className="min-h-[36px] text-xs gap-1 ml-auto"
							>
								<PaperPlaneTiltIcon className="size-3.5" />
								{t`Send`}
							</Button>
						)}
					</div>
				)}
			</div>
		);
	}

	return (
		<div className={cn("flex-1 min-h-0 flex flex-col", className)}>
			<div className="px-3 py-2 flex items-center gap-2 text-3xs uppercase tracking-wider text-text-500">
				<WalletIcon className="size-3" />
				{t`Account Balances`}
				<label
					htmlFor={checkboxId}
					className="ml-auto flex items-center gap-1.5 cursor-pointer text-4xs normal-case tracking-normal"
				>
					<Checkbox
						id={checkboxId}
						checked={hideSmallBalances}
						onCheckedChange={(checked) => setHideSmallBalances(Boolean(checked))}
						className="size-3"
					/>
					{t`Hide small`}
				</label>
				<span className="text-market-up-600 font-semibold tabular-nums">
					{formatUSD(totalValue, { compact: true })}
				</span>
			</div>
			<div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3 space-y-2">
				{perpBalances.length > 0 && (
					<>
						<div className="text-3xs uppercase tracking-wider text-primary-default font-medium px-1 pt-1">
							{t`Perpetuals`}
						</div>
						{perpBalances.map(renderBalanceCard)}
					</>
				)}
				{spotBalancesFiltered.length > 0 && (
					<>
						<div className="text-3xs uppercase tracking-wider text-warning-700 font-medium px-1 pt-1">{t`Spot`}</div>
						{spotBalancesFiltered.map(renderBalanceCard)}
					</>
				)}
			</div>

			<TransferDialog
				open={transferState.open}
				onOpenChange={(open) => setTransferState((prev) => ({ ...prev, open }))}
				initialDirection={transferState.direction}
			/>
			<SendDialog
				open={sendState.open}
				onOpenChange={(open) => setSendState((prev) => ({ ...prev, open }))}
				initialAsset={sendState.asset}
				initialAccountType={sendState.accountType}
			/>
		</div>
	);
}

interface MetricCellProps {
	label: string;
	value: string;
}

function MetricCell({ label, value }: MetricCellProps) {
	return (
		<div className="px-3 py-2 bg-surface-base/50">
			<div className="text-3xs text-text-500 mb-0.5">{label}</div>
			<div className="text-xs tabular-nums font-medium">{value}</div>
		</div>
	);
}
