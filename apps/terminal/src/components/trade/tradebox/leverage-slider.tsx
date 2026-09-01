import { useDirection } from "@base-ui/react/direction-provider";
import { useLingui } from "@lingui/react/macro";
import {
	type CSSProperties,
	type FormEvent,
	type KeyboardEvent,
	type PointerEvent,
	useEffect,
	useId,
	useLayoutEffect,
	useRef,
} from "react";
import { cn } from "@/lib/cn";

interface Props {
	value: number;
	onChange: (value: number) => void;
	onCommit?: (value: number) => void;
	onCancel?: () => void;
	max: number;
	disabled?: boolean;
	className?: string;
	controlClassName?: string;
	trackClassName?: string;
	indicatorClassName?: string;
	thumbClassName?: string;
}

interface DragState {
	pointerId: number;
	left: number;
	width: number;
	rtl: boolean;
	startValue: number;
}

const KEYBOARD_KEYS = new Set(["ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp", "End", "Home", "PageDown", "PageUp"]);
const useBrowserLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function clampLeverage(value: number, max: number): number {
	return Math.min(max, Math.max(1, value));
}

function getProgress(value: number, max: number): number {
	if (max <= 1) return 0;
	return (clampLeverage(value, max) - 1) / (max - 1);
}

function getLeverageFromProgress(progress: number, max: number): number {
	return clampLeverage(Math.round(1 + progress * (max - 1)), max);
}

export function LeverageSlider({
	value,
	onChange,
	onCommit,
	onCancel,
	max,
	disabled,
	className,
	controlClassName,
	trackClassName,
	indicatorClassName,
	thumbClassName,
}: Props) {
	const { t } = useLingui();
	const direction = useDirection();
	const inputId = useId();
	const controlRef = useRef<HTMLDivElement>(null);
	const indicatorRef = useRef<HTMLDivElement>(null);
	const thumbRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const dragRef = useRef<DragState | null>(null);
	const frameRef = useRef<number | null>(null);
	const pointerListenerCleanupRef = useRef<(() => void) | null>(null);
	const latestProgressRef = useRef(getProgress(value, max));
	const lastDraftRef = useRef(clampLeverage(Math.round(value), max));
	const previousMaxRef = useRef(max);
	const previousDirectionRef = useRef(direction);
	const initialProgressRef = useRef(getProgress(value, max));
	const initialPhysicalProgressRef = useRef(
		direction === "rtl" ? 1 - initialProgressRef.current : initialProgressRef.current,
	);
	const initialIndicatorStyleRef = useRef<CSSProperties>({
		transform: `scaleX(${initialProgressRef.current})`,
		transformOrigin: direction === "rtl" ? "right center" : "left center",
	});
	const initialThumbStyleRef = useRef<CSSProperties>({
		left: `${initialPhysicalProgressRef.current * 100}%`,
		transform: "translate3d(-50%, -50%, 0)",
	});

	function updateInput(valueToShow: number) {
		if (inputRef.current) inputRef.current.value = String(valueToShow);
	}

	function renderIdleValue(nextValue: number) {
		const progress = getProgress(nextValue, max);
		const physicalProgress = direction === "rtl" ? 1 - progress : progress;
		latestProgressRef.current = progress;
		if (indicatorRef.current) {
			indicatorRef.current.style.transform = `scaleX(${progress})`;
			indicatorRef.current.style.transformOrigin = direction === "rtl" ? "right center" : "left center";
		}
		if (thumbRef.current) {
			thumbRef.current.style.left = `${physicalProgress * 100}%`;
			thumbRef.current.style.transform = "translate3d(-50%, -50%, 0)";
		}
		updateInput(clampLeverage(Math.round(nextValue), max));
	}

	function renderDraggingProgress(progress: number) {
		const drag = dragRef.current;
		if (!drag) return;
		const normalized = Math.min(1, Math.max(0, progress));
		const physicalProgress = drag.rtl ? 1 - normalized : normalized;
		latestProgressRef.current = normalized;
		if (indicatorRef.current) indicatorRef.current.style.transform = `scaleX(${normalized})`;
		if (thumbRef.current) {
			thumbRef.current.style.transform = `translate3d(${physicalProgress * drag.width}px, -50%, 0) translateX(-50%)`;
		}
		const nextLeverage = getLeverageFromProgress(normalized, max);
		if (nextLeverage === lastDraftRef.current) return;
		lastDraftRef.current = nextLeverage;
		updateInput(nextLeverage);
		onChange(nextLeverage);
	}

	function flushFrame() {
		if (frameRef.current !== null) {
			window.cancelAnimationFrame(frameRef.current);
			frameRef.current = null;
		}
		renderDraggingProgress(latestProgressRef.current);
	}

	function scheduleProgress(progress: number) {
		latestProgressRef.current = progress;
		if (frameRef.current !== null) return;
		frameRef.current = window.requestAnimationFrame(() => {
			frameRef.current = null;
			renderDraggingProgress(latestProgressRef.current);
		});
	}

	function getPointerProgress(clientX: number, drag: DragState): number {
		const raw = Math.min(1, Math.max(0, (clientX - drag.left) / drag.width));
		return drag.rtl ? 1 - raw : raw;
	}

	function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
		if (dragRef.current || disabled || max <= 1 || (event.pointerType === "mouse" && event.button !== 0)) return;
		const rect = event.currentTarget.getBoundingClientRect();
		if (rect.width <= 0) return;
		const pointerId = event.pointerId;
		dragRef.current = {
			pointerId,
			left: rect.left,
			width: rect.width,
			rtl: direction === "rtl",
			startValue: clampLeverage(Math.round(value), max),
		};
		lastDraftRef.current = dragRef.current.startValue;
		event.currentTarget.setPointerCapture?.(pointerId);
		inputRef.current?.focus({ preventScroll: true });
		if (indicatorRef.current) {
			indicatorRef.current.style.transformOrigin = direction === "rtl" ? "right center" : "left center";
		}
		if (thumbRef.current) thumbRef.current.style.left = "0px";
		const ownerDocument = event.currentTarget.ownerDocument;
		function handlePointerUp(nativeEvent: globalThis.PointerEvent) {
			finishPointer(nativeEvent.pointerId, true, nativeEvent.clientX);
		}
		function handlePointerCancel(nativeEvent: globalThis.PointerEvent) {
			finishPointer(nativeEvent.pointerId, false);
		}
		function handleVisibilityChange() {
			if (ownerDocument.visibilityState === "hidden") finishPointer(pointerId, false);
		}
		function handleWindowBlur() {
			finishPointer(pointerId, false);
		}
		const ownerWindow = ownerDocument.defaultView;
		ownerDocument.addEventListener("pointerup", handlePointerUp);
		ownerDocument.addEventListener("pointercancel", handlePointerCancel);
		ownerDocument.addEventListener("visibilitychange", handleVisibilityChange);
		ownerWindow?.addEventListener("blur", handleWindowBlur);
		pointerListenerCleanupRef.current = () => {
			ownerDocument.removeEventListener("pointerup", handlePointerUp);
			ownerDocument.removeEventListener("pointercancel", handlePointerCancel);
			ownerDocument.removeEventListener("visibilitychange", handleVisibilityChange);
			ownerWindow?.removeEventListener("blur", handleWindowBlur);
			pointerListenerCleanupRef.current = null;
		};
		scheduleProgress(getPointerProgress(event.clientX, dragRef.current));
	}

	function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
		const drag = dragRef.current;
		if (!drag || drag.pointerId !== event.pointerId) return;
		scheduleProgress(getPointerProgress(event.clientX, drag));
	}

	function finishPointer(pointerId: number, commit: boolean, clientX?: number) {
		const drag = dragRef.current;
		if (!drag || drag.pointerId !== pointerId) return;
		if (commit && typeof clientX === "number") {
			latestProgressRef.current = getPointerProgress(clientX, drag);
		}
		if (commit) {
			flushFrame();
		} else if (frameRef.current !== null) {
			window.cancelAnimationFrame(frameRef.current);
			frameRef.current = null;
		}
		dragRef.current = null;
		pointerListenerCleanupRef.current?.();
		if (controlRef.current?.hasPointerCapture?.(pointerId)) {
			controlRef.current.releasePointerCapture(pointerId);
		}
		if (!commit) {
			lastDraftRef.current = drag.startValue;
			renderIdleValue(drag.startValue);
			if (onCancel) onCancel();
			else onChange(drag.startValue);
			return;
		}
		const committedValue = getLeverageFromProgress(latestProgressRef.current, max);
		lastDraftRef.current = committedValue;
		renderIdleValue(committedValue);
		onCommit?.(committedValue);
	}

	function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
		if (disabled || !KEYBOARD_KEYS.has(event.key)) return;
		event.preventDefault();
		const current = clampLeverage(Math.round(Number.parseFloat(event.currentTarget.value) || value), max);
		const rtl = direction === "rtl";
		let next = current;
		switch (event.key) {
			case "ArrowDown":
				next = current - 1;
				break;
			case "ArrowLeft":
				next = current + (rtl ? 1 : -1);
				break;
			case "ArrowRight":
				next = current + (rtl ? -1 : 1);
				break;
			case "ArrowUp":
				next = current + 1;
				break;
			case "End":
				next = max;
				break;
			case "Home":
				next = 1;
				break;
			case "PageDown":
				next = current - 10;
				break;
			case "PageUp":
				next = current + 10;
		}
		const normalized = clampLeverage(next, max);
		if (normalized === current) return;
		lastDraftRef.current = normalized;
		renderIdleValue(normalized);
		onChange(normalized);
		onCommit?.(normalized);
	}

	function handleNativeValueChange(event: FormEvent<HTMLInputElement>) {
		const normalized = clampLeverage(Math.round(Number.parseFloat(event.currentTarget.value) || value), max);
		lastDraftRef.current = normalized;
		renderIdleValue(normalized);
		onChange(normalized);
		onCommit?.(normalized);
	}

	useBrowserLayoutEffect(() => {
		const maxChanged = previousMaxRef.current !== max;
		const directionChanged = previousDirectionRef.current !== direction;
		previousMaxRef.current = max;
		previousDirectionRef.current = direction;

		const activeDrag = dragRef.current;
		if (activeDrag && (maxChanged || directionChanged || disabled)) {
			if (frameRef.current !== null) {
				window.cancelAnimationFrame(frameRef.current);
				frameRef.current = null;
			}
			dragRef.current = null;
			pointerListenerCleanupRef.current?.();
			if (controlRef.current?.hasPointerCapture?.(activeDrag.pointerId)) {
				controlRef.current.releasePointerCapture(activeDrag.pointerId);
			}
			const resetValue = clampLeverage(activeDrag.startValue, max);
			const resetProgress = getProgress(resetValue, max);
			const physicalResetProgress = direction === "rtl" ? 1 - resetProgress : resetProgress;
			lastDraftRef.current = resetValue;
			latestProgressRef.current = resetProgress;
			if (indicatorRef.current) {
				indicatorRef.current.style.transform = `scaleX(${resetProgress})`;
				indicatorRef.current.style.transformOrigin = direction === "rtl" ? "right center" : "left center";
			}
			if (thumbRef.current) {
				thumbRef.current.style.left = `${physicalResetProgress * 100}%`;
				thumbRef.current.style.transform = "translate3d(-50%, -50%, 0)";
			}
			updateInput(resetValue);
			if (onCancel) onCancel();
			else onChange(resetValue);
			return;
		}
		if (dragRef.current) return;
		const normalized = clampLeverage(Math.round(value), max);
		const progress = getProgress(normalized, max);
		const physicalProgress = direction === "rtl" ? 1 - progress : progress;
		lastDraftRef.current = normalized;
		latestProgressRef.current = progress;
		if (indicatorRef.current) {
			indicatorRef.current.style.transform = `scaleX(${progress})`;
			indicatorRef.current.style.transformOrigin = direction === "rtl" ? "right center" : "left center";
		}
		if (thumbRef.current) {
			thumbRef.current.style.left = `${physicalProgress * 100}%`;
			thumbRef.current.style.transform = "translate3d(-50%, -50%, 0)";
		}
		if (inputRef.current) inputRef.current.value = String(normalized);
	}, [direction, disabled, max, onCancel, onChange, value]);

	useEffect(
		() => () => {
			if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
			pointerListenerCleanupRef.current?.();
		},
		[],
	);

	return (
		<div
			data-base-ui-swipe-ignore=""
			className={cn(
				"flex w-full touch-none select-none flex-col gap-2",
				disabled && "cursor-not-allowed opacity-40",
				className,
			)}
		>
			<label htmlFor={inputId} className="sr-only">
				{t`Leverage`}
			</label>
			<div
				ref={controlRef}
				className={cn("relative flex w-full touch-none items-center", !controlClassName && "h-8", controlClassName)}
				onPointerDown={handlePointerDown}
				onPointerMove={handlePointerMove}
				onPointerUp={(event) => finishPointer(event.pointerId, true, event.clientX)}
				onPointerCancel={(event) => finishPointer(event.pointerId, false)}
				onLostPointerCapture={(event) => finishPointer(event.pointerId, false)}
			>
				<div
					className={cn(
						"relative h-1 w-full overflow-hidden rounded-xs bg-trading-panel-stroke-card ring-0 shadow-none inset-shadow-none",
						trackClassName,
					)}
				>
					<div
						ref={indicatorRef}
						style={initialIndicatorStyleRef.current}
						className={cn(
							"absolute inset-0 h-auto w-full origin-left transform-gpu rounded-xs bg-trading-panel-control shadow-none inset-shadow-none will-change-transform",
							indicatorClassName,
						)}
					/>
				</div>
				<div
					ref={thumbRef}
					style={initialThumbStyleRef.current}
					className={cn(
						"pointer-events-none absolute top-1/2 z-[1] rounded-full border-[3px] border-trading-panel-control bg-trading-panel-slider-thumb shadow-trading-panel-slider will-change-transform",
						"has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-stroke-focus",
						!thumbClassName && "size-5",
						thumbClassName,
					)}
				>
					<input
						ref={inputRef}
						id={inputId}
						type="range"
						min={1}
						max={max}
						step={1}
						defaultValue={clampLeverage(Math.round(value), max)}
						disabled={disabled}
						onKeyDown={handleKeyDown}
						onInput={handleNativeValueChange}
						className="pointer-events-none absolute inset-0 size-full opacity-0"
					/>
				</div>
			</div>
		</div>
	);
}
