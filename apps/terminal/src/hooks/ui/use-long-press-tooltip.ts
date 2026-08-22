import {
	type PointerEventHandler,
	type PointerEvent as ReactPointerEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";

const LONG_PRESS_DURATION_MS = 450;
const LONG_PRESS_MOVE_TOLERANCE_PX = 8;
const LONG_PRESS_TOOLTIP_DISMISS_MS = 2_500;

interface LongPressTooltipOptions {
	enabled: boolean;
}

interface LongPressTooltipHandlers {
	onPointerCancel: PointerEventHandler<HTMLButtonElement>;
	onPointerDown: PointerEventHandler<HTMLButtonElement>;
	onPointerLeave: PointerEventHandler<HTMLButtonElement>;
	onPointerMove: PointerEventHandler<HTMLButtonElement>;
	onPointerUp: PointerEventHandler<HTMLButtonElement>;
}

interface LongPressTooltipResult {
	consumeLongPressClick: () => boolean;
	handlers: LongPressTooltipHandlers;
	onOpenChange: (open: boolean) => void;
	open: boolean;
}

export function useLongPressTooltip({ enabled }: LongPressTooltipOptions): LongPressTooltipResult {
	const [open, setOpen] = useState(false);
	const pressTimerRef = useRef<number | null>(null);
	const dismissTimerRef = useRef<number | null>(null);
	const activePointerRef = useRef<{ id: number; x: number; y: number } | null>(null);
	const suppressNextClickRef = useRef(false);
	const enabledRef = useRef(enabled);
	enabledRef.current = enabled;

	const clearPress = useCallback(() => {
		activePointerRef.current = null;
		if (pressTimerRef.current !== null) {
			window.clearTimeout(pressTimerRef.current);
			pressTimerRef.current = null;
		}
	}, []);

	const clearDismiss = useCallback(() => {
		if (dismissTimerRef.current !== null) {
			window.clearTimeout(dismissTimerRef.current);
			dismissTimerRef.current = null;
		}
	}, []);

	useEffect(
		() => () => {
			clearPress();
			clearDismiss();
		},
		[clearDismiss, clearPress],
	);

	const onOpenChange = useCallback(
		(nextOpen: boolean) => {
			clearDismiss();
			setOpen(enabledRef.current && nextOpen);
		},
		[clearDismiss],
	);

	function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
		if (
			!enabled ||
			event.pointerType !== "touch" ||
			event.isPrimary === false ||
			(typeof event.button === "number" && event.button !== 0)
		) {
			return;
		}

		clearPress();
		clearDismiss();
		suppressNextClickRef.current = false;
		activePointerRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
		pressTimerRef.current = window.setTimeout(() => {
			pressTimerRef.current = null;
			if (!enabledRef.current || !activePointerRef.current) return;
			suppressNextClickRef.current = true;
			setOpen(true);
			dismissTimerRef.current = window.setTimeout(() => {
				dismissTimerRef.current = null;
				suppressNextClickRef.current = false;
				setOpen(false);
			}, LONG_PRESS_TOOLTIP_DISMISS_MS);
		}, LONG_PRESS_DURATION_MS);
	}

	function handlePointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
		const activePointer = activePointerRef.current;
		if (!activePointer || event.pointerId !== activePointer.id) return;
		if (
			Math.abs(event.clientX - activePointer.x) > LONG_PRESS_MOVE_TOLERANCE_PX ||
			Math.abs(event.clientY - activePointer.y) > LONG_PRESS_MOVE_TOLERANCE_PX
		) {
			clearPress();
		}
	}

	function handlePointerEnd(event: ReactPointerEvent<HTMLButtonElement>) {
		const activePointer = activePointerRef.current;
		if (!activePointer || event.pointerId !== activePointer.id) return;
		clearPress();
	}

	const consumeLongPressClick = useCallback(() => {
		if (!suppressNextClickRef.current) return false;
		suppressNextClickRef.current = false;
		return true;
	}, []);

	return {
		consumeLongPressClick,
		handlers: {
			onPointerCancel: handlePointerEnd,
			onPointerDown: handlePointerDown,
			onPointerLeave: handlePointerEnd,
			onPointerMove: handlePointerMove,
			onPointerUp: handlePointerEnd,
		},
		onOpenChange,
		open: enabled && open,
	};
}
