import { useRef, useState } from "react";
import { useHip3DisclaimerRequirement } from "@/hooks/trade/use-hip3-disclaimer";
import { useHip3DisclaimerPresentation } from "@/hooks/trade/use-hip3-disclaimer-presentation";
import { type PositionReverseTarget, usePositionReverseSubmit } from "@/hooks/trade/use-position-reverse-submit";
import { useLingeringValue } from "@/hooks/use-lingering-value";
import { useNumberFormat } from "@/lib/format";
import { useMarkets } from "@/lib/hyperliquid";
import { toBig } from "@/lib/trade/numbers";
import type { PositionReverseSession } from "@/stores/use-position-dialog-store";
import { Hip3DeployerDisclaimer } from "../components/hip3-deployer-disclaimer";
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
		<PositionReverseDisclaimerGate
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

function PositionReverseDisclaimerGate({ target, open, onOpenChange }: ContentProps) {
	const hip3Requirement = useHip3DisclaimerRequirement(target.coin);
	const hip3Disclaimer = useHip3DisclaimerPresentation(hip3Requirement, "cancel", DIALOG_EXIT_MS);

	if (hip3Disclaimer) {
		return (
			<Hip3DeployerDisclaimer
				key={hip3Disclaimer.dex}
				open={open && hip3Disclaimer.open}
				documentationUrl={hip3Disclaimer.documentationUrl}
				exit={hip3Disclaimer.exit}
				onExit={() => onOpenChange(false)}
			/>
		);
	}

	return <PositionReverseConfirmationContent target={target} open={open} onOpenChange={onOpenChange} />;
}

function PositionReverseConfirmationContent({ target, open, onOpenChange }: ContentProps) {
	const { formatToken } = useNumberFormat();
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
			await submission.submit();
		} catch {
			return;
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
