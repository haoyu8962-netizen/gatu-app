import { useLingui } from "@lingui/react/macro";
import { SpinnerGapIcon, WifiHighIcon, WifiSlashIcon } from "@phosphor-icons/react";
import { ClientOnly, Link } from "@tanstack/react-router";
import { FOOTER_LABELS, FOOTER_LINKS } from "@/config/footer-links";
import { useMinuteClock } from "@/hooks/ui/use-minute-clock";
import { formatTime } from "@/lib/format";
import { type ApiStatus, useApiStatus } from "@/lib/hyperliquid";
import { useCommandMenuActions } from "@/stores/use-global-modal-store";
import { FooterBarView, type FooterLink } from "./footer-bar-view";

export type FooterBarMode = "default" | "market-loading";

interface Props {
	mode?: FooterBarMode;
}

function useStatusDisplay(status: ApiStatus) {
	const { t } = useLingui();

	switch (status) {
		case "connected":
			return {
				icon: <WifiHighIcon className="size-2.5 text-success" aria-hidden />,
				text: t(FOOTER_LABELS.connected),
				className: "text-success",
			};
		case "connecting":
			return {
				icon: <SpinnerGapIcon className="size-2.5 text-warning animate-spin" aria-hidden />,
				text: t(FOOTER_LABELS.connecting),
				className: "text-warning",
			};
		case "error":
			return {
				icon: <WifiSlashIcon className="size-2.5 text-error" aria-hidden />,
				text: t(FOOTER_LABELS.disconnected),
				className: "text-error",
			};
		default:
			return {
				icon: <WifiHighIcon className="size-2.5 text-fg" aria-hidden />,
				text: t(FOOTER_LABELS.offline),
				className: "text-fg",
			};
	}
}

export function FooterBar({ mode = "default" }: Props) {
	const { t, i18n } = useLingui();
	const { status } = useApiStatus();
	const minute = useMinuteClock();
	const { icon, text, className } = useStatusDisplay(status);
	const { open } = useCommandMenuActions();
	const isMarketLoading = mode === "market-loading";

	const props = {
		icon,
		text,
		tone: className,
		commandDisabled: isMarketLoading,
		commandLabel: t(FOOTER_LABELS.command),
		commandKey: FOOTER_LABELS.commandKey,
		onCommand: open,
		links: FOOTER_LINKS.map((link) => ({ id: link.id, label: t(link.label) })),
		linksLabel: t(FOOTER_LABELS.links),
		renderLink: (link: FooterLink, className: string) => {
			const destination = FOOTER_LINKS.find((entry) => entry.id === link.id)?.path;
			if (!destination) return null;
			return (
				<Link to={destination} className={className}>
					{link.label}
				</Link>
			);
		},
	};
	const locale = i18n.locale;
	const clock = minute === null ? null : formatTime(minute, { locale });
	return (
		<ClientOnly fallback={<FooterBarView {...props} clock={null} />}>
			<FooterBarView {...props} clock={clock} />
		</ClientOnly>
	);
}
