import { Table, TableBody, TableHead, TableHeader, TableRow } from "@hypeterminal/ui";
import { t } from "@lingui/core/macro";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useConnection } from "wagmi";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { HL_ALL_DEXS } from "@/config/app";
import { buildOrderPlan } from "@/domain/trade/order-intent";
import { cn } from "@/lib/cn";
import { useExchange, useMarkets, useSubscription, useUserPositions } from "@/lib/hyperliquid";
import { buildTpSlOrdersByCoin } from "@/lib/trade/open-orders";
import type { Side } from "@/lib/trade/types";
import { useExchangeScope } from "@/providers/exchange-scope";
import { useMarketOrderSlippageBps } from "@/stores/use-global-settings-store";
import { useMarketActions } from "@/stores/use-market-store";
import { useOrderEntryActions } from "@/stores/use-order-entry-store";
import { Placeholder } from "./placeholder";
import type { LimitClosePositionData, TpSlPositionData } from "./position-dialog-types";
import { PositionLimitCloseModal } from "./position-limit-close-modal";
import { PositionRow } from "./position-row";
import { PositionTpSlModal } from "./position-tpsl-modal";
import {
	positionsPanelTableBodyClass,
	positionsPanelTableCaptionRowClass,
	positionsPanelTableHeadClass,
	positionsPanelTableHeaderClass,
	positionsPanelTableHeaderRowClass,
	positionsPanelTableShellClass,
	positionsPanelTabRootClass,
} from "./positions-panel-table-styles";

type CloseIntent = "close" | "reverse";

export function PositionsTab() {
	const { address, isConnected } = useConnection();
	const slippageBps = useMarketOrderSlippageBps();
	const closingKeyRef = useRef<string | null>(null);
	const { scope } = useExchangeScope();
	const { setSelectedMarket } = useMarketActions();
	const { setSide } = useOrderEntryActions();

	function handleSelectMarket(name: string, side: Side) {
		setSelectedMarket(scope, name);
		setSide(side);
	}
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

	const tpSlOrdersByCoin = useMemo(() => buildTpSlOrdersByCoin(openOrders), [openOrders]);

	const actionError = closeError?.message;

	function submitCloseOrReverse(
		intent: CloseIntent,
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
			kind: intent === "close" ? "marketClose" : "reverse",
			assetId,
			size,
			szDecimals,
			isLong,
			markPx,
			slippageBps,
		});

		const successMessage = intent === "close" ? t`Position closed` : t`Position reversed`;
		const failureMessage = intent === "close" ? t`Failed to close position` : t`Failed to reverse position`;

		placeOrder(
			{ orders, grouping },
			{
				onSuccess: () => {
					toast.success(successMessage + (coin ? ` — ${coin}` : ""));
				},
				onError: (error) => {
					toast.error(error.message || failureMessage);
				},
				onSettled: () => {
					closingKeyRef.current = null;
				},
			},
		);
	}

	function handleClosePosition(
		assetId: number,
		size: number,
		markPx: number,
		szDecimals: number,
		isLong: boolean,
		coin: string,
	) {
		submitCloseOrReverse("close", assetId, size, markPx, szDecimals, isLong, coin);
	}

	function handleReverse(
		assetId: number,
		size: number,
		markPx: number,
		szDecimals: number,
		isLong: boolean,
		coin: string,
	) {
		submitCloseOrReverse("reverse", assetId, size, markPx, szDecimals, isLong, coin);
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
					<span className="tabular-nums text-3xs text-fg-muted">
						{positions.length} {t`positions`}
					</span>
				) : null}
			</div>
			{actionError ? <div className="px-2.5 py-1 text-2xs text-error">{actionError}</div> : null}
			<div className={positionsPanelTableShellClass}>
				{placeholder ? (
					<div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{placeholder}</div>
				) : (
					<ScrollArea className="min-h-0 w-full flex-1">
						<Table className="table-fixed min-w-[64rem] w-full">
							<TableHeader className={positionsPanelTableHeaderClass}>
								<TableRow className={positionsPanelTableHeaderRowClass}>
									<TableHead
										scope="col"
										size="dense"
										className={cn(positionsPanelTableHeadClass, "w-[8%] min-w-0 text-left")}
									>
										{t`Asset`}
									</TableHead>
									<TableHead
										scope="col"
										size="dense"
										className={cn(positionsPanelTableHeadClass, "w-[14%] text-right")}
									>
										{t`Size`}
									</TableHead>
									<TableHead
										scope="col"
										size="dense"
										className={cn(positionsPanelTableHeadClass, "w-[12%] text-right")}
									>
										{t`Margin`}
									</TableHead>
									<TableHead scope="col" size="dense" className={cn(positionsPanelTableHeadClass, "w-[8%] text-right")}>
										{t`Entry`}
									</TableHead>
									<TableHead scope="col" size="dense" className={cn(positionsPanelTableHeadClass, "w-[9%] text-right")}>
										{t`Mark`}
									</TableHead>
									<TableHead scope="col" size="dense" className={cn(positionsPanelTableHeadClass, "w-[9%] text-right")}>
										{t`Liq`}
									</TableHead>
									<TableHead scope="col" size="dense" className={cn(positionsPanelTableHeadClass, "w-[8%] text-right")}>
										{t`Funding`}
									</TableHead>
									<TableHead
										scope="col"
										size="dense"
										className={cn(positionsPanelTableHeadClass, "w-[12%] text-right")}
									>
										{t`PNL`}
									</TableHead>
									<TableHead
										scope="col"
										size="dense"
										className={cn(positionsPanelTableHeadClass, "w-[10%] text-right")}
									>
										{t`TP/SL`}
									</TableHead>
									<TableHead
										scope="col"
										size="dense"
										className={cn(positionsPanelTableHeadClass, "w-[10%] text-right")}
									>
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
										onSelectMarket={handleSelectMarket}
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
