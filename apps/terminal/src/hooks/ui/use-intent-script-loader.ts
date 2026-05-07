import { useState } from "react";
import { loadScript } from "@/lib/load-script";

export type ScriptLoadStatus = "idle" | "loading" | "ready" | "error";

interface UseIntentScriptLoaderOptions {
	src: string;
	enabled?: boolean;
	timeoutMs?: number;
	isReady?: () => boolean;
	onIntent?: () => void;
}

function safeCheckReady(isReady?: () => boolean): boolean {
	if (!isReady) return false;
	try {
		return isReady();
	} catch {
		return false;
	}
}

export function useIntentScriptLoader({
	src,
	enabled = true,
	timeoutMs,
	isReady,
	onIntent,
}: UseIntentScriptLoaderOptions) {
	const [status, setStatus] = useState<ScriptLoadStatus>(() => (safeCheckReady(isReady) ? "ready" : "idle"));
	const [error, setError] = useState<Error | null>(null);

	async function preload() {
		if (!enabled) return;

		if (safeCheckReady(isReady)) {
			setError(null);
			setStatus("ready");
			return;
		}

		setStatus((current) => (current === "ready" ? current : "loading"));

		try {
			await loadScript(src, { timeoutMs, isReady });
			setError(null);
			setStatus("ready");
		} catch (err) {
			setError(err instanceof Error ? err : new Error("Failed to load script"));
			setStatus("error");
		}
	}

	function preloadOnIntent() {
		try {
			onIntent?.();
		} catch {
			// Intentionally ignore intent callback failures so script preload can continue.
		}
		void preload();
	}

	const intentHandlers = {
		onMouseEnter: preloadOnIntent,
		onFocus: preloadOnIntent,
		onPointerDown: preloadOnIntent,
		onTouchStart: preloadOnIntent,
	};

	return {
		status,
		error,
		isLoading: status === "loading",
		isReady: status === "ready",
		preload,
		intentHandlers,
	};
}
