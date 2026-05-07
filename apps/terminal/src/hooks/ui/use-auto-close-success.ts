import { useEffect, useRef, useState } from "react";

export function useAutoCloseSuccess(onClose: () => void, delayMs: number) {
	const timerRef = useRef<NodeJS.Timeout | null>(null);
	const [showSuccess, setShowSuccess] = useState(false);

	useEffect(() => {
		return () => {
			if (timerRef.current) clearTimeout(timerRef.current);
		};
	}, []);

	function trigger() {
		setShowSuccess(true);
		if (timerRef.current) clearTimeout(timerRef.current);
		timerRef.current = setTimeout(() => {
			onClose();
			setShowSuccess(false);
		}, delayMs);
	}

	return { showSuccess, trigger };
}
