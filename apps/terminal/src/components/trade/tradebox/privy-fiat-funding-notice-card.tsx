import { useLingui } from "@lingui/react/macro";
import { XIcon } from "@phosphor-icons/react";
import { Button } from "@sairn/ui";
import { useEffect, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { StatusGlyph } from "@/components/brand/status-glyph";
import { getPrivyFiatFundingOwnerKey } from "@/domain/trade/privy-fiat-funding-owner-key";
import { useIsFrontToast } from "@/hooks/ui/use-is-front-toast";
import { cn } from "@/lib/cn";
import { useHyperliquid } from "@/lib/hyperliquid";
import {
	getPrivyFiatFundingFeedback,
	getPrivyFiatFundingNoticeGlyph,
	type PrivyFiatFundingFeedbackTone,
} from "@/lib/trade/privy-fiat-funding-feedback";
import type { PrivyFiatFundingNoticePresentation } from "@/lib/trade/privy-fiat-funding-notice-presentation";
import { useIsTestnet } from "@/stores/use-global-settings-store";

const TITLE_TONE_CLASS: Record<PrivyFiatFundingFeedbackTone, string> = {
	error: "text-error",
	success: "text-success",
	uncertain: "text-fg",
	warning: "text-fg",
};

interface Props {
	presentation: PrivyFiatFundingNoticePresentation;
	onDismiss: () => void;
	onLayout: (front: boolean, locale: string) => void;
}

export function PrivyFiatFundingNoticeCard({ presentation, onDismiss, onLayout }: Props) {
	const { t, i18n } = useLingui();
	const { clientKey } = useHyperliquid();
	const isTestnet = useIsTestnet();
	const active = useSyncExternalStore(presentation.subscribe, presentation.getSnapshot, presentation.getSnapshot);
	const { notice, toastId } = presentation;
	const [content, setContent] = useState<HTMLElement | null>(null);
	const front = useIsFrontToast(content);
	const visible =
		active && notice.ownerKey === getPrivyFiatFundingOwnerKey(isTestnet ? "testnet" : "mainnet", clientKey);

	useEffect(() => {
		if (visible) return;
		presentation.invalidate();
		toast.dismiss(toastId);
	}, [presentation, toastId, visible]);

	useEffect(() => {
		if (content) onLayout(front, i18n.locale);
	}, [content, front, i18n.locale, onLayout]);

	if (!visible) return null;
	const feedback = getPrivyFiatFundingFeedback(notice, (descriptor) => t(descriptor));
	return (
		<section
			ref={setContent}
			aria-label={feedback.title}
			data-privy-fiat-funding-notice={notice.kind}
			className="flex w-full items-start gap-3 rounded-8 border border-stroke-weak bg-overlay p-3 font-sans text-xs shadow-overlay"
		>
			<StatusGlyph glyph={getPrivyFiatFundingNoticeGlyph(notice)} />
			<div
				role={feedback.tone === "error" ? "alert" : "status"}
				aria-atomic="true"
				className="min-w-0 flex-1 space-y-1 [overflow-wrap:anywhere]"
			>
				<p dir="auto" className={cn("font-medium", TITLE_TONE_CLASS[feedback.tone])}>
					{feedback.title}
				</p>
				{feedback.descriptionLines.map((line) => (
					<p key={line} dir="auto" className="text-fg-muted">
						{line}
					</p>
				))}
			</div>
			<Button
				variant="ghost"
				intent="neutral"
				size="xs"
				onClick={onDismiss}
				aria-label={t`Dismiss`}
				className="min-h-6 min-w-6 shrink-0"
			>
				<XIcon className="size-4" />
			</Button>
		</section>
	);
}
