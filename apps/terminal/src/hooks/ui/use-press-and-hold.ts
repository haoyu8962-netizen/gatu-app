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

	const cancel = useCallback(() => {
		clearTimers();
		setIsHolding(false);
		setProgressPercent(0);
	}, [clearTimers]);

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
			setIsHolding(false);
			setProgressPercent(100);
			onCompleteRef.current();
		}, durationMs);
		progressFrameRef.current = window.requestAnimationFrame(updateProgress);
	}, [disabled, durationMs]);

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
		start();
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
			onPointerUp: cancel,
		},
		isHolding,
		progressPercent,
	};
}
