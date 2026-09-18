import { useState } from "react";

export function useHasBeenActive(active: boolean): boolean {
	const [hasBeenActive, setHasBeenActive] = useState(active);
	if (active && !hasBeenActive) setHasBeenActive(true);
	return active || hasBeenActive;
}
