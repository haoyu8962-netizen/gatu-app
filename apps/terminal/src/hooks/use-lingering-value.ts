import { useEffect, useState } from "react";

/**
 * Keeps the last non-null value for `durationMs` after it becomes null, so a component driven by
 * that value can stay mounted long enough to run its exit transition.
 */
export function useLingeringValue<T>(value: T | null, durationMs: number): T | null {
	const [lingering, setLingering] = useState<T | null>(value);
	if (value !== null && lingering !== value) setLingering(value);

	useEffect(() => {
		if (value !== null) return;
		const timeoutId = window.setTimeout(() => setLingering(null), durationMs);
		return () => window.clearTimeout(timeoutId);
	}, [value, durationMs]);

	return value ?? lingering;
}
