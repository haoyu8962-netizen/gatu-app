import { useEffect, useRef, useState } from "react";
import { formatClockDuration } from "@/lib/format";

interface Props {
	startTime: number;
	durationMs?: number;
	isActive?: boolean;
	format?: (elapsedMs: number) => string;
}

export function TimeTicker({ startTime, durationMs, isActive = true, format = formatClockDuration }: Props) {
	const [elapsed, setElapsed] = useState(() => Date.now() - startTime);
	const rafRef = useRef<number>(0);
	const lastUpdateRef = useRef<number>(0);

	useEffect(() => {
		if (!isActive) {
			setElapsed(durationMs ?? Date.now() - startTime);
			return;
		}

		const tick = (now: number) => {
			if (now - lastUpdateRef.current >= 1000) {
				lastUpdateRef.current = now;
				setElapsed(Date.now() - startTime);
			}
			rafRef.current = requestAnimationFrame(tick);
		};

		lastUpdateRef.current = performance.now();
		rafRef.current = requestAnimationFrame(tick);

		return () => cancelAnimationFrame(rafRef.current);
	}, [isActive, startTime, durationMs]);

	const displayMs = durationMs != null ? Math.min(elapsed, durationMs) : elapsed;

	return <>{format(displayMs)}</>;
}
