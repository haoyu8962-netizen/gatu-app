import { Suspense } from "react";
import { createLazyComponent, preloadLazyComponents } from "@/lib/lazy";

const Toaster = createLazyComponent(() => import("@/components/ui/sonner"), "Toaster");
const AppToaster = createLazyComponent(() => import("@/components/app-toaster"), "AppToaster");

export function preloadAppRuntimeOverlays(): Promise<void> {
	return preloadLazyComponents([AppToaster]);
}

export function AppRuntimeOverlays() {
	return (
		<Suspense fallback={null}>
			<AppToaster />
		</Suspense>
	);
}

export function DocumentOverlays() {
	return (
		<Suspense fallback={null}>
			<Toaster />
		</Suspense>
	);
}
