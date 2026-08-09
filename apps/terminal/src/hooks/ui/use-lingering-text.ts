import { useEffect, useState } from "react";

export function useLingeringText(text: string, lingerMs: number): string {
	const [display, setDisplay] = useState(text);

	useEffect(() => {
		if (text) {
			setDisplay(text);
			return;
		}
		const timer = setTimeout(() => setDisplay(""), lingerMs);
		return () => clearTimeout(timer);
	}, [text, lingerMs]);

	return display;
}
