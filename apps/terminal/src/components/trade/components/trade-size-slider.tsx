import { Slider, type SliderProps, type SliderThumbSize } from "@gatu/ui";
import Big from "big.js";
import { useCallback, useEffect, useRef, useState } from "react";

type SliderCommitDetails = Parameters<NonNullable<SliderProps["onValueCommitted"]>>[1];

interface Props {
	value: number;
	onPercentChange: (value: number) => void;
	onPercentCommit?: (value: number, details: SliderCommitDetails) => void;
	disabled?: boolean;
	thumbSize?: SliderThumbSize;
	ariaLabel: string;
	ariaValueText?: string;
	ariaDescribedBy?: string;
	ariaInvalid?: boolean;
	thumbAlignment?: SliderProps["thumbAlignment"];
	className?: string;
	controlClassName?: string;
	trackClassName?: string;
	indicatorClassName?: string;
	thumbClassName?: string;
}

export function TradeSizeSlider({
	value,
	onPercentChange,
	onPercentCommit,
	disabled,
	thumbSize,
	ariaLabel,
	ariaValueText,
	ariaDescribedBy,
	ariaInvalid,
	thumbAlignment,
	className,
	controlClassName,
	trackClassName,
	indicatorClassName,
	thumbClassName,
}: Props) {
	const sliderRootRef = useRef<HTMLDivElement>(null);
	const activePointerIdRef = useRef<number | null>(null);
	const interactionStartRef = useRef(value);
	const onPercentChangeRef = useRef(onPercentChange);
	const [lifecycleVersion, setLifecycleVersion] = useState(0);

	onPercentChangeRef.current = onPercentChange;

	const cancelActivePreview = useCallback(() => {
		if (activePointerIdRef.current === null) return;

		activePointerIdRef.current = null;
		const sliderRoot = sliderRootRef.current;
		sliderRoot?.removeAttribute("data-dragging");
		const nativeInput = sliderRoot?.querySelector<HTMLInputElement>('input[type="range"]');
		if (nativeInput) nativeInput.value = String(interactionStartRef.current);
		onPercentChangeRef.current(interactionStartRef.current);
		setLifecycleVersion((version) => version + 1);
	}, []);

	useEffect(() => {
		function handlePointerCancel(event: PointerEvent) {
			const activePointerId = activePointerIdRef.current;
			if (activePointerId === null || event.pointerId !== activePointerId) return;
			cancelActivePreview();
		}

		function handleVisibilityChange() {
			if (document.visibilityState === "hidden") cancelActivePreview();
		}

		document.addEventListener("pointercancel", handlePointerCancel);
		document.addEventListener("visibilitychange", handleVisibilityChange);
		return () => {
			document.removeEventListener("pointercancel", handlePointerCancel);
			document.removeEventListener("visibilitychange", handleVisibilityChange);
		};
	}, [cancelActivePreview]);

	return (
		<Slider
			key={lifecycleVersion}
			ref={sliderRootRef}
			aria-describedby={ariaDescribedBy}
			aria-invalid={ariaInvalid}
			className={className}
			label={ariaLabel}
			labelHidden
			format={{ style: "unit", unit: "percent", maximumFractionDigits: 1 }}
			getAriaValueText={ariaValueText ? () => ariaValueText : undefined}
			thumbSize={thumbSize}
			thumbAlignment={thumbAlignment}
			controlClassName={controlClassName}
			trackClassName={trackClassName}
			indicatorClassName={indicatorClassName}
			thumbClassName={thumbClassName}
			value={value}
			onPointerDownCapture={(event) => {
				if (disabled || event.button !== 0) return;
				interactionStartRef.current = value;
				activePointerIdRef.current = event.pointerId;
			}}
			onLostPointerCapture={(event) => {
				if (event.pointerId === activePointerIdRef.current) cancelActivePreview();
			}}
			onValueChange={(nextValue, eventDetails) => {
				if (typeof nextValue !== "number" || eventDetails.reason === "none") return;
				onPercentChange(normalizePercent(nextValue));
			}}
			onValueCommitted={
				onPercentCommit
					? (nextValue, eventDetails) => {
							if (typeof nextValue !== "number" || eventDetails.reason === "none") return;
							if (
								(eventDetails.reason === "drag" || eventDetails.reason === "track-press") &&
								activePointerIdRef.current === null
							) {
								return;
							}
							activePointerIdRef.current = null;
							onPercentCommit(normalizePercent(nextValue), eventDetails);
						}
					: undefined
			}
			max={100}
			step={0.1}
			disabled={disabled}
		/>
	);
}

function normalizePercent(value: number): number {
	try {
		const normalized = Big(String(value)).round(1, Big.roundHalfUp);
		if (normalized.lt(0)) return 0;
		if (normalized.gt(100)) return 100;
		return normalized.toNumber();
	} catch {
		return 0;
	}
}
