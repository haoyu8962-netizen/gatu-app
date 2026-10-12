import { Fragment, type ReactNode } from "react";
import { APP_BAR_BUTTON_HEIGHT_CLASS, APP_FOOTER_HEIGHT_CLASS } from "@/config/layout";
import { cn } from "@/lib/cn";

export const FOOTER_LINK_CLASS =
	"rounded-6 text-fg-muted transition-colors hover:text-signal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus";

export interface FooterLink {
	id: string;
	label: string;
}

interface Props {
	icon: ReactNode;
	text: string;
	tone: string;
	commandDisabled: boolean;
	commandLabel: string;
	commandKey: string;
	onCommand?: () => void;
	links: readonly FooterLink[];
	linksLabel: string;
	renderLink?: (link: FooterLink, className: string) => ReactNode;
	clock: string | null;
	buildLabel?: string | null;
}

export function FooterBarView({
	icon,
	text,
	tone,
	commandDisabled,
	commandLabel,
	commandKey,
	onCommand,
	links,
	linksLabel,
	renderLink,
	clock,
	buildLabel = null,
}: Props) {
	return (
		<footer
			className={cn(
				APP_FOOTER_HEIGHT_CLASS,
				"fixed bottom-0 left-0 right-0 z-40 border-t border-stroke-weak px-4 text-3xs font-medium uppercase tracking-wide leading-none flex items-center justify-between bg-background",
			)}
		>
			<div className="flex min-w-0 items-center gap-2">
				<div className="flex min-w-0 items-center gap-1.5">
					{icon}
					<span className={tone}>{text}</span>
				</div>
			</div>
			<button
				type="button"
				disabled={commandDisabled}
				onClick={commandDisabled ? undefined : onCommand}
				className={cn(
					APP_BAR_BUTTON_HEIGHT_CLASS,
					"absolute left-1/2 flex min-w-8 -translate-x-1/2 items-center justify-center rounded-8 text-fg-muted transition-colors hover:bg-fill-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus",
				)}
				aria-label={commandLabel}
			>
				<kbd className="pointer-events-none rounded-6 border border-stroke-weak bg-sunken px-1 py-px font-sans text-3xs leading-none text-fg-muted">
					{commandKey}
				</kbd>
			</button>
			<div className="flex shrink-0 items-center gap-2.5 text-fg-muted">
				<nav className="hidden items-center gap-2.5 normal-case md:flex" aria-label={linksLabel}>
					{links.map((link) => (
						<Fragment key={link.id}>
							{renderLink ? (
								renderLink(link, FOOTER_LINK_CLASS)
							) : (
								<span className={FOOTER_LINK_CLASS}>{link.label}</span>
							)}
						</Fragment>
					))}
				</nav>
				<div aria-hidden="true" className="shrink-0 border-stroke-weak self-stretch border-l my-1.5 hidden md:block" />
				<span className={cn("tabular-nums text-fg", clock === null && "invisible")}>{clock ?? "00:00 AM"}</span>
				{buildLabel ? (
					<Fragment>
						<div aria-hidden="true" className="shrink-0 border-stroke-weak self-stretch border-l my-1.5" />
						<span className="font-mono normal-case text-fg-muted">{buildLabel}</span>
					</Fragment>
				) : null}
			</div>
		</footer>
	);
}
