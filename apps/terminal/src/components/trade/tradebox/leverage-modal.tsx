import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { Button, Modal, ModalContent, ModalFooter, ModalHeader, ModalPopup, ModalTitle } from "@sairn/ui";
import { memo, useEffect, useRef, useState } from "react";
import type { MarginTierInput } from "@/domain/trade/order/liquidation";
import { classifyActionError, isAmbiguousExchangeActionError } from "@/lib/errors/action-error";
import { useHyperliquid } from "@/lib/hyperliquid";
import { addOrderQueueItem, removeOrderQueueItem, updateOrderQueueItem } from "@/stores/use-order-queue-store";
import { TradingActionButton } from "../components/trading-action-button";
import { LeverageEditor } from "./leverage-editor";

interface Props {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	currentLeverage: number;
	pendingLeverage: number | null;
	committedLeverage?: number | null;
	maxLeverage: number;
	onPendingLeverageChange: (value: number) => void;
	isUpdating: boolean;
	onApply: (leverage: number) => Promise<number | null>;
	marketIdentity?: string;
	marginTiers?: readonly MarginTierInput[] | null;
	quoteSymbol?: string | null;
}

function LeverageModalComponent({ open, onOpenChange, marketIdentity, ...contentProps }: Props) {
	const { t } = useLingui();

	return (
		<Modal open={open} onOpenChange={onOpenChange}>
			<ModalPopup
				size="sm"
				showClose
				closeLabel={t`Close`}
				overlayClassName="bg-trading-panel-scrim"
				className="font-market-close"
			>
				<LeverageModalContent
					key={marketIdentity ?? "market"}
					{...contentProps}
					open={open}
					onOpenChange={onOpenChange}
				/>
			</ModalPopup>
		</Modal>
	);
}

export const LeverageModal = memo(LeverageModalComponent);

type LeverageModalContentProps = Omit<Props, "marketIdentity">;

function LeverageModalContent({
	open,
	onOpenChange,
	currentLeverage,
	pendingLeverage,
	committedLeverage: appliedLeverage = null,
	maxLeverage,
	onPendingLeverageChange,
	isUpdating,
	onApply,
	marginTiers,
	quoteSymbol,
}: LeverageModalContentProps) {
	const { clientKey, env } = useHyperliquid();
	const [dragLeverage, setDragLeverage] = useState<number | null>(null);
	const leverageDragActiveRef = useRef(false);
	const [leverageInputValid, setLeverageInputValid] = useState(true);
	const applyInFlightRef = useRef(false);

	useEffect(() => {
		if (open) return;
		leverageDragActiveRef.current = false;
		setDragLeverage(null);
		setLeverageInputValid(true);
	}, [open]);

	const effectiveLeverage = appliedLeverage ?? currentLeverage;
	const canonicalLeverage = pendingLeverage ?? effectiveLeverage;
	const displayLeverage = dragLeverage ?? canonicalLeverage;
	const isDirty = pendingLeverage !== null && pendingLeverage !== effectiveLeverage;

	function handleLeverageChange(value: number) {
		leverageDragActiveRef.current = false;
		setDragLeverage(null);
		onPendingLeverageChange(value);
	}

	function handleLeverageDraftChange(value: number | null) {
		leverageDragActiveRef.current = value !== null;
		setDragLeverage(value);
	}

	function isLeverageDragActive() {
		return leverageDragActiveRef.current;
	}

	async function handleConfirm(): Promise<void> {
		if (
			!open ||
			!isDirty ||
			leverageDragActiveRef.current ||
			dragLeverage !== null ||
			!leverageInputValid ||
			isUpdating ||
			applyInFlightRef.current
		)
			return;
		applyInFlightRef.current = true;
		const notificationId = addOrderQueueItem({ owner: clientKey, env, title: msg`Adjust leverage`, status: "pending" });
		onOpenChange(false);
		try {
			const leverage = await onApply(canonicalLeverage);
			if (leverage === null) {
				removeOrderQueueItem(notificationId);
				return;
			}
			updateOrderQueueItem(notificationId, { status: "success", message: msg`Leverage updated to ${leverage}x` });
		} catch (error) {
			const unknown = isAmbiguousExchangeActionError(error);
			updateOrderQueueItem(notificationId, {
				status: unknown ? "unconfirmed" : "failed",
				error: unknown ? undefined : classifyActionError(error),
				message: unknown ? msg`Update not confirmed. Check account settings before retrying.` : msg`Update failed`,
			});
		} finally {
			applyInFlightRef.current = false;
		}
	}

	return (
		<>
			<ModalHeader>
				<ModalTitle>
					<Trans>Adjust leverage</Trans>
				</ModalTitle>
			</ModalHeader>
			<ModalContent className="space-y-4">
				<LeverageEditor
					key={maxLeverage}
					value={displayLeverage}
					max={maxLeverage}
					disabled={isUpdating || !open}
					onChange={handleLeverageChange}
					onDraftChange={handleLeverageDraftChange}
					onInputValidityChange={setLeverageInputValid}
					variant="modal"
					marginTiers={marginTiers}
					quoteSymbol={quoteSymbol}
				/>
			</ModalContent>
			<ModalFooter>
				<Button
					variant="outline"
					intent="neutral"
					size="sm"
					onClick={() => onOpenChange(false)}
					className="min-h-10 flex-1 rounded-[10px] border-trading-panel-stroke-input font-semibold text-trading-panel-fg shadow-none"
				>
					<Trans>Cancel</Trans>
				</Button>
				<TradingActionButton
					requiresBuilderFee={false}
					onClick={handleConfirm}
					isActivationLocked={isLeverageDragActive}
					disabled={!open || !isDirty || !leverageInputValid || isUpdating}
					containerClassName="flex-1"
					className="gap-1.5 min-h-10 w-full flex-1 rounded-[10px] bg-trading-panel-control font-bold text-trading-panel-on-control hover:opacity-90"
				>
					<Trans>Confirm</Trans>
				</TradingActionButton>
			</ModalFooter>
		</>
	);
}
