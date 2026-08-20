import { Slider, type SliderProps, type SliderThumbSize } from "@gatu/ui";
import Big from "big.js";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

type SliderCommitDetails = Parameters<NonNullable<SliderProps["onValueCommitted"]>>[1];
type SliderChangeDetails = Parameters<NonNullable<SliderProps["onValueChange"]>>[1];

interface PointerSession {
	pointerId: number;
	pointerType: string;
	startValue: number;
	draftValue: number;
	didChange: boolean;
	didPublishPreview: boolean;
	clientX: number;
	clientY: number;
}

interface Props {
	value: number;
	onPercentChange: (value: number) => void;
	onPercentCancel: (startValue: number) => void;
	onPercentCommit: (value: number, details: SliderCommitDetails) => void;
	onPercentInteractionStart?: (startValue: number) => void;
	interactionIdentity?: string;
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
	onPercentCancel,
	onPercentCommit,
	onPercentInteractionStart,
	interactionIdentity,
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
	const pointerSessionRef = useRef<PointerSession | null>(null);
	const onPercentChangeRef = useRef(onPercentChange);
	const onPercentCancelRef = useRef(onPercentCancel);
	const onPercentCommitRef = useRef(onPercentCommit);
	const onPercentInteractionStartRef = useRef(onPercentInteractionStart);
	const interactionIdentityRef = useRef(interactionIdentity);
	const pendingPreviewRef = useRef<number | null>(null);
	const previewFrameRef = useRef<number | null>(null);
	const renderedPointerDraftRef = useRef<number>(value);
	const [pointerDraftValue, setPointerDraftValue] = useState<number | null>(null);

	useLayoutEffect(() => {
		onPercentChangeRef.current = onPercentChange;
		onPercentCancelRef.current = onPercentCancel;
		onPercentCommitRef.current = onPercentCommit;
		onPercentInteractionStartRef.current = onPercentInteractionStart;
		renderedPointerDraftRef.current = pointerDraftValue ?? value;
	}, [onPercentCancel, onPercentChange, onPercentCommit, onPercentInteractionStart, pointerDraftValue, value]);

	const flushPendingPointerDraft = useCallback((session: PointerSession) => {
		if (session.draftValue === renderedPointerDraftRef.current) return;
		flushSync(() => setPointerDraftValue(session.draftValue));
	}, []);

	const clearScheduledPreview = useCallback(() => {
		pendingPreviewRef.current = null;
		if (previewFrameRef.current !== null) cancelAnimationFrame(previewFrameRef.current);
		previewFrameRef.current = null;
	}, []);

	const schedulePointerPreview = useCallback((nextValue: number) => {
		pendingPreviewRef.current = nextValue;
		if (previewFrameRef.current !== null) return;

		previewFrameRef.current = requestAnimationFrame(() => {
			previewFrameRef.current = null;
			const pendingValue = pendingPreviewRef.current;
			pendingPreviewRef.current = null;
			if (pendingValue === null) return;
			const session = pointerSessionRef.current;
			if (!session) return;
			session.didPublishPreview = true;
			onPercentChangeRef.current(pendingValue);
		});
	}, []);

	const cancelPointerSession = useCallback(
		(pointerId?: number) => {
			const session = pointerSessionRef.current;
			if (!session || (pointerId !== undefined && pointerId !== session.pointerId)) return;

			pointerSessionRef.current = null;
			clearScheduledPreview();
			setPointerDraftValue(null);
			endBasePointerInteraction(session);
			if (session.didPublishPreview) onPercentCancelRef.current(session.startValue);
		},
		[clearScheduledPreview],
	);

	useEffect(() => {
		function ignoreForeignPointer(event: PointerEvent) {
			const session = pointerSessionRef.current;
			if (!session) return;
			if (event.pointerId === session.pointerId && event.isPrimary !== false) {
				flushPendingPointerDraft(session);
				session.clientX = event.clientX;
				session.clientY = event.clientY;
				return;
			}
			event.preventDefault();
			event.stopImmediatePropagation();
		}

		function handlePointerCancel(event: PointerEvent) {
			cancelPointerSession(event.pointerId);
		}

		function handleVisibilityChange() {
			if (document.visibilityState === "hidden") cancelPointerSession();
		}

		document.addEventListener("pointermove", ignoreForeignPointer, true);
		document.addEventListener("pointerup", ignoreForeignPointer, true);
		document.addEventListener("pointercancel", handlePointerCancel, true);
		document.addEventListener("visibilitychange", handleVisibilityChange);
		return () => {
			document.removeEventListener("pointermove", ignoreForeignPointer, true);
			document.removeEventListener("pointerup", ignoreForeignPointer, true);
			document.removeEventListener("pointercancel", handlePointerCancel, true);
			document.removeEventListener("visibilitychange", handleVisibilityChange);
			pointerSessionRef.current = null;
			clearScheduledPreview();
		};
	}, [cancelPointerSession, clearScheduledPreview, flushPendingPointerDraft]);

	useLayoutEffect(() => {
		if (interactionIdentityRef.current === interactionIdentity) return;
		interactionIdentityRef.current = interactionIdentity;
		cancelPointerSession();
	}, [cancelPointerSession, interactionIdentity]);

	useLayoutEffect(() => {
		if (disabled) cancelPointerSession();
	}, [cancelPointerSession, disabled]);

	function handleValueChange(nextValue: number | readonly number[], eventDetails: SliderChangeDetails) {
		if (typeof nextValue !== "number" || eventDetails.reason === "none") return;
		const normalizedValue = normalizePercent(nextValue);
		if (isPointerReason(eventDetails.reason)) {
			const session = pointerSessionRef.current;
			if (!session) return;
			const eventPointerId = getPointerId(eventDetails.event);
			if (eventPointerId !== null && eventPointerId !== session.pointerId) return;
			session.didChange = true;
			session.draftValue = normalizedValue;
			setPointerDraftValue(normalizedValue);
			schedulePointerPreview(normalizedValue);
			return;
		}
		onPercentChange(normalizedValue);
	}

	function handleValueCommitted(nextValue: number | readonly number[], eventDetails: SliderCommitDetails) {
		if (typeof nextValue !== "number") return;
		const session = pointerSessionRef.current;
		if (session) {
			if (!matchesPointerSession(eventDetails.event, session)) return;
			pointerSessionRef.current = null;
			clearScheduledPreview();
			setPointerDraftValue(null);
			if (!session.didChange || !isPointerReason(eventDetails.reason)) return;
			onPercentCommitRef.current(session.draftValue, eventDetails);
			return;
		}
		if (eventDetails.reason === "none" || isPointerReason(eventDetails.reason)) return;
		onPercentCommitRef.current(normalizePercent(nextValue), eventDetails);
	}

	return (
		<Slider
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
			value={pointerDraftValue ?? value}
			onTouchStartCapture={(event) => {
				if (typeof PointerEvent === "function") event.stopPropagation();
			}}
			onPointerDownCapture={(event) => {
				if (disabled || event.button !== 0) return;
				if (event.isPrimary === false || pointerSessionRef.current !== null) {
					event.preventDefault();
					event.stopPropagation();
					return;
				}
				clearScheduledPreview();
				pointerSessionRef.current = {
					pointerId: event.pointerId,
					pointerType: event.pointerType,
					startValue: value,
					draftValue: value,
					didChange: false,
					didPublishPreview: false,
					clientX: event.clientX,
					clientY: event.clientY,
				};
				onPercentInteractionStartRef.current?.(value);
				setPointerDraftValue(value);
			}}
			onLostPointerCapture={(event) => {
				cancelPointerSession(event.pointerId);
			}}
			onValueChange={handleValueChange}
			onValueCommitted={handleValueCommitted}
			max={100}
			step={0.1}
			disabled={disabled}
		/>
	);
}

function isPointerReason(reason: SliderChangeDetails["reason"] | SliderCommitDetails["reason"]): boolean {
	return reason === "drag" || reason === "track-press";
}

function getPointerId(event: Event): number | null {
	if (!("pointerId" in event) || typeof event.pointerId !== "number") return null;
	return event.pointerId;
}

function matchesPointerSession(event: Event, session: PointerSession): boolean {
	const pointerId = getPointerId(event);
	if (pointerId !== null) return pointerId === session.pointerId;
	return session.pointerType === "touch" && typeof TouchEvent === "function" && event instanceof TouchEvent;
}

function endBasePointerInteraction(session: PointerSession) {
	const event = createPointerEvent("pointerup", session);
	document.dispatchEvent(event);
}

function createPointerEvent(type: string, session: PointerSession): Event {
	if (typeof PointerEvent === "function") {
		return new PointerEvent(type, {
			bubbles: true,
			button: 0,
			buttons: 0,
			clientX: session.clientX,
			clientY: session.clientY,
			isPrimary: true,
			pointerId: session.pointerId,
			pointerType: session.pointerType,
		});
	}

	const event = new MouseEvent(type, {
		bubbles: true,
		button: 0,
		buttons: 0,
		clientX: session.clientX,
		clientY: session.clientY,
	});
	Object.defineProperties(event, {
		isPrimary: { value: true },
		pointerId: { value: session.pointerId },
		pointerType: { value: session.pointerType },
	});
	return event;
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
