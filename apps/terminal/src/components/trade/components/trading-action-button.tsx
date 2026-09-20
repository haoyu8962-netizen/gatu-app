import { Button } from "@gatu/ui";
import { useLingui } from "@lingui/react/macro";
import { SpinnerGapIcon } from "@phosphor-icons/react";
import { type ComponentProps, type MouseEvent, type ReactNode, useCallback } from "react";
import { usePressAndHold } from "@/hooks/ui/use-press-and-hold";
import { cn } from "@/lib/cn";
import { formatTransferError } from "@/lib/errors/format";
import { useTradingGuard } from "@/lib/hyperliquid";

type ButtonProps = ComponentProps<typeof Button>;

interface Props extends Omit<ButtonProps, "onClick"> {
	onClick: () => void | Promise<void>;
	children: ReactNode;
	containerClassName?: string;
	holdDurationMs?: number;
	holdProgressClassName?: string;
	isActivationLocked?: () => boolean;
	requireReadyConfirmation?: boolean;
	requiresBuilderFee?: boolean;
}

export function TradingActionButton({
	onClick,
	children,
	containerClassName,
	holdDurationMs,
	holdProgressClassName,
	isActivationLocked,
	requireReadyConfirmation = false,
	requiresBuilderFee = true,
	disabled,
	className,
	variant = "filled",
	intent = "neutral",
	onBlur,
	onKeyDown,
	onKeyUp,
	onLostPointerCapture,
	onPointerCancel,
	onPointerDown,
	onPointerLeave,
	onPointerMove,
	onPointerUp,
	...buttonProps
}: Props) {
	const { t } = useLingui();
	const { isReady, isEnabling, needsTrading, enableTrading, guardAction, error } = useTradingGuard({
		requiresBuilderFee,
	});
	const holdEnabled = typeof holdDurationMs === "number" && Number.isFinite(holdDurationMs) && holdDurationMs > 0;
	const buttonDisabled = disabled || isEnabling || (!isReady && !needsTrading);

	const runProtectedAction = useCallback(() => {
		if (isActivationLocked?.()) return;
		if (requireReadyConfirmation && !isReady) {
			enableTrading();
			return;
		}
		guardAction(onClick);
	}, [enableTrading, guardAction, isActivationLocked, isReady, onClick, requireReadyConfirmation]);
	const {
		handlers: holdHandlers,
		isHolding,
		progressPercent,
	} = usePressAndHold({
		disabled: !holdEnabled || !isReady || buttonDisabled,
		durationMs: holdDurationMs ?? 0,
		onComplete: runProtectedAction,
	});
	const holdArmed = holdEnabled && isReady && !buttonDisabled;

	const handleClick = useCallback(
		(event: MouseEvent<HTMLButtonElement>) => {
			if (holdArmed) {
				event.preventDefault();
				return;
			}
			runProtectedAction();
		},
		[holdArmed, runProtectedAction],
	);

	const showEnableTrading = needsTrading && !isEnabling;
	const buttonContent = isEnabling ? (
		<>
			<SpinnerGapIcon className="size-3 animate-spin" />
			{t`Enabling`}
		</>
	) : showEnableTrading ? (
		t`Enable`
	) : (
		children
	);

	return (
		<div className={cn("flex flex-col gap-1 items-end", containerClassName)}>
			<Button
				{...buttonProps}
				variant={variant}
				intent={intent}
				onClick={handleClick}
				onBlur={
					holdArmed
						? (event) => {
								holdHandlers.onBlur();
								onBlur?.(event);
							}
						: onBlur
				}
				onKeyDown={
					holdArmed
						? (event) => {
								holdHandlers.onKeyDown(event);
								onKeyDown?.(event);
							}
						: onKeyDown
				}
				onKeyUp={
					holdArmed
						? (event) => {
								holdHandlers.onKeyUp(event);
								onKeyUp?.(event);
							}
						: onKeyUp
				}
				onLostPointerCapture={
					holdArmed
						? (event) => {
								holdHandlers.onLostPointerCapture(event);
								onLostPointerCapture?.(event);
							}
						: onLostPointerCapture
				}
				onPointerCancel={
					holdArmed
						? (event) => {
								holdHandlers.onPointerCancel(event);
								onPointerCancel?.(event);
							}
						: onPointerCancel
				}
				onPointerDown={
					holdArmed
						? (event) => {
								holdHandlers.onPointerDown(event);
								onPointerDown?.(event);
							}
						: onPointerDown
				}
				onPointerLeave={
					holdArmed
						? (event) => {
								holdHandlers.onPointerLeave(event);
								onPointerLeave?.(event);
							}
						: onPointerLeave
				}
				onPointerMove={
					holdArmed
						? (event) => {
								holdHandlers.onPointerMove(event);
								onPointerMove?.(event);
							}
						: onPointerMove
				}
				onPointerUp={
					holdArmed
						? (event) => {
								holdHandlers.onPointerUp(event);
								onPointerUp?.(event);
							}
						: onPointerUp
				}
				disabled={buttonDisabled}
				className={cn(className, holdEnabled && "relative overflow-hidden touch-none")}
				data-holding={isHolding || undefined}
			>
				{holdEnabled && (
					<span
						aria-hidden="true"
						data-slot="hold-progress"
						className={cn("pointer-events-none absolute inset-y-0 start-0 bg-fill-inverse/20", holdProgressClassName)}
						style={{ width: `${progressPercent}%` }}
					/>
				)}
				{holdEnabled ? (
					<span className="relative z-[1] inline-flex items-center justify-center gap-2">{buttonContent}</span>
				) : (
					buttonContent
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
