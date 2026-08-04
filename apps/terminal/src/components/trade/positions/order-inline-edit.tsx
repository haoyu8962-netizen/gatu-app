import { SpinnerGapIcon } from "@phosphor-icons/react";
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
			className="inline-flex min-w-0 items-center gap-1 rounded-8 border border-stroke-weak bg-modal p-1 shadow-overlay"
			aria-busy={disabled || undefined}
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
					"h-7 min-w-0 rounded-6 border-[1.5px] border-stroke bg-background px-2 text-xs tabular-nums text-fg outline-none transition-colors duration-150",
					"focus:border-fg focus:ring-1 focus:ring-fg/15",
					"disabled:cursor-not-allowed disabled:opacity-70",
					invalid && "border-error focus:border-error focus:ring-error/15",
					align === "right" ? "w-16 text-right" : "w-24 text-left",
				)}
				onChange={(event) => onChange(event.target.value)}
				onKeyDown={handleKeyDown}
			/>
			<button
				type="button"
				className="inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-6 bg-fill px-2 text-2xs font-semibold text-fg-inverse transition-opacity duration-150 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-stroke-focus disabled:cursor-not-allowed disabled:opacity-60"
				aria-label={confirmLabel}
				disabled={disabled}
				onClick={onConfirm}
			>
				{disabled ? (
					<SpinnerGapIcon className="size-3 animate-spin motion-reduce:animate-none" aria-hidden="true" />
				) : null}
				<span>{confirmText}</span>
			</button>
		</div>
	);
}
