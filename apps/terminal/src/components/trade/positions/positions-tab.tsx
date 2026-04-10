import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Tooltip } from "@hypeterminal/ui";
import { t } from "@lingui/core/macro";
import { PencilIcon, PlusIcon } from "@phosphor-icons/react";
import { type ReactNode, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useConnection } from "wagmi";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { HL_ALL_DEXS } from "@/config/constants";
import { buildOrderPlan } from "@/domain/trade/order-intent";
import { cn } from "@/lib/cn";
import { formatLiquidationPrice, formatPercent, formatPrice, formatToken, formatUSD } from "@/lib/format";
import { type Position, useExchange, useMarkets, useSubscription, useUserPositions } from "@/lib/hyperliquid";
import type { Markets } from "@/lib/hyperliquid/markets";
import { getValueColorClass, isPositive, toBig } from "@/lib/trade/numbers";
import { isStopOrder, isTakeProfitOrder } from "@/lib/trade/open-orders";
import { useExchangeScope } from "@/providers/exchange-scope";
import { useMarketOrderSlippageBps } from "@/stores/use-global-settings-store";
import { useMarketActions } from "@/stores/use-market-store";
import { AssetDisplay } from "../components/asset-display";
import { PositionActionsDropdown } from "./position-actions-dropdown";
import { PositionLimitCloseModal } from "./position-limit-close-modal";
import { PositionTpSlModal } from "./position-tpsl-modal";
import {
	positionsPanelRowHoverClass,
	positionsPanelRowStripeClass,
	positionsPanelTableBodyClass,
	positionsPanelTableCaptionRowClass,
	positionsPanelTableCellClass,
	positionsPanelTableHeadClass,
	positionsPanelTableHeaderClass,
	positionsPanelTableHeaderRowClass,
	positionsPanelTableShellClass,
	positionsPanelTabRootClass,
} from "./positions-panel-table-styles";

interface PlaceholderProps {
	children: ReactNode;
	variant?: "error";
}

function Placeholder({ children, variant }: PlaceholderProps) {
	return (
		<div
			className={cn(
				"h-full w-full flex flex-col items-center justify-center px-2 py-6 text-xs",
				variant === "error" ? "text-text-error" : "text-text-weak",
			)}
		>
			{children}
		</div>
	);
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

interface TpSlOrderInfo {
	tpPrice?: number;
	slPrice?: number;
	tpOrderId?: number;
	slOrderId?: number;
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

interface PositionRowProps {
	position: Position;
	markets: Markets;
	markPx: string | undefined;
	tpSlInfo: TpSlOrderInfo | undefined;
	isClosing: boolean;
	isRowClosing: boolean;
	isEven: boolean;
	onClose: (assetId: number, size: number, markPx: number, szDecimals: number, isLong: boolean, coin: string) => void;
	onLimitClose: (data: LimitClosePositionData) => void;
	onReverse: (assetId: number, size: number, markPx: number, szDecimals: number, isLong: boolean, coin: string) => void;
	onOpenTpSl: (data: TpSlPositionData) => void;
	onSelectMarket: (coin: string) => void;
}

function PositionRow({
	position: p,
	markets,
	markPx: markPxRaw,
	tpSlInfo,
	isClosing,
	isRowClosing,
	isEven,
	onClose,
	onLimitClose,
	onReverse,
	onOpenTpSl,
	onSelectMarket,
}: PositionRowProps) {
	const size = toBig(p.szi)?.toNumber() ?? Number.NaN;
	const isLong = size > 0;
	const absSize = Math.abs(size);
	const market = markets.getMarket(p.coin);
	const assetId = market?.assetId;
	const szDecimals = market?.szDecimals ?? 4;
	const markPx = toBig(markPxRaw)?.toNumber() ?? Number.NaN;
	const displayName = market?.pairName ?? p.coin;

	const liqPx = toBig(p.liquidationPx)?.toNumber();
	const liqIsNear =
		liqPx != null && Number.isFinite(markPx) && Number.isFinite(liqPx) && Math.abs(liqPx - markPx) / markPx <= 0.1;

	const entryPx = toBig(p.entryPx)?.toNumber() ?? Number.NaN;
	const unrealizedPnl = toBig(p.unrealizedPnl)?.toNumber() ?? Number.NaN;
	const roe = toBig(p.returnOnEquity)?.toNumber() ?? Number.NaN;
	const cumFunding = toBig(p.cumFunding.sinceOpen)?.toNumber() ?? Number.NaN;
	const canClose = isPositive(absSize) && typeof assetId === "number" && isPositive(markPx);

	const pnlClass = getValueColorClass(unrealizedPnl);
	const fundingClass = getValueColorClass(cumFunding ? -cumFunding : null);
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
			roe,
			szDecimals,
		});
	}

	function handleReverse() {
		if (!canClose || typeof assetId !== "number") return;
		onReverse(assetId, absSize, markPx, szDecimals, isLong, p.coin);
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
			roe,
			szDecimals,
			existingTpPrice: tpSlInfo?.tpPrice,
			existingSlPrice: tpSlInfo?.slPrice,
			existingTpOrderId: tpSlInfo?.tpOrderId,
			existingSlOrderId: tpSlInfo?.slOrderId,
		});
	}

	return (
		<TableRow className={cn(positionsPanelRowHoverClass, isEven && positionsPanelRowStripeClass)}>
			<TableCell
				className={cn(
					positionsPanelTableCellClass,
					"min-w-0 border-l-2 text-text-strong",
					isLong ? "border-l-text-success" : "border-l-text-error",
				)}
			>
				<Button
					variant="ghost"
					intent="neutral"
					onClick={() => onSelectMarket(p.coin)}
					className="h-auto min-h-0 min-w-0 max-w-full gap-1.5 justify-start p-0.5 -m-0.5 font-normal rounded-6 hover:bg-fill-hover/60"
					aria-label={
						isLong
							? t`Switch to ${displayName} market, long position`
							: t`Switch to ${displayName} market, short position`
					}
				>
					<AssetDisplay
						coin={p.coin}
						iconClassName="size-4"
						nameClassName="text-xs font-semibold text-text-strong leading-none"
					/>
				</Button>
			</TableCell>
			<TableCell className={cn(positionsPanelTableCellClass, "text-right tabular-nums text-text-strong")}>
				<div className="flex flex-col items-end gap-px">
					<span className="text-xs font-semibold tabular-nums leading-tight">
						{formatToken(absSize, {
							decimals: szDecimals,
							symbol: p.coin,
						})}
					</span>
					<span className="text-2xs text-text-weak tabular-nums leading-tight">
						({formatUSD(p.positionValue, { compact: true })})
					</span>
				</div>
			</TableCell>
			<TableCell className={cn(positionsPanelTableCellClass, "text-right text-text-strong")}>
				<div className="flex flex-col items-end gap-px">
					<span className="text-xs font-semibold tabular-nums leading-tight">{formatUSD(p.marginUsed)}</span>
					<span className="text-2xs font-medium text-text-weak leading-tight">
						{p.leverage.type === "isolated" ? t`Isolated` : t`Cross`}
					</span>
				</div>
			</TableCell>
			<TableCell
				className={cn(positionsPanelTableCellClass, "text-right tabular-nums text-text-weak whitespace-nowrap")}
			>
				<span className="tabular-nums">{formatPrice(p.entryPx, { szDecimals })}</span>
			</TableCell>
			<TableCell
				className={cn(positionsPanelTableCellClass, "text-right tabular-nums text-text-strong whitespace-nowrap")}
			>
				<span className="text-xs font-semibold tabular-nums">{formatPrice(markPx, { szDecimals })}</span>
			</TableCell>
			<TableCell
				className={cn(
					positionsPanelTableCellClass,
					"text-right tabular-nums min-w-0",
					liqIsNear ? "text-text-error font-medium" : "text-text-weak",
				)}
			>
				<span className="block truncate" title={formatPrice(p.liquidationPx, { szDecimals })}>
					{formatLiquidationPrice(p.liquidationPx, szDecimals)}
				</span>
			</TableCell>
			<TableCell
				className={cn(positionsPanelTableCellClass, "text-right tabular-nums whitespace-nowrap", fundingClass)}
			>
				<span className="font-medium tabular-nums">
					{formatUSD(cumFunding ? -cumFunding : null, { signDisplay: "exceptZero" })}
				</span>
			</TableCell>
			<TableCell className={cn(positionsPanelTableCellClass, "text-right")}>
				<div className={cn("flex flex-col items-end gap-px tabular-nums", pnlClass)}>
					<span className="text-xs font-semibold leading-tight">
						{formatUSD(unrealizedPnl, { signDisplay: "exceptZero" })}
					</span>
					<span className={cn("text-2xs leading-tight opacity-90", pnlClass)}>
						({formatPercent(p.returnOnEquity, 1)})
					</span>
				</div>
			</TableCell>
			<TableCell className={cn(positionsPanelTableCellClass, "text-right")}>
				<Tooltip content={tpSlInfo?.tpPrice && tpSlInfo?.slPrice ? t`Edit TP/SL` : t`Add TP/SL`} side="left">
					<button
						type="button"
						onClick={handleOpenTpSl}
						disabled={typeof assetId !== "number"}
						className={cn(
							"group inline-flex items-center gap-1.5 cursor-pointer transition-opacity disabled:cursor-not-allowed disabled:opacity-50",
							!hasTpSl && "text-text-disabled hover:text-text-weak",
						)}
					>
						{tpSlInfo?.tpPrice && tpSlInfo?.slPrice ? (
							<>
								<div className="flex items-center gap-1 text-2xs tabular-nums">
									<span className="text-text-success">{formatPrice(tpSlInfo.tpPrice, { szDecimals })}</span>
									<span className="text-text-weak">/</span>
									<span className="text-text-error">{formatPrice(tpSlInfo.slPrice, { szDecimals })}</span>
								</div>
								<PencilIcon className="size-2.5 text-text-disabled group-hover:text-text-weak transition-colors" />
							</>
						) : hasTpSl ? (
							<>
								<div className="flex items-center gap-1 text-2xs tabular-nums">
									{tpSlInfo?.tpPrice ? (
										<span className="text-text-success">{formatPrice(tpSlInfo.tpPrice, { szDecimals })}</span>
									) : (
										<span className="text-text-error">{formatPrice(tpSlInfo?.slPrice, { szDecimals })}</span>
									)}
								</div>
								<PlusIcon className="size-2.5 text-text-disabled group-hover:text-text-weak transition-colors" />
							</>
						) : (
							<div className="flex items-center gap-0.5 text-2xs font-medium text-text-weak">
								<PlusIcon className="size-2.5 group-hover:text-text-weak transition-colors" />
								<span>{t`Add`}</span>
							</div>
						)}
					</button>
				</Tooltip>
			</TableCell>
			<TableCell className={cn(positionsPanelTableCellClass, "text-right")}>
				<PositionActionsDropdown
					canClose={canClose}
					isClosing={isClosing}
					isRowClosing={isRowClosing}
					onMarketClose={handleClose}
					onLimitClose={handleLimitClose}
					onReverse={handleReverse}
				/>
			</TableCell>
		</TableRow>
	);
}

export function PositionsTab() {
	const { address, isConnected } = useConnection();
	const slippageBps = useMarketOrderSlippageBps();
	const closingKeyRef = useRef<string | null>(null);
	const { scope } = useExchangeScope();
	const { setSelectedMarket } = useMarketActions();
	const [tpSlModalOpen, setTpSlModalOpen] = useState(false);
	const [selectedTpSlPosition, setSelectedTpSlPosition] = useState<TpSlPositionData | null>(null);
	const [limitCloseModalOpen, setLimitCloseModalOpen] = useState(false);
	const [selectedLimitClosePosition, setSelectedLimitClosePosition] = useState<LimitClosePositionData | null>(null);

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

	const tpSlOrdersByCoin = useMemo(() => {
		const map = new Map<string, TpSlOrderInfo>();
		for (const order of openOrders) {
			if (!order.isTrigger) continue;

			const triggerPx = toBig(order.triggerPx)?.toNumber();
			if (!triggerPx || triggerPx <= 0) continue;

			const existing = map.get(order.coin) ?? {};
			if (isTakeProfitOrder(order) && !existing.tpPrice) {
				existing.tpPrice = triggerPx;
				existing.tpOrderId = order.oid;
			} else if (isStopOrder(order) && !existing.slPrice) {
				existing.slPrice = triggerPx;
				existing.slOrderId = order.oid;
			}
			map.set(order.coin, existing);
		}
		return map;
	}, [openOrders]);

	const actionError = closeError?.message;

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
				onSuccess: () => {
					toast.success(t`Position closed` + (coin ? ` — ${coin}` : ""));
				},
				onError: (error) => {
					toast.error(error.message || t`Failed to close position`);
				},
				onSettled: () => {
					closingKeyRef.current = null;
				},
			},
		);
	}

	function handleReverse(
		assetId: number,
		size: number,
		markPx: number,
		szDecimals: number,
		isLong: boolean,
		coin: string,
	) {
		if (isClosing) return;

		resetCloseError();
		closingKeyRef.current = `${assetId}`;

		const { orders, grouping } = buildOrderPlan({
			kind: "reverse",
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
				onSuccess: () => {
					toast.success(t`Position reversed` + (coin ? ` — ${coin}` : ""));
				},
				onError: (error) => {
					toast.error(error.message || t`Failed to reverse position`);
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

	function renderPlaceholder() {
		if (!isConnected) return <Placeholder>{t`Connect your wallet to view positions.`}</Placeholder>;
		if (positionsLoading) return <Placeholder>{t`Loading positions...`}</Placeholder>;
		if (positionsError) {
			return (
				<Placeholder variant="error">
					<span>{t`Failed to load positions.`}</span>
				</Placeholder>
			);
		}
		if (positions.length === 0) return <Placeholder>{t`No active positions.`}</Placeholder>;
		return null;
	}

	const placeholder = renderPlaceholder();

	return (
		<div className={positionsPanelTabRootClass}>
			<div className={positionsPanelTableCaptionRowClass}>
				{isConnected ? (
					<span className="tabular-nums text-3xs text-text-weak">
						{positions.length} {t`positions`}
					</span>
				) : null}
			</div>
			{actionError ? <div className="px-2.5 py-1 text-2xs text-text-error">{actionError}</div> : null}
			<div className={positionsPanelTableShellClass}>
				{placeholder ? (
					<div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{placeholder}</div>
				) : (
					<ScrollArea className="min-h-0 w-full flex-1">
						<Table className="table-fixed min-w-[64rem] w-full">
							<TableHeader className={positionsPanelTableHeaderClass}>
								<TableRow className={positionsPanelTableHeaderRowClass}>
									<TableHead scope="col" className={cn(positionsPanelTableHeadClass, "w-[8%] min-w-0 text-left")}>
										{t`Asset`}
									</TableHead>
									<TableHead scope="col" className={cn(positionsPanelTableHeadClass, "w-[14%] text-right")}>
										{t`Size`}
									</TableHead>
									<TableHead scope="col" className={cn(positionsPanelTableHeadClass, "w-[12%] text-right")}>
										{t`Margin`}
									</TableHead>
									<TableHead scope="col" className={cn(positionsPanelTableHeadClass, "w-[8%] text-right")}>
										{t`Entry`}
									</TableHead>
									<TableHead scope="col" className={cn(positionsPanelTableHeadClass, "w-[9%] text-right")}>
										{t`Mark`}
									</TableHead>
									<TableHead scope="col" className={cn(positionsPanelTableHeadClass, "w-[9%] text-right")}>
										{t`Liq`}
									</TableHead>
									<TableHead scope="col" className={cn(positionsPanelTableHeadClass, "w-[8%] text-right")}>
										{t`Funding`}
									</TableHead>
									<TableHead scope="col" className={cn(positionsPanelTableHeadClass, "w-[12%] text-right")}>
										{t`PNL`}
									</TableHead>
									<TableHead scope="col" className={cn(positionsPanelTableHeadClass, "w-[10%] text-right")}>
										{t`TP/SL`}
									</TableHead>
									<TableHead scope="col" className={cn(positionsPanelTableHeadClass, "w-[10%] text-right")}>
										{t`Actions`}
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody className={positionsPanelTableBodyClass}>
								{positions.map((p, i) => (
									<PositionRow
										key={`${p.coin}-${p.entryPx}-${p.szi}`}
										position={p}
										markets={markets}
										markPx={mids?.[p.coin]}
										tpSlInfo={tpSlOrdersByCoin.get(p.coin)}
										isClosing={isClosing}
										isRowClosing={isClosing && closingKeyRef.current === `${markets.getAssetId(p.coin)}`}
										isEven={i % 2 === 1}
										onClose={handleClosePosition}
										onLimitClose={handleOpenLimitCloseModal}
										onReverse={handleReverse}
										onOpenTpSl={handleOpenTpSlModal}
										onSelectMarket={(name) => setSelectedMarket(scope, name)}
									/>
								))}
							</TableBody>
						</Table>
						<ScrollBar orientation="horizontal" />
					</ScrollArea>
				)}
			</div>

			<PositionTpSlModal open={tpSlModalOpen} onOpenChange={setTpSlModalOpen} position={selectedTpSlPosition} />
			<PositionLimitCloseModal
				open={limitCloseModalOpen}
				onOpenChange={setLimitCloseModalOpen}
				position={selectedLimitClosePosition}
			/>
		</div>
	);
}
