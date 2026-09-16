import { useEffect, useState } from "react";
import { areFontsReady, waitForFonts } from "@/lib/fonts/font-readiness";

export function useFontsReady(specs: readonly string[]): boolean {
	const [ready, setReady] = useState(() => areFontsReady(specs));

	useEffect(() => {
		if (ready) return;
		let active = true;
		waitForFonts(specs).then(() => {
			if (active) setReady(true);
		});
		return () => {
			active = false;
		};
	}, [ready, specs]);

	return ready;
}
