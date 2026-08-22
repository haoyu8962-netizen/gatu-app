import { useEffect, useState } from "react";

export interface LingeringValidationSnapshot {
	text: string;
	hasSizeError: boolean;
}

const EMPTY_SNAPSHOT: LingeringValidationSnapshot = {
	text: "",
	hasSizeError: false,
};

export function useLingeringValidation(
	text: string,
	hasSizeError: boolean,
	lingerMs: number,
): LingeringValidationSnapshot {
	const [previousSnapshot, setPreviousSnapshot] = useState<LingeringValidationSnapshot>(() =>
		text ? { text, hasSizeError } : EMPTY_SNAPSHOT,
	);

	useEffect(() => {
		if (text) {
			setPreviousSnapshot((current) => {
				if (current.text === text && current.hasSizeError === hasSizeError) return current;
				return { text, hasSizeError };
			});
			return;
		}

		const timer = setTimeout(() => setPreviousSnapshot(EMPTY_SNAPSHOT), lingerMs);
		return () => clearTimeout(timer);
	}, [text, hasSizeError, lingerMs]);

	if (text) return { text, hasSizeError };
	return previousSnapshot;
}
