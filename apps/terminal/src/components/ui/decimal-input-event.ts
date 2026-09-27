import type { ChangeEvent } from "react";
import { normalizeDecimalInput } from "@/lib/format";

/**
 * Rewrites a typed `,` into the protocol decimal point on the input element before the change
 * reaches its handler, so every consumer keeps reading `event.target.value` as a `.` string.
 * The caret stays where the user typed; the controlled re-render then sees the same value.
 */
export function normalizeDecimalInputEvent<T extends ChangeEvent<HTMLInputElement>>(event: T): T {
	const input = event.target;
	const normalized = normalizeDecimalInput(input.value);
	if (normalized === input.value) return event;
	const { selectionStart, selectionEnd } = input;
	input.value = normalized;
	if (selectionStart !== null && selectionEnd !== null) input.setSelectionRange(selectionStart, selectionEnd);
	return event;
}
