import { useDirection } from "@base-ui/react/direction-provider";
import {
	type FormEvent,
	type KeyboardEvent,
	type PointerEvent,
	useEffect,
	useId,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { TradeSliderView } from "./trade-slider-view";

export interface TradeSliderCommitDetails {
	reason: "drag" | "track-press" | "keyboard" | "input-change";
	event: Event;
}

interface Props {
	value: number;
	min: number;
	max: number;
	onPreview: (value: number) => void;
	onCommit: (value: number, details: TradeSliderCommitDetails) => void;
	onCancel: (startValue: number) => void;
	onInteractionStart?: (startValue: number) => void;
	onInteractionEnd?: () => void;
	interactionIdentity?: string;
	disabled?: boolean;
	showTicks?: boolean;
	ariaLabel: string;
	ariaValueText?: string;
	ariaDescribedBy?: string;
	ariaInvalid?: boolean;
	className?: string;
}

interface DragSession {
	pointerId: number;
	identity: string | undefined;
	min: number;
	max: number;
	rtl: boolean;
	left: number;
	width: number;
	startValue: number;
	draftValue: number;
	lastPublishedValue: number;
	progress: number;
	clientX: number;
	didChange: boolean;
	didMove: boolean;
}

const TICKS = [0, 25, 50, 75, 100];
const KEYS = new Set(["ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp", "End", "Home", "PageDown", "PageUp"]);
const useBrowserLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function clamp(value: number, min: number, max: number): number {
	if (!Number.isFinite(min) || !Number.isFinite(max)) return Number.isFinite(min) ? min : 0;
	return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function progressFor(value: number, min: number, max: number): number {
	return max > min ? (clamp(value, min, max) - min) / (max - min) : 0;
}

export function TradeSlider(props: Props) {
	const { value, min, max, disabled, showTicks, ariaLabel, ariaValueText, ariaDescribedBy, ariaInvalid, className } =
		props;
	const direction = useDirection();
	const inputId = useId();
	const controlRef = useRef<HTMLDivElement>(null);
	const thumbRef = useRef<HTMLDivElement>(null);
	const indicatorRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const ticksRef = useRef<HTMLDivElement>(null);
	const dragRef = useRef<DragSession | null>(null);
	const frameRef = useRef<number | null>(null);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const cleanupRef = useRef<(() => void) | null>(null);
	const disposeRef = useRef<(() => void) | null>(null);
	const keyboardIntentRef = useRef<number | null>(null);
	const [, setCommitRevision] = useState(0);
	const latestRef = useRef({ ...props, direction });
	const initialProgress = useRef(progressFor(value, min, max));
	const initialRtl = useRef(direction === "rtl");
	const unavailable = disabled || !Number.isFinite(min) || !Number.isFinite(max) || max <= min;

	function paint(progress: number, rtl: boolean, width?: number) {
		const normalized = clamp(progress, 0, 1);
		const physical = rtl ? 1 - normalized : normalized;
		if (indicatorRef.current) {
			indicatorRef.current.style.transform = `scaleX(${normalized})`;
			indicatorRef.current.style.transformOrigin = rtl ? "right center" : "left center";
		}
		if (thumbRef.current) {
			thumbRef.current.style.left = width === undefined ? `clamp(9px, ${physical * 100}%, calc(100% - 9px))` : "0px";
			thumbRef.current.style.transform =
				width === undefined
					? "translate3d(-50%, -50%, 0)"
					: `translate3d(${clamp(physical * width, Math.min(9, width / 2), Math.max(width - 9, width / 2))}px, -50%, 0) translateX(-50%)`;
		}
		for (const tick of ticksRef.current?.children ?? []) {
			if (tick instanceof HTMLElement) tick.dataset.active = String(Number(tick.dataset.percent) <= normalized * 100);
		}
	}

	function updateNativeValue(nextValue: number) {
		const current = latestRef.current;
		const normalized = Math.round(clamp(nextValue, current.min, current.max));
		if (inputRef.current) inputRef.current.value = String(normalized);
	}

	function clearTasks() {
		if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
		if (timerRef.current !== null) clearTimeout(timerRef.current);
		frameRef.current = null;
		timerRef.current = null;
	}

	function isCurrent(session: DragSession) {
		const current = latestRef.current;
		return (
			!current.disabled &&
			current.max > current.min &&
			session.identity === current.interactionIdentity &&
			session.min === current.min &&
			session.max === current.max &&
			session.rtl === (current.direction === "rtl")
		);
	}

	function schedule(session: DragSession, clientX: number) {
		if (!isCurrent(session)) return;
		const physical = clamp((clientX - session.left) / session.width, 0, 1);
		session.progress = session.rtl ? 1 - physical : physical;
		session.draftValue = Math.round(session.min + session.progress * (session.max - session.min));
		session.didChange ||= session.draftValue !== Math.round(session.startValue);
		session.clientX = clientX;
		if (frameRef.current === null) {
			frameRef.current = requestAnimationFrame(() => {
				frameRef.current = null;
				if (dragRef.current !== session || !isCurrent(session)) return;
				paint(session.progress, session.rtl, session.width);
			});
		}
		if (timerRef.current !== null) clearTimeout(timerRef.current);
		timerRef.current = null;
		if (session.draftValue === session.lastPublishedValue) return;
		timerRef.current = setTimeout(() => {
			timerRef.current = null;
			if (dragRef.current !== session || !isCurrent(session)) return;
			session.lastPublishedValue = session.draftValue;
			updateNativeValue(session.draftValue);
			latestRef.current.onPreview(session.draftValue);
		}, 15);
	}

	function finish(pointerId: number, commit: boolean, event?: Event, clientX?: number) {
		const session = dragRef.current;
		if (!session || session.pointerId !== pointerId) return;
		const valid = isCurrent(session);
		if (commit && valid && clientX !== undefined && clientX !== session.clientX) {
			session.didMove = true;
			schedule(session, clientX);
		}
		dragRef.current = null;
		keyboardIntentRef.current = null;
		clearTasks();
		cleanupRef.current?.();
		cleanupRef.current = null;
		controlRef.current?.removeAttribute("data-dragging");
		if (controlRef.current?.hasPointerCapture?.(pointerId)) controlRef.current.releasePointerCapture(pointerId);
		const current = latestRef.current;
		if (commit && valid && event) {
			const committed = session.didChange ? session.draftValue : current.value;
			updateNativeValue(committed);
			paint(progressFor(committed, current.min, current.max), current.direction === "rtl");
			if (session.didChange) {
				current.onCommit(session.draftValue, { reason: session.didMove ? "drag" : "track-press", event });
				setCommitRevision((revision) => revision + 1);
			}
		} else {
			const restored = valid ? session.startValue : current.value;
			updateNativeValue(restored);
			paint(progressFor(restored, current.min, current.max), current.direction === "rtl");
			current.onCancel(session.startValue);
		}
		current.onInteractionEnd?.();
	}

	function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
		if (unavailable || dragRef.current || event.isPrimary === false || event.button !== 0) return;
		event.preventDefault();
		const rect = event.currentTarget.getBoundingClientRect();
		if (rect.width <= 0) return;
		keyboardIntentRef.current = null;
		const session: DragSession = {
			pointerId: event.pointerId,
			identity: props.interactionIdentity,
			min,
			max,
			rtl: direction === "rtl",
			left: rect.left,
			width: rect.width,
			startValue: value,
			draftValue: Math.round(clamp(value, min, max)),
			lastPublishedValue: Math.round(clamp(value, min, max)),
			progress: progressFor(value, min, max),
			clientX: event.clientX,
			didChange: false,
			didMove: false,
		};
		dragRef.current = session;
		props.onInteractionStart?.(value);
		event.currentTarget.setPointerCapture?.(event.pointerId);
		event.currentTarget.dataset.dragging = "true";
		inputRef.current?.focus({ preventScroll: true });
		const ownerDocument = event.currentTarget.ownerDocument;
		const ownerWindow = ownerDocument.defaultView;
		function onUp(e: globalThis.PointerEvent) {
			finish(e.pointerId, true, e, e.clientX);
		}
		function onCancel(e: globalThis.PointerEvent) {
			finish(e.pointerId, false);
		}
		function onBlur() {
			finish(session.pointerId, false);
		}
		function onVisibility() {
			if (ownerDocument.visibilityState === "hidden") onBlur();
		}
		ownerDocument.addEventListener("pointerup", onUp);
		ownerDocument.addEventListener("pointercancel", onCancel);
		ownerDocument.addEventListener("visibilitychange", onVisibility);
		ownerWindow?.addEventListener("blur", onBlur);
		ownerWindow?.addEventListener("resize", onBlur);
		let observedWidth: number | null = null;
		const observer =
			typeof ResizeObserver === "undefined"
				? null
				: new ResizeObserver((entries) => {
						for (const entry of entries) {
							const width = entry.contentRect.width;
							observedWidth ??= width;
							if (Math.abs(width - observedWidth) > 0.5) onBlur();
						}
					});
		observer?.observe(event.currentTarget);
		cleanupRef.current = () => {
			observer?.disconnect();
			ownerDocument.removeEventListener("pointerup", onUp);
			ownerDocument.removeEventListener("pointercancel", onCancel);
			ownerDocument.removeEventListener("visibilitychange", onVisibility);
			ownerWindow?.removeEventListener("blur", onBlur);
			ownerWindow?.removeEventListener("resize", onBlur);
		};
		if (!(event.target instanceof Element) || !event.target.closest("[data-trade-slider-thumb]"))
			schedule(session, event.clientX);
	}

	function commitDiscrete(next: number, event: Event, reason: "keyboard" | "input-change") {
		if (unavailable || dragRef.current) return;
		const normalized = Math.round(clamp(next, min, max));
		if (normalized === (keyboardIntentRef.current ?? Math.round(value))) return;
		keyboardIntentRef.current = normalized;
		updateNativeValue(normalized);
		paint(progressFor(normalized, min, max), direction === "rtl");
		props.onCommit(normalized, { reason, event });
	}

	function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
		if (event.key === "Escape" && dragRef.current) {
			event.preventDefault();
			event.stopPropagation();
			finish(dragRef.current.pointerId, false);
			return;
		}
		if (!KEYS.has(event.key)) return;
		event.preventDefault();
		event.stopPropagation();
		const previous = keyboardIntentRef.current ?? Math.round(clamp(value, min, max));
		const rtl = direction === "rtl";
		const next =
			event.key === "Home"
				? min
				: event.key === "End"
					? max
					: previous +
						(event.key === "PageUp"
							? 10
							: event.key === "PageDown"
								? -10
								: event.key === "ArrowUp" || event.key === (rtl ? "ArrowLeft" : "ArrowRight")
									? 1
									: -1);
		commitDiscrete(next, event.nativeEvent, "keyboard");
	}

	function handleNativeInput(event: FormEvent<HTMLInputElement>) {
		const next = Number(event.currentTarget.value);
		commitDiscrete(next, event.nativeEvent, "input-change");
	}

	useBrowserLayoutEffect(() => {
		disposeRef.current = () => {
			const active = dragRef.current;
			if (active) finish(active.pointerId, false);
			else clearTasks();
		};
		const previous = latestRef.current;
		latestRef.current = { ...props, direction };
		const session = dragRef.current;
		if (session && !isCurrent(session)) finish(session.pointerId, false);
		if (
			previous.interactionIdentity !== props.interactionIdentity ||
			previous.min !== min ||
			previous.max !== max ||
			previous.direction !== direction ||
			unavailable
		)
			keyboardIntentRef.current = null;
		const active = dragRef.current;
		updateNativeValue(active?.draftValue ?? keyboardIntentRef.current ?? value);
		if (!active) {
			paint(progressFor(value, min, max), direction === "rtl");
		}
	});

	useBrowserLayoutEffect(() => () => disposeRef.current?.(), []);

	return (
		<TradeSliderView
			dir={direction}
			className={className}
			unavailable={unavailable}
			inputId={inputId}
			ariaLabel={ariaLabel}
			showTicks={showTicks}
			ticks={TICKS}
			progress={initialProgress.current}
			rtl={initialRtl.current}
			controlRef={controlRef}
			indicatorRef={indicatorRef}
			ticksRef={ticksRef}
			thumbRef={thumbRef}
			inputRef={inputRef}
			controlProps={{
				onPointerDown: handlePointerDown,
				onPointerMove: (event) => {
					const session = dragRef.current;
					if (!session || session.pointerId !== event.pointerId || event.isPrimary === false) return;
					session.didMove ||= event.clientX !== session.clientX;
					schedule(session, event.clientX);
				},
				onPointerUp: (event) => finish(event.pointerId, true, event.nativeEvent, event.clientX),
				onPointerCancel: (event) => finish(event.pointerId, false),
				onLostPointerCapture: (event) => finish(event.pointerId, false),
			}}
			inputProps={{
				min: Number.isFinite(min) ? min : 0,
				max: Number.isFinite(max) ? Math.max(Number.isFinite(min) ? min : 0, max) : Number.isFinite(min) ? min : 0,
				step: 1,
				defaultValue: Math.round(clamp(value, min, max)),
				disabled: unavailable,
				"aria-valuetext": ariaValueText,
				"aria-describedby": ariaDescribedBy,
				"aria-invalid": ariaInvalid || undefined,
				onKeyDown: handleKeyDown,
				onInput: handleNativeInput,
				onBlur: () => {
					keyboardIntentRef.current = null;
					updateNativeValue(value);
					if (dragRef.current) finish(dragRef.current.pointerId, false);
				},
			}}
		/>
	);
}
