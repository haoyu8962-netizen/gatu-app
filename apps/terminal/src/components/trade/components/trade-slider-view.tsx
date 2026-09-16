import type { ComponentProps, Ref } from "react";
import { cn } from "@/lib/cn";

export const sliderFrame = "relative h-[33px] w-full";
export const sliderTrack = "absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-full";

interface Props {
	dir: ComponentProps<"div">["dir"];
	className?: string;
	unavailable?: boolean;
	inputId: string;
	ariaLabel: string;
	showTicks?: boolean;
	ticks: readonly number[];
	progress: number;
	rtl: boolean;
	controlRef?: Ref<HTMLDivElement>;
	indicatorRef?: Ref<HTMLDivElement>;
	ticksRef?: Ref<HTMLDivElement>;
	thumbRef?: Ref<HTMLDivElement>;
	inputRef?: Ref<HTMLInputElement>;
	controlProps?: Pick<
		ComponentProps<"div">,
		"onPointerDown" | "onPointerMove" | "onPointerUp" | "onPointerCancel" | "onLostPointerCapture"
	>;
	inputProps?: Pick<
		ComponentProps<"input">,
		| "min"
		| "max"
		| "step"
		| "defaultValue"
		| "disabled"
		| "aria-valuetext"
		| "aria-describedby"
		| "aria-invalid"
		| "onKeyDown"
		| "onInput"
		| "onBlur"
	>;
}

export function TradeSliderView({
	dir,
	className,
	unavailable,
	inputId,
	ariaLabel,
	showTicks,
	ticks,
	progress,
	rtl,
	controlRef,
	indicatorRef,
	ticksRef,
	thumbRef,
	inputRef,
	controlProps,
	inputProps,
}: Props) {
	return (
		<div
			dir={dir}
			data-base-ui-swipe-ignore=""
			className={cn("w-full select-none", unavailable && "cursor-not-allowed opacity-40", className)}
		>
			<label htmlFor={inputId} className="sr-only">
				{ariaLabel}
			</label>
			<div
				ref={controlRef}
				data-trade-slider-control=""
				className={cn("group/slider", sliderFrame, "touch-none cursor-pointer")}
				{...controlProps}
			>
				<div className={cn(sliderTrack, "bg-trading-panel-stroke-card")}>
					<div
						ref={indicatorRef}
						style={{
							transform: `scaleX(${progress})`,
							transformOrigin: rtl ? "right center" : "left center",
						}}
						className="absolute inset-0 origin-left rounded-full bg-trading-panel-control/25"
					/>
				</div>
				{showTicks && (
					<div ref={ticksRef} aria-hidden="true" className="pointer-events-none absolute inset-0">
						{ticks.map((percent) => (
							<span
								key={percent}
								data-percent={percent}
								data-active={percent <= progress * 100}
								style={{ insetInlineStart: `clamp(4px, ${percent}%, calc(100% - 4px))` }}
								className="absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-trading-panel-stroke-input data-[active=true]:bg-trading-panel-control rtl:translate-x-1/2"
							/>
						))}
					</div>
				)}
				<div
					ref={thumbRef}
					data-trade-slider-thumb=""
					style={{
						left: `clamp(9px, ${(rtl ? 1 - progress : progress) * 100}%, calc(100% - 9px))`,
						transform: "translate3d(-50%, -50%, 0)",
					}}
					className="absolute top-1/2 size-[18px] rounded-full border-2 border-trading-panel-control bg-trading-panel-slider-thumb after:pointer-events-none after:absolute after:inset-0 after:rounded-full after:bg-trading-panel-slider-thumb after:content-[''] before:absolute before:-inset-[13px] before:content-[''] has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-stroke-focus"
				>
					<span
						aria-hidden="true"
						className="pointer-events-none absolute -inset-px rounded-full bg-trading-panel-control/30 transition-transform duration-200 ease-in-out group-hover/slider:scale-[1.7] group-data-[dragging=true]/slider:scale-[2.2] motion-reduce:transition-none motion-reduce:!scale-100"
					/>
					<input
						ref={inputRef}
						id={inputId}
						type="range"
						{...inputProps}
						className="absolute -inset-[13px] size-11 opacity-0"
					/>
				</div>
			</div>
		</div>
	);
}
