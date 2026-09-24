import { CheckCircleIcon, InfoIcon, SpinnerGapIcon, WarningIcon, WarningOctagonIcon } from "@phosphor-icons/react";
import { useEffect } from "react";
import { Toaster as Sonner, type ToasterProps, toast } from "sonner";
import { MOBILE_BOTTOM_NAV_HEIGHT_PX } from "@/config/layout";
import { TOAST_DEFAULT_DURATION_MS } from "@/config/time";
import { useIsMobile } from "@/hooks/use-mobile";
import "./sonner.css";
import { useTheme } from "@/stores/use-global-settings-store";

const TOAST_WIDTH = "20rem";
const MOBILE_TOAST_BOTTOM_OFFSET = `calc(env(safe-area-inset-bottom) + ${MOBILE_BOTTOM_NAV_HEIGHT_PX}px + 12px)`;
const MOBILE_TOAST_INLINE_OFFSET = "max(16px, var(--sal), var(--sar))";

function Toaster(props: ToasterProps) {
	const theme = useTheme();
	const isMobile = useIsMobile();
	useEffect(() => {
		for (const notification of toast.getToasts()) {
			if (!("title" in notification)) continue;
			const title = typeof notification.title === "function" ? notification.title() : notification.title;
			toast.message(title, notification);
		}
	}, []);

	return (
		<Sonner
			theme={theme as ToasterProps["theme"]}
			className="toaster group"
			position="bottom-right"
			offset={{
				bottom: isMobile ? MOBILE_TOAST_BOTTOM_OFFSET : "max(24px, env(safe-area-inset-bottom))",
				right: MOBILE_TOAST_INLINE_OFFSET,
				left: MOBILE_TOAST_INLINE_OFFSET,
			}}
			mobileOffset={{
				bottom: MOBILE_TOAST_BOTTOM_OFFSET,
				left: MOBILE_TOAST_INLINE_OFFSET,
				right: MOBILE_TOAST_INLINE_OFFSET,
			}}
			richColors
			duration={TOAST_DEFAULT_DURATION_MS}
			icons={{
				success: <CheckCircleIcon className="size-4" />,
				info: <InfoIcon className="size-4" />,
				warning: <WarningIcon className="size-4" />,
				error: <WarningOctagonIcon className="size-4" />,
				loading: <SpinnerGapIcon className="size-4 animate-spin" />,
			}}
			toastOptions={{
				className: "text-xs font-sans",
			}}
			style={
				{
					zIndex: "var(--z-toast)",
					"--normal-bg": "var(--bg-overlay)",
					"--normal-text": "var(--text-strong)",
					"--normal-border": "var(--stroke-weak)",
					"--border-radius": "var(--radius-8)",
					"--success-bg": "var(--bg-overlay)",
					"--success-text": "var(--text-success)",
					"--success-border": "var(--text-success)",
					"--error-bg": "var(--bg-overlay)",
					"--error-text": "var(--text-error)",
					"--error-border": "var(--text-error)",
					"--warning-bg": "var(--bg-overlay)",
					"--warning-text": "var(--text-warning)",
					"--warning-border": "var(--text-warning)",
					"--info-bg": "var(--bg-overlay)",
					"--info-text": "var(--text-info)",
					"--info-border": "var(--text-info)",
					"--width": TOAST_WIDTH,
				} as React.CSSProperties
			}
			{...props}
		/>
	);
}

export { Toaster };
