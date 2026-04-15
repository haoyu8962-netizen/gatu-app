import { Button } from "@hypeterminal/ui";
import { t } from "@lingui/core/macro";
import {
	ChartLineIcon,
	CrosshairIcon,
	ListChecksIcon,
	PencilIcon,
	PlusIcon,
	TrendUpIcon,
	XIcon,
} from "@phosphor-icons/react";
import { Skeleton } from "boneyard-js/react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useConnection } from "wagmi";
import { Spinner } from "@/components/ui/spinner";
import { FALLBACK_VALUE_PLACEHOLDER, HL_ALL_DEXS } from "@/config/constants";
import { buildOrderPlan } from "@/domain/trade/order-intent";
import { cn } from "@/lib/cn";
import { formatPercent, formatPrice, formatToken, formatUSD } from "@/lib/format";
import { type Position, useExchange, useMarkets, useSubscription, useUserPositions } from "@/lib/hyperliquid";
import type { Markets } from "@/lib/hyperliquid/markets";
import { getValueColorClass, isPositive, toBig } from "@/lib/trade/numbers";
import { isStopOrder, isTakeProfitOrder } from "@/lib/trade/open-orders";
import type { Side } from "@/lib/trade/types";
import { useExchangeScope } from "@/providers/exchange-scope";
import { useGlobalSettingsActions, useMarketOrderSlippageBps } from "@/stores/use-global-settings-store";
import { useMarketActions } from "@/stores/use-market-store";
import { useOrderEntryActions } from "@/stores/use-order-entry-store";
import { AssetDisplay } from "../components/asset-display";
import { PositionLimitCloseModal } from "../positions/position-limit-close-modal";
import { PositionTpSlModal } from "../positions/position-tpsl-modal";

interface TpSlOrderInfo {
	tpPrice?: number;
	slPrice?: number;
	tpOrderId?: number;
	slOrderId?: number;
}

interface TpSlPositionData {
	coin: string;
	assetId: number;
	isLong: boolean;
	size: number;
	entryPx: number;
	markPx: number;
	unrealizedPnl: number;
	roe: number;
	szDecimals: number;
	existingTpPrice?: number;
	existingSlPrice?: number;
	existingTpOrderId?: number;
	existingSlOrderId?: number;
}

interface LimitClosePositionData {
	coin: string;
	assetId: number;
	isLong: boolean;
	size: number;
	entryPx: number;
	markPx: number;
	unrealizedPnl: number;
	roe: number;
	szDecimals: number;
}

interface MobilePositionCardProps {
	position: Position;
	markets: Markets;
	markPx: string | undefined;
	tpSlInfo: TpSlOrderInfo | undefined;
	isClosing: boolean;
	isRowClosing: boolean;
	closeErrorMessage: string | null;
	onClose: (assetId: number, size: number, markPx: number, szDecimals: number, isLong: boolean, coin: string) => void;
	onLimitClose: (data: LimitClosePositionData) => void;
	onOpenTpSl: (data: TpSlPositionData) => void;
	onSelectMarket: (coin: string, side: Side) => void;
}

function MobilePositionCard({
	position: p,
	markets,
	markPx: markPxRaw,
	tpSlInfo,
	isClosing,
	isRowClosing,
	closeErrorMessage,
	onClose,
	onLimitClose,
	onOpenTpSl,
	onSelectMarket,
}: MobilePositionCardProps) {
	const [confirmingClose, setConfirmingClose] = useState(false);

	const size = toBig(p.szi)?.toNumber() ?? Number.NaN;
	const isLong = size > 0;
	const absSize = Math.abs(size);
	const market = markets.getMarket(p.coin);
	const displayName = market?.pairName ?? p.coin;
	const assetId = market?.assetId;
	const szDecimals = market?.szDecimals ?? 4;
	const markPx = toBig(markPxRaw)?.toNumber() ?? Number.NaN;
	const entryPx = toBig(p.entryPx)?.toNumber() ?? Number.NaN;
	const unrealizedPnl = toBig(p.unrealizedPnl)?.toNumber() ?? Number.NaN;
	const liqPx = toBig(p.liquidationPx)?.toNumber();
	const liqIsNear =
		liqPx != null && Number.isFinite(markPx) && Number.isFinite(liqPx) && Math.abs(liqPx - markPx) / markPx <= 0.1;

	const fundingRaw = toBig(p.cumFunding.sinceOpen)?.toNumber();
	const fundingValue = formatUSD(fundingRaw != null ? -fundingRaw : null, { signDisplay: "exceptZero" });
	const fundingClass = getValueColorClass(fundingRaw != null ? -fundingRaw : 0);

	const canClose = isPositive(absSize) && typeof assetId === "number" && isPositive(markPx);
	const pnlClass = getValueColorClass(unrealizedPnl);
	const hasTpSl = !!(tpSlInfo?.tpPrice || tpSlInfo?.slPrice);

	function handleClose() {
		if (!canClose || typeof assetId !== "number") return;
		onClose(assetId, absSize, markPx, szDecimals, isLong, p.coin);
	}

	function handleLimitClose() {
		if (!canClose || typeof assetId !== "number") return;
		onLimitClose({
			coin: p.coin,
			assetId,
			isLong,
			size: absSize,
			entryPx,
			markPx,
			unrealizedPnl,
			roe: toBig(p.returnOnEquity)?.toNumber() ?? 0,
			szDecimals,
		});
	}

	function handleOpenTpSl() {
		if (typeof assetId !== "number") return;
		onOpenTpSl({
			coin: p.coin,
			assetId,
			isLong,
			size: absSize,
			entryPx,
			markPx,
			unrealizedPnl,
			roe: toBig(p.returnOnEquity)?.toNumber() ?? 0,
			szDecimals,
			existingTpPrice: tpSlInfo?.tpPrice,
			existingSlPrice: tpSlInfo?.slPrice,
			existingTpOrderId: tpSlInfo?.tpOrderId,
			existingSlOrderId: tpSlInfo?.slOrderId,
		});
	}

	return (
		<div className="rounded-xs border border-stroke-weak/40 bg-surface overflow-hidden">
			<div className="relative flex items-center justify-between px-3 py-1.5 border-b border-stroke-weak/40">
				<div className={cn("absolute left-0 top-0 bottom-0 w-px", isLong ? "bg-market-up" : "bg-market-down")} />
				<Button
					variant="ghost"
					intent="neutral"
					size="sm"
					onClick={() => onSelectMarket(p.coin, isLong ? "buy" : "sell")}
					aria-label={
						isLong
							? t`Switch to ${displayName} market, long position`
							: t`Switch to ${displayName} market, short position`
					}
				>
					<AssetDisplay coin={p.coin} nameClassName="text-sm font-semibold" />
					<span className={cn("text-2xs font-medium uppercase", isLong ? "text-success" : "text-error")}>
						{isLong ? t`Long` : t`Short`}
					</span>
				</Button>
				<div className={cn("text-xs tabular-nums font-medium", pnlClass)}>
					{formatUSD(unrealizedPnl, { signDisplay: "exceptZero" })}
					<span className="text-2xs ml-1 font-normal text-fg-muted">{formatPercent(p.returnOnEquity, 1)}</span>
				</div>
			</div>

			<div className="grid grid-cols-3 divide-x divide-stroke-weak/40">
				<MetricCell
					label={t`Size`}
					value={
						<>
							<span className="whitespace-nowrap">
								{formatToken(absSize, { decimals: szDecimals, symbol: p.coin })}
							</span>
							<div className="text-2xs text-fg-muted font-normal tabular-nums mt-0.5">
								{formatUSD(p.positionValue, { compact: true })}
							</div>
						</>
					}
				/>
				<MetricCell label={t`Entry`} value={formatPrice(entryPx, { szDecimals })} />
				<MetricCell label={t`Mark`} value={formatPrice(markPx, { szDecimals })} />
			</div>
			<div className="grid grid-cols-3 divide-x divide-stroke-weak/40 border-t border-stroke-weak/40">
				<MetricCell
					label={p.leverage.type === "isolated" ? t`Margin · Iso` : t`Margin`}
					value={formatUSD(p.marginUsed)}
				/>
				<MetricCell
					label={t`Liq`}
					value={formatPrice(p.liquidationPx, { szDecimals })}
					valueClass={liqIsNear ? "text-error" : undefined}
				/>
				<MetricCell label={t`Funding`} value={fundingValue} valueClass={fundingClass} />
			</div>

			<div className="flex gap-1.5 px-2.5 py-1.5 border-t border-stroke-weak/40">
				{confirmingClose ? (
					<>
						<Button
							variant="outline"
							intent="neutral"
							size="xs"
							className="flex-1 justify-center"
							onClick={() => setConfirmingClose(false)}
						>
							{t`Cancel`}
						</Button>
						<Button
							variant="outline"
							intent="error"
							size="xs"
							className="flex-1 justify-center"
							onClick={handleClose}
							disabled={!canClose || isClosing}
							iconLeft={isRowClosing ? <Spinner className="size-3" /> : <XIcon className="size-3.5" />}
						>
							{t`Confirm Close`}
						</Button>
					</>
				) : (
					<>
						<Button
							variant="outline"
							intent="neutral"
							size="xs"
							className="flex-1 justify-center"
							onClick={handleOpenTpSl}
							disabled={typeof assetId !== "number"}
							iconLeft={hasTpSl ? <CrosshairIcon className="size-3.5" /> : <PlusIcon className="size-3.5" />}
						>
							{hasTpSl ? (
								<span className="inline-flex items-center gap-1 tabular-nums truncate">
									{tpSlInfo?.tpPrice && (
										<span className="text-success">{formatPrice(tpSlInfo.tpPrice, { szDecimals })}</span>
									)}
									{tpSlInfo?.tpPrice && tpSlInfo?.slPrice && <span className="text-fg-muted"> / </span>}
									{tpSlInfo?.slPrice && (
										<span className="text-error">{formatPrice(tpSlInfo.slPrice, { szDecimals })}</span>
									)}
									<PencilIcon className="size-3 text-fg-disabled" />
								</span>
							) : (
								t`TP/SL`
							)}
						</Button>
						<Button
							variant="outline"
							intent="neutral"
							size="xs"
							className="flex-1 justify-center"
							onClick={handleLimitClose}
							disabled={!canClose || isClosing}
						>
							{t`Limit Close`}
						</Button>
						<Button
							variant="outline"
							intent="error"
							size="xs"
							className="flex-1 justify-center"
							onClick={() => setConfirmingClose(true)}
							disabled={!canClose || isClosing}
							iconLeft={<XIcon className="size-3.5" />}
						>
							{t`Close`}
						</Button>
					</>
				)}
			</div>
			{closeErrorMessage && (
				<div className="px-3 py-1.5 text-xs text-error border-t border-stroke-weak/40">{closeErrorMessage}</div>
			)}
		</div>
	);
}

interface MetricCellProps {
	label: string;
	value: React.ReactNode;
	valueClass?: string;
}

function MetricCell({ label, value, valueClass }: MetricCellProps) {
	return (
		<div className="px-2.5 py-1.5">
			<div className="text-xs text-fg-muted">{label}</div>
			<div className={cn("text-xs tabular-nums font-medium", valueClass)}>{value}</div>
		</div>
	);
}

export function MobilePositionsTab() {
	const { address, isConnected } = useConnection();
	const slippageBps = useMarketOrderSlippageBps();
	const closingKeyRef = useRef<string | null>(null);
	const { scope } = useExchangeScope();
	const { setSelectedMarket } = useMarketActions();
	const { setMobileActiveTab } = useGlobalSettingsActions();
	const { setSide } = useOrderEntryActions();

	function handleSelectMarket(name: string, side: Side) {
		setSelectedMarket(scope, name);
		setSide(side);
		setMobileActiveTab("trade");
	}
	const [tpSlModalOpen, setTpSlModalOpen] = useState(false);
	const [selectedTpSlPosition, setSelectedTpSlPosition] = useState<TpSlPositionData | null>(null);
	const [limitCloseModalOpen, setLimitCloseModalOpen] = useState(false);
	const [selectedLimitClosePosition, setSelectedLimitClosePosition] = useState<LimitClosePositionData | null>(null);
	const [closeErrorKey, setCloseErrorKey] = useState<string | null>(null);

	const { mutate: placeOrder, isPending: isClosing, error: closeError, reset: resetCloseError } = useExchange("order");
	const { positions, isLoading: positionsLoading, hasError: positionsError } = useUserPositions();
	const markets = useMarkets();

	const allMidsEnabled = isConnected && positions.length > 0;
	const { data: allMidsEvent } = useSubscription("allMids", { dex: HL_ALL_DEXS }, { enabled: allMidsEnabled });
	const mids = allMidsEvent?.mids;

	const { data: openOrdersEvent } = useSubscription(
		"openOrders",
		{ user: address ?? "0x0", dex: HL_ALL_DEXS },
		{ enabled: isConnected && !!address },
	);
	const openOrders = openOrdersEvent?.orders ?? [];

	const tpSlOrdersByCoin = new Map<string, TpSlOrderInfo>();
	for (const order of openOrders) {
		if (!order.isTrigger) continue;
		const triggerPx = toBig(order.triggerPx)?.toNumber();
		if (!triggerPx || triggerPx <= 0) continue;
		const existing = tpSlOrdersByCoin.get(order.coin) ?? {};
		if (isTakeProfitOrder(order) && !existing.tpPrice) {
			existing.tpPrice = triggerPx;
			existing.tpOrderId = order.oid;
		} else if (isStopOrder(order) && !existing.slPrice) {
			existing.slPrice = triggerPx;
			existing.slOrderId = order.oid;
		}
		tpSlOrdersByCoin.set(order.coin, existing);
	}

	function handleClosePosition(
		assetId: number,
		size: number,
		markPx: number,
		szDecimals: number,
		isLong: boolean,
		coin: string,
	) {
		if (isClosing) return;
		resetCloseError();
		setCloseErrorKey(null);
		closingKeyRef.current = `${assetId}`;

		const { orders, grouping } = buildOrderPlan({
			kind: "marketClose",
			assetId,
			size,
			szDecimals,
			isLong,
			markPx,
			slippageBps,
		});

		placeOrder(
			{ orders, grouping },
			{
				onSuccess: () => toast.success(t`Position closed` + (coin ? ` — ${coin}` : "")),
				onError: (error) => {
					toast.error(error.message || t`Failed to close position`);
					setCloseErrorKey(`${assetId}`);
				},
				onSettled: () => {
					closingKeyRef.current = null;
				},
			},
		);
	}

	function handleOpenLimitCloseModal(data: LimitClosePositionData) {
		setSelectedLimitClosePosition(data);
		setLimitCloseModalOpen(true);
	}

	function handleOpenTpSlModal(data: TpSlPositionData) {
		setSelectedTpSlPosition(data);
		setTpSlModalOpen(true);
	}

	const headerCount = isConnected ? positions.length : FALLBACK_VALUE_PLACEHOLDER;

	if (!isConnected) {
		return (
			<div className="flex-1 flex items-center justify-center p-6 text-sm text-fg-muted">
				{t`Connect your wallet to view positions.`}
			</div>
		);
	}

	if (positionsError) {
		return (
			<div className="flex-1 flex items-center justify-center p-6 text-sm text-error">
				{t`Failed to load positions.`}
			</div>
		);
	}

	if (!positionsLoading && positions.length === 0) {
		return (
			<div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
				<div className="size-12 rounded-full flex items-center justify-center bg-surface">
					<ChartLineIcon className="size-6 text-fg-muted" />
				</div>
				<p className="text-sm text-fg-muted text-pretty">{t`No active positions.`}</p>
				<Button
					variant="outline"
					intent="neutral"
					size="sm"
					iconLeft={<TrendUpIcon className="size-4" />}
					onClick={() => setMobileActiveTab("trade")}
				>
					{t`Go to Trade`}
				</Button>
			</div>
		);
	}

	return (
		<Skeleton name="positions-tab" loading={positionsLoading}>
			<div className="flex-1 min-h-0 flex flex-col">
				<div className="px-3 py-2 flex items-center gap-2 text-xs uppercase text-fg-muted">
					<ListChecksIcon className="size-3" />
					{t`Active Positions`}
					<span className="font-semibold text-success ml-auto tabular-nums">{headerCount}</span>
				</div>
				<div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3 space-y-2">
					{positions.map((p) => {
						const assetId = markets.getAssetId(p.coin);
						return (
							<MobilePositionCard
								key={`${p.coin}-${p.entryPx}-${p.szi}`}
								position={p}
								markets={markets}
								markPx={mids?.[p.coin]}
								tpSlInfo={tpSlOrdersByCoin.get(p.coin)}
								isClosing={isClosing}
								isRowClosing={isClosing && closingKeyRef.current === `${assetId}`}
								closeErrorMessage={closeErrorKey === `${assetId}` ? (closeError?.message ?? null) : null}
								onClose={handleClosePosition}
								onLimitClose={handleOpenLimitCloseModal}
								onOpenTpSl={handleOpenTpSlModal}
								onSelectMarket={handleSelectMarket}
							/>
						);
					})}
				</div>

				<PositionTpSlModal open={tpSlModalOpen} onOpenChange={setTpSlModalOpen} position={selectedTpSlPosition} />
				<PositionLimitCloseModal
					open={limitCloseModalOpen}
					onOpenChange={setLimitCloseModalOpen}
					position={selectedLimitClosePosition}
				/>
			</div>
		</Skeleton>
	);
}
