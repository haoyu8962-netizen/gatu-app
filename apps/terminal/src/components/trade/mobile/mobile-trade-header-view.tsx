import { CaretDownIcon } from "@phosphor-icons/react";
import type { ComponentPropsWithRef, ReactNode } from "react";
import { cn } from "@/lib/cn";

export const orderControl =
	"relative flex h-[35px] min-w-0 items-center gap-3 whitespace-nowrap rounded-none bg-surface px-0 text-xs font-semibold text-trading-panel-fg";
export const orderCaret = "h-1.5 w-[9px] shrink-0 text-trading-panel-subtle";

export const MOBILE_ORDER_CONTROL_CLASS = cn(
	orderControl,
	"transition-opacity active:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-trading-panel-focus",
	"disabled:cursor-not-allowed disabled:text-fg-disabled",
);
interface Props {
	orderTypeControl: ReactNode;
	sideToggle: ReactNode;
	isLeveraged?: boolean;
	marginLabel: string;
	leverage?: number;
	onMarginClick?: () => void;
	onLeverageClick?: () => void;
}
export function MobileTradeHeaderView({
	orderTypeControl,
	sideToggle,
	isLeveraged,
	marginLabel,
	leverage,
	onMarginClick,
	onLeverageClick,
}: Props) {
	return (
		<div className="min-w-0 space-y-0.5">
			<div
				className={cn(
					"grid min-w-0 bg-surface",
					isLeveraged ? "grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]" : "grid-cols-1",
				)}
			>
				{orderTypeControl}
				{isLeveraged && (
					<>
						<button
							type="button"
							onClick={onMarginClick}
							className={cn(MOBILE_ORDER_CONTROL_CLASS, "justify-start")}
							aria-haspopup="dialog"
						>
							<span className="truncate">{marginLabel}</span>
							<CaretDownIcon viewBox="32 72 192 128" className={orderCaret} />
						</button>
						<button
							type="button"
							onClick={onLeverageClick}
							className={cn(MOBILE_ORDER_CONTROL_CLASS, "justify-start pr-4")}
							aria-haspopup="dialog"
						>
							<span className="truncate tabular-nums">{leverage ?? 1}x</span>
							<CaretDownIcon viewBox="32 72 192 128" className={orderCaret} />
						</button>
					</>
				)}
			</div>

			{sideToggle}
		</div>
	);
}

export function MobileOrderTypeTriggerView({
	label,
	className,
	...props
}: ComponentPropsWithRef<"button"> & { label: string }) {
	return (
		<button
			type="button"
			{...props}
			className={cn(
				"group inline-flex items-center justify-center cursor-pointer select-none rounded-8 border-0 bg-transparent shadow-none appearance-none font-normal transition-colors duration-150 motion-reduce:transition-none hover:text-fg data-[popup-open]:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus data-disabled:text-fg-disabled data-disabled:cursor-not-allowed gap-0.5 px-1.5 py-0.5 text-xs",
				MOBILE_ORDER_CONTROL_CLASS,
				"w-full justify-start",
				className,
			)}
		>
			<span className="inline-flex min-w-0 items-center justify-center gap-3">
				<span className="truncate" title={label}>
					{label}
				</span>
				<CaretDownIcon viewBox="32 72 192 128" className={orderCaret} />
			</span>
		</button>
	);
}
