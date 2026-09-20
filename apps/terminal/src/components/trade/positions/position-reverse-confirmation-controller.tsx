import { useLingui } from "@lingui/react/macro";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { type PositionReverseTarget, usePositionReverseSubmit } from "@/hooks/trade/use-position-reverse-submit";
import { useLingeringValue } from "@/hooks/use-lingering-value";
import { formatToken } from "@/lib/format";
import { useMarkets } from "@/lib/hyperliquid";
import { useNumberFormatRevision } from "@/lib/number-format-reactivity";
import { toBig } from "@/lib/trade/numbers";
import type { PositionReverseSession } from "@/stores/use-position-dialog-store";
import { PositionReverseConfirmationModal } from "./position-reverse-confirmation-modal";

interface Props {
	session: PositionReverseSession | null;
	onSessionEnd: (sessionId: string) => void;
}

const DIALOG_EXIT_MS = 250;

export function PositionReverseConfirmationController({ session, onSessionEnd }: Props) {
	const displayedSession = useLingeringValue(session, DIALOG_EXIT_MS);
	if (!displayedSession) return null;
	return (
		<PositionReverseConfirmationContent
			key={displayedSession.sessionId}
			target={displayedSession.target}
			open={session?.sessionId === displayedSession.sessionId}
			onOpenChange={(open) => {
				if (!open) onSessionEnd(displayedSession.sessionId);
			}}
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
	const submittedRef = useRef(false);
	const [isSubmitted, setIsSubmitted] = useState(false);
	const market = markets.getMarket(target.coin);
	const marketLabel = market?.pairName ?? market?.shortName ?? target.coin;
	const sizeSymbol = market?.shortName ?? target.coin.split(":").pop() ?? target.coin;
	const signedSize = toBig(target.signedPositionSize);
	const reverseSize = signedSize?.abs().times(2).toString() ?? "0";
	const reverseSizeLabel = formatToken(reverseSize, { decimals: target.szDecimals, symbol: sizeSymbol });
	const currentDirection = signedSize?.gt(0) ? "long" : "short";

	async function handleConfirm() {
		if (!open || submittedRef.current) return;
		submittedRef.current = true;
		setIsSubmitted(true);
		try {
			const outcome = await submission.submit();
			if (outcome.state === "blocked") {
				toast.warning(t`Another order for this market is still being confirmed.`);
			} else if (outcome.state === "reconciling") {
				toast.info(t`Order submitted. Confirming exchange status; do not retry.`);
			} else {
				const filledSize = getFilledSize(outcome.result.response?.data?.statuses);
				const filledSizeLabel = filledSize
					? formatToken(filledSize, { decimals: target.szDecimals, symbol: sizeSymbol })
					: null;
				toast.success(t`Position reversed — ${marketLabel}`, {
					description: filledSizeLabel ? t`Reverse order filled for ${filledSizeLabel}.` : t`Reverse order filled.`,
				});
			}
		} catch (error) {
			toast.error(error instanceof Error ? error.message : t`Failed to reverse position`);
		} finally {
			onOpenChange(false);
		}
	}

	function handleOpenChange(nextOpen: boolean) {
		if (submittedRef.current) return;
		onOpenChange(nextOpen);
	}

	return (
		<PositionReverseConfirmationModal
			open={open && !isSubmitted}
			marketLabel={marketLabel}
			currentDirection={currentDirection}
			reverseSizeLabel={reverseSizeLabel}
			isConfirmDisabled={!open || isSubmitted}
			onOpenChange={handleOpenChange}
			onConfirm={() => void handleConfirm()}
		/>
	);
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
