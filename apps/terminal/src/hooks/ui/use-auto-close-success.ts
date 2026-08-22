import { useCallback, useEffect, useRef, useState } from "react";

export function useAutoCloseSuccess(onClose: () => void, delayMs: number) {
	const timerRef = useRef<NodeJS.Timeout | null>(null);
	const [showSuccess, setShowSuccess] = useState(false);

	useEffect(() => {
		return () => {
			if (timerRef.current) clearTimeout(timerRef.current);
		};
	}, []);

	const reset = useCallback(() => {
		if (timerRef.current) clearTimeout(timerRef.current);
		timerRef.current = null;
		setShowSuccess(false);
	}, []);

	const trigger = useCallback(() => {
		setShowSuccess(true);
		if (timerRef.current) clearTimeout(timerRef.current);
		timerRef.current = setTimeout(() => {
			timerRef.current = null;
			setShowSuccess(false);
			onClose();
		}, delayMs);
	}, [delayMs, onClose]);

	return { showSuccess, trigger, reset };
}
