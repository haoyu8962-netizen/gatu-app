import { Button } from "@gatu/ui";
import { t } from "@lingui/core/macro";
import { SpinnerGapIcon } from "@phosphor-icons/react";
import { type ComponentProps, type ReactNode, useCallback } from "react";
import { cn } from "@/lib/cn";
import { formatTransferError } from "@/lib/errors/format";
import { useTradingGuard } from "@/lib/hyperliquid";

type ButtonProps = ComponentProps<typeof Button>;

interface Props extends Omit<ButtonProps, "onClick"> {
	onClick: () => void | Promise<void>;
	children: ReactNode;
	containerClassName?: string;
	requireReadyConfirmation?: boolean;
}

export function TradingActionButton({
	onClick,
	children,
	containerClassName,
	requireReadyConfirmation = false,
	disabled,
	className,
	variant = "filled",
	intent = "neutral",
	...buttonProps
}: Props) {
	const { isReady, isEnabling, needsTrading, enableTrading, guardAction, error } = useTradingGuard();

	const handleClick = useCallback(() => {
		if (requireReadyConfirmation && !isReady) {
			enableTrading();
			return;
		}
		guardAction(onClick);
	}, [enableTrading, guardAction, isReady, onClick, requireReadyConfirmation]);

	const showEnableTrading = needsTrading && !isEnabling;

	return (
		<div className={cn("flex flex-col gap-1 items-end", containerClassName)}>
			<Button
				{...buttonProps}
				variant={variant}
				intent={intent}
				onClick={handleClick}
				disabled={disabled || isEnabling || (!isReady && !needsTrading)}
				className={className}
			>
				{isEnabling ? (
					<>
						<SpinnerGapIcon className="size-3 animate-spin" />
						{t`Enabling`}
					</>
				) : showEnableTrading ? (
					t`Enable`
				) : (
					children
				)}
			</Button>
			{error && (
				<p role="alert" className="w-full text-xs leading-normal text-error">
					{formatTransferError(error)}
				</p>
			)}
		</div>
	);
}
