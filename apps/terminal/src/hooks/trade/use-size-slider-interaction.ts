import { useLayoutEffect, useRef } from "react";
import type { OrderSizeSource } from "@/stores/use-order-entry-store";

interface Params {
	sizeSource?: OrderSizeSource | null;
	restoreSizeSelection?: (size: string, source: OrderSizeSource) => void;
	onInteractionChange?: (active: boolean) => void;
	applyPercent: (percent: number) => void;
	interactionIdentity: string;
	setSizeInput: (value: string) => void;
	sizeInput: string;
}

interface SizeSnapshot {
	sizeSource?: OrderSizeSource | null;
	identity: string;
	sizeInput: string;
}

export function useSizeSliderInteraction({
	applyPercent,
	sizeSource,
	restoreSizeSelection,
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

	function onPercentInteractionStart() {
		if (!mountedRef.current) return;
		snapshotRef.current = { identity: interactionIdentity, sizeInput, sizeSource };
		onInteractionChange?.(true);
	}

	function onPercentCancel() {
		const snapshot = snapshotRef.current;
		snapshotRef.current = null;
		if (mountedRef.current && snapshot?.identity === interactionIdentity) {
			if (snapshot.sizeSource && restoreSizeSelection) restoreSizeSelection(snapshot.sizeInput, snapshot.sizeSource);
			else setSizeInput(snapshot.sizeInput);
		}
	}

	function onPercentCommit(percent: number) {
		if (!mountedRef.current) return;
		const snapshot = snapshotRef.current;
		snapshotRef.current = null;
		if (snapshot && snapshot.identity !== interactionIdentity) return;
		applyPercent(percent);
	}

	function onPercentInteractionEnd() {
		snapshotRef.current = null;
		onInteractionChange?.(false);
	}
	return { onPercentCancel, onPercentCommit, onPercentInteractionStart, onPercentInteractionEnd };
}
