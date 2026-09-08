import { type RefCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { getOrderbookLevelKey, type OrderbookPulseSide } from "@/lib/trade/orderbook-new-levels";
import { createOrderbookLevelPulseController, type OrderbookLevelPulseInput } from "@/lib/ui/orderbook-level-pulses";

export function useOrderbookLevelPulses({
	active,
	identity,
	snapshot,
	viewKey,
	visibleLevels,
}: OrderbookLevelPulseInput) {
	const [controller] = useState(() => createOrderbookLevelPulseController({ environmentActive: false }));
	const [panel, setPanel] = useState<HTMLElement | null>(null);
	const refreshEnvironmentRef = useRef<(() => void) | null>(null);
	const pulseState = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getServerSnapshot);

	useEffect(() => {
		if (!panel) return;
		const motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
		let isVisible = isPanelInViewport(panel);
		let observing = true;
		function updateEnvironment() {
			if (!observing) return;
			controller.setEnvironmentActive(isVisible && document.visibilityState !== "hidden" && !motionQuery?.matches);
		}
		refreshEnvironmentRef.current = updateEnvironment;
		const observer =
			typeof IntersectionObserver === "undefined"
				? undefined
				: new IntersectionObserver((entries) => {
						const entry = entries.find((candidate) => candidate.target === panel);
						if (!entry) return;
						isVisible = entry.isIntersecting && entry.intersectionRatio > 0;
						updateEnvironment();
					});
		observer?.observe(panel);
		document.addEventListener("visibilitychange", updateEnvironment);
		motionQuery?.addEventListener("change", updateEnvironment);
		updateEnvironment();
		return () => {
			observing = false;
			if (refreshEnvironmentRef.current === updateEnvironment) refreshEnvironmentRef.current = null;
			observer?.disconnect();
			document.removeEventListener("visibilitychange", updateEnvironment);
			motionQuery?.removeEventListener("change", updateEnvironment);
			controller.setEnvironmentActive(false);
			controller.reset();
		};
	}, [controller, panel]);

	useEffect(() => {
		if (!panel) return;
		refreshEnvironmentRef.current?.();
		controller.commit({ active, identity, snapshot, viewKey, visibleLevels });
	}, [active, controller, identity, panel, snapshot, viewKey, visibleLevels]);

	function getPulse(side: OrderbookPulseSide, price: string) {
		if (!active || !snapshot || pulseState.identity !== identity || pulseState.viewKey !== viewKey) return undefined;
		const key = getOrderbookLevelKey(side, price);
		return key === null ? undefined : pulseState.events.get(key);
	}

	const panelRef: RefCallback<HTMLElement> = setPanel;
	return { panelRef, getPulse, onAnimationEnd: controller.onAnimationEnd };
}

function isPanelInViewport(panel: HTMLElement) {
	const bounds = panel.getBoundingClientRect();
	return (
		panel.isConnected &&
		bounds.width > 0 &&
		bounds.height > 0 &&
		bounds.bottom > 0 &&
		bounds.right > 0 &&
		bounds.top < window.innerHeight &&
		bounds.left < window.innerWidth
	);
}
