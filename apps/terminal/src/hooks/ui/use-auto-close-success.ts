import { useCallback, useEffect, useRef, useState } from "react";

export function useAutoCloseSuccess(onClose: () => void, delayMs: number) {
	const timerRef = useRef<NodeJS.Timeout | null>(null);
	const isMountedRef = useRef(false);
	const [showSuccess, setShowSuccess] = useState(false);

	useEffect(() => {
		isMountedRef.current = true;
		return () => {
			isMountedRef.current = false;
			if (timerRef.current) clearTimeout(timerRef.current);
			timerRef.current = null;
		};
	}, []);

	const reset = useCallback(() => {
		if (timerRef.current) clearTimeout(timerRef.current);
		timerRef.current = null;
		if (isMountedRef.current) setShowSuccess(false);
	}, []);

	const trigger = useCallback(() => {
		if (!isMountedRef.current) return;
		setShowSuccess(true);
		if (timerRef.current) clearTimeout(timerRef.current);
		timerRef.current = setTimeout(() => {
			timerRef.current = null;
			if (!isMountedRef.current) return;
			setShowSuccess(false);
			onClose();
		}, delayMs);
	}, [delayMs, onClose]);

	return { showSuccess, trigger, reset };
}
