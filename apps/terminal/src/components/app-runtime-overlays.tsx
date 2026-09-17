import { Suspense } from "react";
import { createLazyComponent, preloadLazyComponents } from "@/lib/lazy";

const Toaster = createLazyComponent(() => import("@/components/ui/sonner"), "Toaster");
const FundsActionRecoveryHost = createLazyComponent(
	() => import("@/components/funds-action/funds-action-recovery-host"),
	"FundsActionRecoveryHost",
);

export function preloadAppRuntimeOverlays(): Promise<void> {
	return preloadLazyComponents([Toaster, FundsActionRecoveryHost]);
}

export function AppRuntimeOverlays() {
	return (
		<>
			<Suspense fallback={null}>
				<FundsActionRecoveryHost />
			</Suspense>
			<Suspense fallback={null}>
				<Toaster />
			</Suspense>
		</>
	);
}

export function DocumentOverlays() {
	return (
		<Suspense fallback={null}>
			<Toaster />
		</Suspense>
	);
}
