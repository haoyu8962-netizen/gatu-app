import { Button } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import { WarningCircleIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";

interface RealtimeWarningProps {
	className?: string;
	error: unknown;
	onRetry: () => void;
}

export function TwapRealtimeWarning({ className, error, onRetry }: RealtimeWarningProps) {
	const { t } = useLingui();
	const errorMessage = error instanceof Error ? error.message : undefined;

	return (
		<output
			aria-live="polite"
			title={errorMessage}
			className={cn(
				"flex shrink-0 items-center gap-2 border-b border-warning/20 bg-warning/5 px-3 py-1.5 text-xs text-warning",
				className,
			)}
		>
			<WarningCircleIcon className="size-3.5 shrink-0" weight="fill" aria-hidden="true" />
			<span className="min-w-0 flex-1">{t`Real-time TWAP updates are unavailable. Showing the latest loaded data.`}</span>
			<Button
				variant="outline"
				intent="neutral"
				size="xxs"
				className="shrink-0 max-[1000px]:min-h-11"
				onClick={onRetry}
			>
				{t`Retry`}
			</Button>
		</output>
	);
}

interface LoadMoreProps {
	className?: string;
	onLoadMore: () => void;
}

export function TwapHistoryLoadMore({ className, onLoadMore }: LoadMoreProps) {
	const { t } = useLingui();

	return (
		<div className={cn("flex shrink-0 justify-center border-t border-stroke-weak/60 px-3 py-2", className)}>
			<Button variant="outline" intent="neutral" size="xs" className="max-[1000px]:min-h-11" onClick={onLoadMore}>
				{t`Load more`}
			</Button>
		</div>
	);
}
