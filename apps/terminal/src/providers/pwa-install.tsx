import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { MOBILE_QR_SURFACE_MEDIA_QUERY } from "@/hooks/use-mobile";

const STANDALONE_MEDIA_QUERY = "(display-mode: standalone)";

interface BeforeInstallPromptEvent extends Event {
	prompt: () => Promise<void>;
	userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type PwaInstallCapability = "browser-prompt" | "ios-instructions" | "installed" | "unsupported";
export type PwaInstallOutcome = "accepted" | "dismissed" | "failed";

interface PwaInstallContextValue {
	capability: PwaInstallCapability;
	promptInstall: () => Promise<PwaInstallOutcome>;
}

const PwaInstallContext = createContext<PwaInstallContextValue | null>(null);

function subscribeToStandalone(callback: () => void): () => void {
	const mediaQuery = window.matchMedia(STANDALONE_MEDIA_QUERY);
	mediaQuery.addEventListener("change", callback);
	return () => mediaQuery.removeEventListener("change", callback);
}

function getStandaloneSnapshot(): boolean {
	if (window.matchMedia(STANDALONE_MEDIA_QUERY).matches) return true;
	return Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

function getStandaloneServerSnapshot(): boolean {
	return false;
}

function isIosDevice(): boolean {
	if (/iPad|iPhone|iPod/.test(navigator.userAgent)) return true;
	return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

export function PwaInstallProvider({ children }: { children: React.ReactNode }) {
	const installPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
	const [hasBrowserPrompt, setHasBrowserPrompt] = useState(false);
	const [installedInSession, setInstalledInSession] = useState(false);
	const isStandalone = useSyncExternalStore(subscribeToStandalone, getStandaloneSnapshot, getStandaloneServerSnapshot);

	useEffect(() => {
		function handleBeforeInstallPrompt(event: Event) {
			if (!window.matchMedia(MOBILE_QR_SURFACE_MEDIA_QUERY).matches) return;

			const installPrompt = event as BeforeInstallPromptEvent;
			installPrompt.preventDefault();
			installPromptRef.current = installPrompt;
			setHasBrowserPrompt(true);
		}

		function handleAppInstalled() {
			installPromptRef.current = null;
			setHasBrowserPrompt(false);
			setInstalledInSession(true);
		}

		window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
		window.addEventListener("appinstalled", handleAppInstalled);
		return () => {
			window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
			window.removeEventListener("appinstalled", handleAppInstalled);
		};
	}, []);

	const capability: PwaInstallCapability =
		isStandalone || installedInSession
			? "installed"
			: hasBrowserPrompt
				? "browser-prompt"
				: isIosDevice()
					? "ios-instructions"
					: "unsupported";

	const promptInstall = useCallback(async (): Promise<PwaInstallOutcome> => {
		const installPrompt = installPromptRef.current;
		if (!installPrompt || isStandalone) return "failed";

		installPromptRef.current = null;
		setHasBrowserPrompt(false);
		try {
			await installPrompt.prompt();
			const choice = await installPrompt.userChoice;
			return choice.outcome;
		} catch {
			return "failed";
		}
	}, [isStandalone]);

	const value = useMemo(() => ({ capability, promptInstall }), [capability, promptInstall]);

	return <PwaInstallContext.Provider value={value}>{children}</PwaInstallContext.Provider>;
}

export function usePwaInstall(): PwaInstallContextValue {
	const context = useContext(PwaInstallContext);
	if (!context) throw new Error("usePwaInstall must be used within PwaInstallProvider");
	return context;
}
