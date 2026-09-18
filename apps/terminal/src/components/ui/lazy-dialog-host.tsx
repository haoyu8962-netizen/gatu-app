import { type ReactNode, Suspense } from "react";
import { useHasBeenActive } from "@/hooks/ui/use-has-been-active";
import { LazyDialogErrorBoundary, LazyDialogLoadingFallback, type LazyDialogShellProps } from "./lazy-dialog-boundary";

interface Props extends LazyDialogShellProps {
	children: ReactNode;
}

export function LazyDialogHost({ open, onOpenChange, presentation, children }: Props) {
	const hasBeenOpened = useHasBeenActive(open);
	if (!hasBeenOpened) return null;

	return (
		<LazyDialogErrorBoundary open={open} onOpenChange={onOpenChange} presentation={presentation}>
			<Suspense
				fallback={<LazyDialogLoadingFallback open={open} onOpenChange={onOpenChange} presentation={presentation} />}
			>
				{children}
			</Suspense>
		</LazyDialogErrorBoundary>
	);
}
