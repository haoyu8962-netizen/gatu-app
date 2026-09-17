import { useLingui } from "@lingui/react/macro";
import { toast } from "sonner";
import { type PositionReverseTarget, usePositionReverseSubmit } from "@/hooks/trade/use-position-reverse-submit";
import { useLingeringValue } from "@/hooks/use-lingering-value";
import { formatToken } from "@/lib/format";
import { useMarkets } from "@/lib/hyperliquid";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";
import { toBig } from "@/lib/trade/numbers";
import { PositionReverseConfirmationModal } from "./position-reverse-confirmation-modal";

interface Props {
	target: PositionReverseTarget | null;
	onOpenChange: (open: boolean) => void;
}

const DIALOG_EXIT_MS = 250;

export function PositionReverseConfirmationController({ target, onOpenChange }: Props) {
	const displayedTarget = useLingeringValue(target, DIALOG_EXIT_MS);
	if (!displayedTarget) return null;
	return (
		<PositionReverseConfirmationContent
			key={getTargetKey(displayedTarget)}
			target={displayedTarget}
			open={target !== null}
			onOpenChange={onOpenChange}
		/>
	);
}

interface ContentProps {
	target: PositionReverseTarget;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

function PositionReverseConfirmationContent({ target, open, onOpenChange }: ContentProps) {
	useNumberFormatRevision();
	const { t } = useLingui();
	const markets = useMarkets();
	const submission = usePositionReverseSubmit(target);
	const market = markets.getMarket(target.coin);
	const marketLabel = market?.pairName ?? market?.shortName ?? target.coin;
	const sizeSymbol = market?.shortName ?? target.coin.split(":").pop() ?? target.coin;
	const signedSize = toBig(target.signedPositionSize);
	const reverseSize = signedSize?.abs().times(2).toString() ?? "0";
	const reverseSizeLabel = formatToken(reverseSize, { decimals: target.szDecimals, symbol: sizeSymbol });
	const currentDirection = signedSize?.gt(0) ? "long" : "short";

	async function handleConfirm() {
		try {
			const outcome = await submission.submit();
			if (outcome.state === "blocked") {
				toast.warning(t`Another order for this market is still being confirmed.`);
				return;
			}
			if (outcome.state === "reconciling") {
				toast.info(t`Order submitted. Confirming exchange status; do not retry.`);
				onOpenChange(false);
				return;
			}
			const filledSize = getFilledSize(outcome.result.response?.data?.statuses);
			const filledSizeLabel = filledSize
				? formatToken(filledSize, { decimals: target.szDecimals, symbol: sizeSymbol })
				: null;
			toast.success(t`Position reversed — ${marketLabel}`, {
				description: filledSizeLabel ? t`Reverse order filled for ${filledSizeLabel}.` : t`Reverse order filled.`,
			});
			onOpenChange(false);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : t`Failed to reverse position`);
		}
	}

	function handleOpenChange(open: boolean) {
		if (!open) submission.resetError();
		onOpenChange(open);
	}

	return (
		<PositionReverseConfirmationModal
			open={open}
			marketLabel={marketLabel}
			currentDirection={currentDirection}
			reverseSizeLabel={reverseSizeLabel}
			isSubmitting={submission.isPending}
			isConfirmDisabled={submission.isPending || submission.isReconciling}
			errorMessage={submission.error}
			onOpenChange={handleOpenChange}
			onConfirm={() => void handleConfirm()}
		/>
	);
}

function getTargetKey(target: PositionReverseTarget): string {
	return `${target.owner}:${target.env}:${target.dex}:${target.coin}:${target.assetId}:${target.signedPositionSize}`;
}

function getFilledSize(statuses: unknown[] | undefined): string | null {
	for (const status of statuses ?? []) {
		if (!status || typeof status !== "object" || !("filled" in status)) continue;
		const filled = status.filled;
		if (filled && typeof filled === "object" && "totalSz" in filled && typeof filled.totalSz === "string") {
			return filled.totalSz;
		}
	}
	return null;
}
