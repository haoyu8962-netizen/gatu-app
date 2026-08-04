import {
	type KeyboardEventHandler,
	type PointerEventHandler,
	type KeyboardEvent as ReactKeyboardEvent,
	type PointerEvent as ReactPointerEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";

interface PressAndHoldOptions {
	disabled?: boolean;
	durationMs: number;
	onComplete: () => void;
}

interface PressAndHoldHandlers {
	onBlur: () => void;
	onKeyDown: KeyboardEventHandler<HTMLButtonElement>;
	onKeyUp: KeyboardEventHandler<HTMLButtonElement>;
	onLostPointerCapture: PointerEventHandler<HTMLButtonElement>;
	onPointerCancel: PointerEventHandler<HTMLButtonElement>;
	onPointerDown: PointerEventHandler<HTMLButtonElement>;
	onPointerLeave: PointerEventHandler<HTMLButtonElement>;
	onPointerMove: PointerEventHandler<HTMLButtonElement>;
	onPointerUp: PointerEventHandler<HTMLButtonElement>;
}

interface PressAndHoldResult {
	cancel: () => void;
	handlers: PressAndHoldHandlers;
	isHolding: boolean;
	progressPercent: number;
}

export function usePressAndHold({ disabled = false, durationMs, onComplete }: PressAndHoldOptions): PressAndHoldResult {
	const [isHolding, setIsHolding] = useState(false);
	const [progressPercent, setProgressPercent] = useState(0);
	const completeTimerRef = useRef<number | null>(null);
	const progressFrameRef = useRef<number | null>(null);
	const startedAtRef = useRef(0);
	const activePointerRef = useRef<{
		element: HTMLButtonElement;
		pointerId: number;
		rect: DOMRect;
	} | null>(null);
	const onCompleteRef = useRef(onComplete);
	onCompleteRef.current = onComplete;

	const clearTimers = useCallback(() => {
		if (completeTimerRef.current !== null) {
			window.clearTimeout(completeTimerRef.current);
			completeTimerRef.current = null;
		}
		if (progressFrameRef.current !== null) {
			window.cancelAnimationFrame(progressFrameRef.current);
			progressFrameRef.current = null;
		}
	}, []);

	const releaseActivePointer = useCallback(() => {
		const activePointer = activePointerRef.current;
		activePointerRef.current = null;
		if (!activePointer) return;
		try {
			if (activePointer.element.hasPointerCapture?.(activePointer.pointerId)) {
				activePointer.element.releasePointerCapture(activePointer.pointerId);
			}
		} catch {
			// The browser may have released implicit capture before React receives the terminal event.
		}
	}, []);

	const cancel = useCallback(() => {
		clearTimers();
		releaseActivePointer();
		setIsHolding(false);
		setProgressPercent(0);
	}, [clearTimers, releaseActivePointer]);

	const start = useCallback(() => {
		if (disabled || !Number.isFinite(durationMs) || durationMs <= 0 || completeTimerRef.current !== null) return;

		startedAtRef.current = performance.now();
		setIsHolding(true);
		setProgressPercent(0);

		function updateProgress(timestamp: number) {
			progressFrameRef.current = null;
			if (completeTimerRef.current === null) return;

			const elapsedMs = timestamp - startedAtRef.current;
			setProgressPercent(Math.min(100, (elapsedMs / durationMs) * 100));
			progressFrameRef.current = window.requestAnimationFrame(updateProgress);
		}

		completeTimerRef.current = window.setTimeout(() => {
			if (progressFrameRef.current !== null) {
				window.cancelAnimationFrame(progressFrameRef.current);
				progressFrameRef.current = null;
			}
			completeTimerRef.current = null;
			releaseActivePointer();
			setIsHolding(false);
			setProgressPercent(100);
			onCompleteRef.current();
		}, durationMs);
		progressFrameRef.current = window.requestAnimationFrame(updateProgress);
	}, [disabled, durationMs, releaseActivePointer]);

	useEffect(() => {
		if (disabled) return;

		function handleWindowBlur() {
			cancel();
		}

		function handleVisibilityChange() {
			if (document.visibilityState === "hidden") cancel();
		}

		function handleEscape(event: KeyboardEvent) {
			if (event.key === "Escape") cancel();
		}

		window.addEventListener("blur", handleWindowBlur);
		window.addEventListener("keydown", handleEscape);
		document.addEventListener("visibilitychange", handleVisibilityChange);

		return () => {
			window.removeEventListener("blur", handleWindowBlur);
			window.removeEventListener("keydown", handleEscape);
			document.removeEventListener("visibilitychange", handleVisibilityChange);
			clearTimers();
		};
	}, [cancel, clearTimers, disabled]);

	useEffect(() => {
		if (disabled) cancel();
	}, [cancel, disabled]);

	function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
		if (disabled || (typeof event.button === "number" && event.button !== 0) || event.isPrimary === false) return;
		event.preventDefault();
		const pointerId = Number.isInteger(event.pointerId) ? event.pointerId : 1;
		activePointerRef.current = {
			element: event.currentTarget,
			pointerId,
			rect: event.currentTarget.getBoundingClientRect(),
		};
		try {
			event.currentTarget.setPointerCapture?.(pointerId);
		} catch {
			// Some browsers reject capture after a pointer has already been canceled; movement checks still fail closed.
		}
		start();
	}

	function handlePointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
		const activePointer = activePointerRef.current;
		if (!activePointer) return;
		if (Number.isInteger(event.pointerId) && event.pointerId !== activePointer.pointerId) return;
		const { clientX, clientY } = event;
		const { left, right, top, bottom } = activePointer.rect;
		if (clientX < left || clientX > right || clientY < top || clientY > bottom) cancel();
	}

	function handleKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
		if (event.key === "Escape") {
			cancel();
			return;
		}
		if (event.key === " " || event.key === "Enter") {
			event.preventDefault();
			if (!event.repeat) start();
		}
	}

	function handleKeyUp(event: ReactKeyboardEvent<HTMLButtonElement>) {
		if (event.key === " " || event.key === "Enter") cancel();
	}

	return {
		cancel,
		handlers: {
			onBlur: cancel,
			onKeyDown: handleKeyDown,
			onKeyUp: handleKeyUp,
			onLostPointerCapture: cancel,
			onPointerCancel: cancel,
			onPointerDown: handlePointerDown,
			onPointerLeave: cancel,
			onPointerMove: handlePointerMove,
			onPointerUp: cancel,
		},
		isHolding,
		progressPercent,
	};
}
