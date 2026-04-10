import { Divider } from "@hypeterminal/ui";
import { t } from "@lingui/core/macro";
import { GithubLogoIcon, SpinnerGapIcon, WifiHighIcon, WifiSlashIcon } from "@phosphor-icons/react";
import { ClientOnly } from "@tanstack/react-router";
import { APP_VERSION, GITHUB_URL } from "@/config/constants";
import { formatTime } from "@/lib/format";
import { type ApiStatus, useApiStatus } from "@/lib/hyperliquid";
import { useCommandMenuActions } from "@/stores/use-global-modal-store";

function getStatusDisplay(status: ApiStatus) {
	switch (status) {
		case "connected":
			return {
				icon: <WifiHighIcon className="size-2.5 text-text-success" aria-hidden />,
				text: t`Connected`,
				className: "text-text-success",
			};
		case "connecting":
			return {
				icon: <SpinnerGapIcon className="size-2.5 text-text-warning animate-spin" aria-hidden />,
				text: t`Connecting`,
				className: "text-text-warning",
			};
		case "error":
			return {
				icon: <WifiSlashIcon className="size-2.5 text-text-error" aria-hidden />,
				text: t`Disconnected`,
				className: "text-text-error",
			};
		default:
			return {
				icon: <WifiHighIcon className="size-2.5 text-text-strong" aria-hidden />,
				text: t`Offline`,
				className: "text-text-strong",
			};
	}
}

export function FooterBar() {
	const { status } = useApiStatus();
	const { icon, text, className } = getStatusDisplay(status);
	const { open } = useCommandMenuActions();

	return (
		<footer className="fixed bottom-0 left-0 right-0 z-40 h-8 border-t border-stroke-weak px-4 text-3xs font-medium uppercase tracking-wide leading-none flex items-center justify-between bg-bg-base">
			<div className="flex min-w-0 items-center gap-2">
				<div className="flex min-w-0 items-center gap-1.5">
					{icon}
					<span className={className}>{text}</span>
				</div>
			</div>
			<button
				type="button"
				onClick={open}
				className="absolute left-1/2 flex min-h-8 min-w-8 -translate-x-1/2 items-center justify-center rounded-8 text-text-weak transition-colors hover:bg-fill-hover hover:text-text-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus"
				aria-label={t`Open command menu`}
			>
				<kbd className="pointer-events-none rounded-6 border border-stroke-weak bg-bg-sunken px-1 py-px font-sans text-3xs leading-none text-text-weak">
					{"\u2318K"}
				</kbd>
			</button>
			<div className="flex shrink-0 items-center gap-2.5 text-text-weak">
				<a
					href={GITHUB_URL}
					target="_blank"
					rel="noopener noreferrer"
					className="flex items-center rounded-6 p-0.5 text-text-weak transition-colors hover:text-text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus"
					aria-label="GitHub"
				>
					<GithubLogoIcon className="size-2.5" />
				</a>
				<Divider orientation="vertical" className="my-1.5" />
				<ClientOnly>
					<span className="tabular-nums text-text-strong">{formatTime(new Date())}</span>
				</ClientOnly>
				<Divider orientation="vertical" className="my-1.5" />
				<span className="text-text-strong">{APP_VERSION}</span>
			</div>
		</footer>
	);
}
