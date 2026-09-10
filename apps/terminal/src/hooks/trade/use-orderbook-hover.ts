import {
	type FocusEvent,
	type KeyboardEvent,
	type MouseEvent,
	type PointerEvent,
	type RefObject,
	useCallback,
	useEffect,
	useId,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type { BookLevel } from "@/lib/trade/orderbook";

type Side = "ask" | "bid";
type Selection =
	| { source: "pointer"; side: Side; rank: number }
	| { source: "focus" | "touch"; side: Side; price: string };
type Row = { element: HTMLButtonElement; side: Side; rank: number; price: string };
interface Options {
	identity: string;
	viewKey: string;
	enabled: boolean;
	bids: BookLevel[];
	asks: BookLevel[];
	rootRef: RefObject<HTMLDivElement | null>;
}
interface Session {
	identity: string;
	viewKey: string;
	enabled: boolean;
	selection: Selection | null;
}

const ROW_SELECTOR = "button[data-orderbook-side][data-orderbook-rank][data-orderbook-price]";
const LONG_PRESS_MS = 450;
const LONG_PRESS_MOVE_PX = 8;
const TOUCH_DISMISS_MS = 2_500;

export function useOrderbookHover({ identity, viewKey, enabled, bids, asks, rootRef }: Options) {
	const tooltipId = useId();
	const [session, setSession] = useState<Session>({ identity, viewKey, enabled, selection: null });
	const currentRef = useRef({ identity, viewKey, enabled, bids, asks, rootRef });
	const selection =
		session.identity === identity && session.viewKey === viewKey && session.enabled === enabled && enabled
			? session.selection
			: null;
	const selectionRef = useRef(selection);
	useLayoutEffect(() => {
		currentRef.current = { identity, viewKey, enabled, bids, asks, rootRef };
		selectionRef.current = selection;
	}, [identity, viewKey, enabled, bids, asks, rootRef, selection]);
	const levels = selection?.side === "ask" ? asks : bids;
	const rank = selection
		? selection.source === "pointer"
			? selection.rank
			: levels.findIndex((level) => level.price === selection.price)
		: -1;
	const activeLevel = rank >= 0 ? (levels[rank] ?? null) : null;
	if (
		session.identity !== identity ||
		session.viewKey !== viewKey ||
		session.enabled !== enabled ||
		(selection !== null && activeLevel === null)
	) {
		setSession({ identity, viewKey, enabled, selection: null });
	}
	const hoveredSide = activeLevel && selection ? selection.side : null;
	const hoveredRank = activeLevel ? rank : null;
	const anchor = useMemo(
		() => ({
			getBoundingClientRect() {
				const row =
					hoveredSide !== null && hoveredRank !== null
						? currentRef.current.rootRef.current?.querySelector<HTMLButtonElement>(
								`button[data-orderbook-side="${hoveredSide}"][data-orderbook-rank="${hoveredRank}"]`,
							)
						: null;
				return row && !row.matches(":disabled") ? row.getBoundingClientRect() : new DOMRect();
			},
		}),
		[hoveredSide, hoveredRank],
	);
	const pressTimer = useRef<number | null>(null);
	const dismissTimer = useRef<number | null>(null);
	const touch = useRef<{ id: number; x: number; y: number; row: Row } | null>(null);
	const suppressClickFor = useRef<HTMLButtonElement | null>(null);
	const pointerFocusTarget = useRef<HTMLButtonElement | null>(null);
	const previousScope = useRef({ identity, viewKey, enabled });

	const clearTimers = useCallback(() => {
		if (pressTimer.current !== null) window.clearTimeout(pressTimer.current);
		if (dismissTimer.current !== null) window.clearTimeout(dismissTimer.current);
		pressTimer.current = null;
		dismissTimer.current = null;
		touch.current = null;
	}, []);
	const close = useCallback(() => {
		clearTimers();
		setSession((previous) => (previous.selection ? { ...previous, selection: null } : previous));
	}, [clearTimers]);

	useEffect(() => {
		function dismissHidden() {
			if (document.visibilityState === "hidden") close();
		}
		window.addEventListener("blur", close);
		window.addEventListener("resize", close);
		window.addEventListener("scroll", close, true);
		document.addEventListener("visibilitychange", dismissHidden);
		return () => {
			window.removeEventListener("blur", close);
			window.removeEventListener("resize", close);
			window.removeEventListener("scroll", close, true);
			document.removeEventListener("visibilitychange", dismissHidden);
			clearTimers();
		};
	}, [clearTimers, close]);

	useEffect(() => {
		const previous = previousScope.current;
		if (previous.identity === identity && previous.viewKey === viewKey && previous.enabled === enabled) return;
		previousScope.current = { identity, viewKey, enabled };
		clearTimers();
	}, [identity, viewKey, enabled, clearTimers]);

	function readRow(target: EventTarget | null): Row | null {
		if (!enabled || document.visibilityState === "hidden" || !(target instanceof Element)) return null;
		const element = target.closest<HTMLButtonElement>(ROW_SELECTOR);
		if (!element || !rootRef.current?.contains(element) || element.matches(":disabled")) return null;
		const side = element.dataset.orderbookSide;
		const rowRank = Number(element.dataset.orderbookRank);
		const price = element.dataset.orderbookPrice;
		if ((side !== "ask" && side !== "bid") || !Number.isInteger(rowRank) || rowRank < 0 || !price) return null;
		if ((side === "ask" ? asks : bids)[rowRank]?.price !== price) return null;
		return { element, side, rank: rowRank, price };
	}

	function select(next: Selection) {
		const selected = selectionRef.current;
		if (
			selected?.side === next.side &&
			selected.source === next.source &&
			(selected.source !== "pointer" && next.source !== "pointer"
				? selected.price === next.price
				: "rank" in selected && "rank" in next && selected.rank === next.rank)
		)
			return;
		if (next.source !== "touch") clearTimers();
		setSession((previous) => {
			const old = previous.selection;
			if (
				previous.identity === identity &&
				previous.viewKey === viewKey &&
				previous.enabled === enabled &&
				old?.side === next.side &&
				old.source === next.source &&
				(old.source !== "pointer" && next.source !== "pointer"
					? old.price === next.price
					: "rank" in old && "rank" in next && old.rank === next.rank)
			)
				return previous;
			return { identity, viewKey, enabled, selection: next };
		});
	}

	function inCurrentLadderGap(event: PointerEvent<HTMLDivElement>): boolean {
		if (hoveredSide === null || !(event.target instanceof Element)) return false;
		const ladder = event.target.closest<HTMLElement>("[data-orderbook-side-container]");
		if (!ladder || !rootRef.current?.contains(ladder) || ladder.dataset.orderbookSideContainer !== hoveredSide)
			return false;
		if (event.target !== ladder) return false;
		const rows = [...ladder.querySelectorAll<HTMLButtonElement>(ROW_SELECTOR)].filter(
			(row) => !row.matches(":disabled"),
		);
		if (rows.length < 2) return false;
		const first = rows[0]?.getBoundingClientRect();
		const last = rows[rows.length - 1]?.getBoundingClientRect();
		if (!first || !last) return false;
		return event.clientY >= Math.min(first.top, last.top) && event.clientY <= Math.max(first.bottom, last.bottom);
	}

	function onPointerMove(event: PointerEvent<HTMLDivElement>) {
		if (event.pointerType === "touch") {
			const press = touch.current;
			if (
				press &&
				press.id === event.pointerId &&
				(Math.abs(event.clientX - press.x) > LONG_PRESS_MOVE_PX ||
					Math.abs(event.clientY - press.y) > LONG_PRESS_MOVE_PX)
			)
				close();
			return;
		}
		if (event.buttons !== 0) return;
		const row = readRow(event.target);
		if (row) select({ source: "pointer", side: row.side, rank: row.rank });
		else if (!inCurrentLadderGap(event)) close();
	}

	function onPointerDown(event: PointerEvent<HTMLDivElement>) {
		if (event.pointerType === "touch" || selection?.source === "touch") close();
		else clearTimers();
		suppressClickFor.current = null;
		const row = readRow(event.target);
		pointerFocusTarget.current = row?.element ?? null;
		if (!row || event.pointerType !== "touch" || event.isPrimary === false || event.button !== 0) return;
		touch.current = { id: event.pointerId, x: event.clientX, y: event.clientY, row };
		pressTimer.current = window.setTimeout(() => {
			pressTimer.current = null;
			const current = currentRef.current;
			const press = touch.current;
			if (
				!press ||
				!current.enabled ||
				current.identity !== identity ||
				current.viewKey !== viewKey ||
				document.visibilityState === "hidden" ||
				!press.row.element.isConnected ||
				press.row.element.matches(":disabled") ||
				!(press.row.side === "ask" ? current.asks : current.bids).some((level) => level.price === press.row.price)
			)
				return;
			suppressClickFor.current = press.row.element;
			select({ source: "touch", side: press.row.side, price: press.row.price });
			dismissTimer.current = window.setTimeout(close, TOUCH_DISMISS_MS);
		}, LONG_PRESS_MS);
	}

	function onPointerUp(event: PointerEvent<HTMLDivElement>) {
		if (touch.current?.id !== event.pointerId) return;
		if (pressTimer.current !== null) window.clearTimeout(pressTimer.current);
		pressTimer.current = null;
		touch.current = null;
	}

	function onPointerCancel() {
		pointerFocusTarget.current = null;
		suppressClickFor.current = null;
		close();
	}

	function onPointerLeave(event: PointerEvent<HTMLDivElement>) {
		if (event.pointerType === "touch" ? touch.current !== null : selection?.source === "pointer") close();
	}

	function onClickCapture(event: MouseEvent<HTMLDivElement>) {
		pointerFocusTarget.current = null;
		if (!suppressClickFor.current) return;
		const target = event.target instanceof Element ? event.target.closest(ROW_SELECTOR) : null;
		const suppressed = suppressClickFor.current;
		suppressClickFor.current = null;
		if (target !== suppressed) return;
		event.preventDefault();
		event.stopPropagation();
	}

	function onFocus(event: FocusEvent<HTMLDivElement>) {
		const row = readRow(event.target);
		if (row && row.element !== pointerFocusTarget.current)
			select({ source: "focus", side: row.side, price: row.price });
	}

	function onBlur() {
		if (selection?.source === "focus") close();
	}

	function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
		pointerFocusTarget.current = null;
		suppressClickFor.current = null;
		if (event.key !== "Escape" || !selection) return;
		event.preventDefault();
		event.stopPropagation();
		close();
	}

	return {
		hoveredSide,
		hoveredRank,
		activeLevel,
		tooltipId,
		anchor,
		getHoverState(side: Side, rowRank: number): "active" | "range" | undefined {
			if (hoveredSide !== side || hoveredRank === null || rowRank > hoveredRank || rowRank < 0) return undefined;
			return rowRank === hoveredRank ? "active" : "range";
		},
		containerProps: {
			onPointerMove,
			onPointerDown,
			onPointerUp,
			onPointerCancel,
			onPointerLeave,
			onClickCapture,
			onFocus,
			onBlur,
			onKeyDown,
		},
	};
}

export type OrderbookHoverController = ReturnType<typeof useOrderbookHover>;
