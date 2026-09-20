import { Suspense } from "react";
import { useHasBeenActive } from "@/hooks/ui/use-has-been-active";
import { useHasPositionDialogSession } from "@/stores/use-position-dialog-store";
import { PositionDialogHost } from "./lazy-global-modals";

export function PositionDialogHostGate() {
	const hasSession = useHasPositionDialogSession();
	const hasBeenActive = useHasBeenActive(hasSession);
	if (!hasBeenActive) return null;

	return (
		<Suspense fallback={null}>
			<PositionDialogHost />
		</Suspense>
	);
}
