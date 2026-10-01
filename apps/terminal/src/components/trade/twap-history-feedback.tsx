import { useLingui } from "@lingui/react/macro";
import { Button } from "@sairn/ui";
import { cn } from "@/lib/cn";

interface RealtimeRetryProps {
	className?: string;
	onRetry: () => void;
}

export function TwapRealtimeRetry({ className, onRetry }: RealtimeRetryProps) {
	const { t } = useLingui();

	return (
		<div className={cn("flex shrink-0 justify-end px-3 py-1.5", className)}>
			<Button
				variant="outline"
				intent="neutral"
				size="xxs"
				className="shrink-0 max-[1000px]:min-h-11"
				onClick={onRetry}
			>
				{t`Retry`}
			</Button>
		</div>
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
