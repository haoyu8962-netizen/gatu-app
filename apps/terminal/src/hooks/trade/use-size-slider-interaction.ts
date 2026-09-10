import { useCallback, useLayoutEffect, useRef } from "react";

interface Params {
	onInteractionChange?: (active: boolean) => void;
	applyPercent: (percent: number) => void;
	interactionIdentity: string;
	setSizeInput: (value: string) => void;
	sizeInput: string;
}

interface SizeSnapshot {
	identity: string;
	sizeInput: string;
}

export function useSizeSliderInteraction({
	applyPercent,
	interactionIdentity,
	setSizeInput,
	sizeInput,
	onInteractionChange,
}: Params) {
	const snapshotRef = useRef<SizeSnapshot | null>(null);
	const mountedRef = useRef(false);

	useLayoutEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
			snapshotRef.current = null;
		};
	}, []);

	const onPercentInteractionStart = useCallback(() => {
		if (!mountedRef.current) return;
		snapshotRef.current = { identity: interactionIdentity, sizeInput };
		onInteractionChange?.(true);
	}, [interactionIdentity, sizeInput, onInteractionChange]);

	const onPercentCancel = useCallback(() => {
		const snapshot = snapshotRef.current;
		snapshotRef.current = null;
		if (mountedRef.current && snapshot?.identity === interactionIdentity) setSizeInput(snapshot.sizeInput);
	}, [interactionIdentity, setSizeInput]);

	const onPercentCommit = useCallback(
		(percent: number) => {
			if (!mountedRef.current) return;
			const snapshot = snapshotRef.current;
			snapshotRef.current = null;
			if (snapshot && snapshot.identity !== interactionIdentity) return;
			applyPercent(percent);
		},
		[applyPercent, interactionIdentity],
	);

	function onPercentInteractionEnd() {
		snapshotRef.current = null;
		onInteractionChange?.(false);
	}
	return { onPercentCancel, onPercentCommit, onPercentInteractionStart, onPercentInteractionEnd };
}
