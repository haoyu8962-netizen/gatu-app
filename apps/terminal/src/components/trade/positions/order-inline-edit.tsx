import { type KeyboardEvent, useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

interface Props {
	value: string;
	inputLabel: string;
	confirmLabel: string;
	confirmText: string;
	describedBy?: string;
	align?: "left" | "right";
	disabled: boolean;
	invalid: boolean;
	onChange: (value: string) => void;
	onCancel: () => void;
	onConfirm: () => void;
}

export function OrderInlineEdit({
	value,
	inputLabel,
	confirmLabel,
	confirmText,
	describedBy,
	align = "right",
	disabled,
	invalid,
	onChange,
	onCancel,
	onConfirm,
}: Props) {
	const rootRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (!disabled) inputRef.current?.focus();
	}, [disabled]);

	useEffect(() => {
		if (disabled) return;

		function handleOutsidePointerDown(event: PointerEvent) {
			if (!(event.target instanceof Node) || rootRef.current?.contains(event.target)) return;
			onCancel();
		}

		document.addEventListener("pointerdown", handleOutsidePointerDown, true);
		return () => document.removeEventListener("pointerdown", handleOutsidePointerDown, true);
	}, [disabled, onCancel]);

	function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
		if (event.nativeEvent.isComposing) return;
		if (event.key === "Enter") {
			event.preventDefault();
			onConfirm();
			return;
		}
		if (event.key === "Escape") {
			event.preventDefault();
			onCancel();
		}
	}

	return (
		<div
			ref={rootRef}
			className={cn(
				"absolute top-1/2 z-10 inline-flex min-w-0 -translate-y-1/2 items-center gap-1.5 rounded-[10px] bg-surface p-1 shadow-market-close-inline-edit",
				align === "right" ? "-right-1" : "-left-1",
			)}
		>
			<input
				ref={inputRef}
				type="text"
				inputMode="decimal"
				autoComplete="off"
				value={value}
				disabled={disabled}
				aria-label={inputLabel}
				aria-invalid={invalid || undefined}
				aria-describedby={describedBy}
				className={cn(
					"h-[29px] min-w-0 rounded-[8px] border-[1.5px] border-market-close-control bg-surface px-2 text-right text-[13px] font-semibold tabular-nums text-market-close-fg outline-none transition-colors duration-[120ms]",
					"focus:border-market-close-control focus:ring-1 focus:ring-market-close-control/15",
					"disabled:cursor-not-allowed disabled:opacity-70",
					invalid && "border-market-close-danger focus:border-market-close-danger focus:ring-market-close-danger/15",
					align === "right" ? "w-[90px]" : "w-[102px]",
				)}
				onChange={(event) => onChange(event.target.value)}
				onKeyDown={handleKeyDown}
			/>
			<button
				type="button"
				className="inline-flex h-[27px] min-w-11 shrink-0 items-center justify-center gap-1 rounded-[7px] bg-market-close-control px-2.5 text-xs font-semibold text-market-close-on-control transition-opacity duration-[120ms] hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-market-close-focus disabled:cursor-not-allowed disabled:opacity-60"
				aria-label={confirmLabel}
				disabled={disabled}
				onClick={onConfirm}
			>
				<span>{confirmText}</span>
			</button>
		</div>
	);
}
