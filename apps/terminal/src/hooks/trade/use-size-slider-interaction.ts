import { useCallback, useRef } from "react";

interface Params {
	applyPercent: (percent: number) => void;
	interactionIdentity: string;
	setSizeInput: (value: string) => void;
	sizeInput: string;
}

interface SizeSnapshot {
	identity: string;
	sizeInput: string;
}

export function useSizeSliderInteraction({ applyPercent, interactionIdentity, setSizeInput, sizeInput }: Params) {
	const snapshotRef = useRef<SizeSnapshot | null>(null);

	const onPercentInteractionStart = useCallback(() => {
		snapshotRef.current = { identity: interactionIdentity, sizeInput };
	}, [interactionIdentity, sizeInput]);

	const onPercentCancel = useCallback(() => {
		const snapshot = snapshotRef.current;
		snapshotRef.current = null;
		if (snapshot?.identity === interactionIdentity) setSizeInput(snapshot.sizeInput);
	}, [interactionIdentity, setSizeInput]);

	const onPercentCommit = useCallback(
		(percent: number) => {
			const snapshot = snapshotRef.current;
			snapshotRef.current = null;
			if (snapshot && snapshot.identity !== interactionIdentity) return;
			applyPercent(percent);
		},
		[applyPercent, interactionIdentity],
	);

	return { onPercentCancel, onPercentCommit, onPercentInteractionStart };
}
