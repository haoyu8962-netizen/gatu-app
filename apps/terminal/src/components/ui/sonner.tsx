import { CheckCircleIcon, InfoIcon, SpinnerGapIcon, WarningIcon, WarningOctagonIcon } from "@phosphor-icons/react";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import { TOAST_DEFAULT_DURATION_MS } from "@/config/time";
import { useTheme } from "@/stores/use-global-settings-store";

const TOAST_WIDTH = "20rem";

function Toaster(props: ToasterProps) {
	const theme = useTheme();

	return (
		<Sonner
			theme={theme as ToasterProps["theme"]}
			className="toaster group"
			position="bottom-right"
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
					"--width": TOAST_WIDTH,
				} as React.CSSProperties
			}
			{...props}
		/>
	);
}

export { Toaster };
