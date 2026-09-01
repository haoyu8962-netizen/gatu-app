import { i18n } from "@lingui/core";
import { Trans, useLingui } from "@lingui/react/macro";
import { Link, useHydrated, useLocation } from "@tanstack/react-router";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { GatuLogo } from "@/components/brand/gatu-logo";
import { LanguageSwitcher } from "@/components/trade/header/language-switcher";
import { ThemeToggle } from "@/components/trade/header/theme-toggle";
import { APP_VERSION } from "@/config/app";
import { cn } from "@/lib/cn";
import { getPersistedLocale, i18nReady } from "@/lib/i18n";

const DOCUMENT_LINKS = [
	{ to: "/docs", label: "Docs" },
	{ to: "/support", label: "Support" },
	{ to: "/terms", label: "Terms" },
	{ to: "/privacy", label: "Privacy Policy" },
	{ to: "/risk", label: "Risk Disclosure" },
] as const;

interface Props {
	children: ReactNode;
}

export function DocumentChrome({ children }: Props) {
	const hydrated = useHydrated();
	const catalogReady = useInitialCatalogReady();
	const translated = hydrated && catalogReady;
	const catalogPending = hydrated && !catalogReady;

	return (
		<div className="min-h-dvh bg-background font-sans text-fg">
			{catalogPending ? <output className="sr-only">Loading GATU...</output> : null}
			<div
				className={cn("flex min-h-dvh flex-col", catalogPending && "invisible")}
				aria-hidden={catalogPending || undefined}
			>
				<DocumentHeader hydrated={hydrated} translated={translated} />
				{children}
				<DocumentFooter translated={translated} />
			</div>
		</div>
	);
}

function useInitialCatalogReady(): boolean {
	const [ready, setReady] = useState(() => i18n.locale === getPersistedLocale());

	useEffect(() => {
		if (ready) return;
		let active = true;
		i18nReady.finally(() => {
			if (active) setReady(true);
		});
		return () => {
			active = false;
		};
	}, [ready]);

	return ready;
}

function DocumentHeader({ hydrated, translated }: { hydrated: boolean; translated: boolean }) {
	const { pathname } = useLocation();

	return (
		<header className="sticky top-0 z-40 shrink-0 border-b border-stroke-weak bg-surface pt-[env(safe-area-inset-top)] min-[1001px]:pt-0">
			<div className="mx-auto flex h-14 w-full max-w-[1440px] items-center gap-3 pl-[max(1rem,var(--sal))] pr-[max(1rem,var(--sar))] min-[1001px]:px-5">
				<Link
					to="/trade"
					search={{ scope: "all" }}
					aria-label="GATU"
					className="flex size-11 shrink-0 items-center rounded-8 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus min-[1001px]:me-3 min-[1001px]:w-auto"
				>
					<GatuLogo className="hidden h-[18px] w-auto min-[1001px]:block" />
					<GatuLogo variant="mark" micro className="size-[22px] min-[1001px]:hidden" />
				</Link>
				<DocumentNavigation pathname={pathname} translated={translated} className="hidden min-[701px]:flex" primary />
				<div className="ms-auto flex shrink-0 items-center gap-1">
					{hydrated ? (
						<>
							<ThemeToggle className="size-11 rounded-8 min-[1001px]:size-9" />
							<LanguageSwitcher className="size-11 min-h-11 rounded-8 min-[1001px]:size-9 min-[1001px]:min-h-9" />
						</>
					) : (
						<>
							<span aria-hidden="true" className="size-11 min-[1001px]:size-9" />
							<span aria-hidden="true" className="size-11 min-[1001px]:size-9" />
						</>
					)}
				</div>
			</div>
			<DocumentNavigation
				pathname={pathname}
				translated={translated}
				className="flex h-11 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden min-[701px]:hidden"
				primary
				scrollActiveIntoView
			/>
		</header>
	);
}

function DocumentNavigation({
	pathname,
	translated,
	className,
	primary = false,
	scrollActiveIntoView = false,
}: {
	pathname: string;
	translated: boolean;
	className?: string;
	primary?: boolean;
	scrollActiveIntoView?: boolean;
}) {
	const { i18n, t } = useLingui();
	const activeLinkRef = useRef<HTMLAnchorElement>(null);
	const navigationIdentity = `${pathname}:${translated ? i18n.locale : "source"}`;
	const ariaLabel =
		primary && translated ? t`Primary navigation` : primary ? "Primary navigation" : "Documentation and legal";

	useEffect(() => {
		const activeLink = activeLinkRef.current;
		if (!scrollActiveIntoView || activeLink?.dataset.navigationIdentity !== navigationIdentity) return;
		activeLink.scrollIntoView?.({ block: "nearest", inline: "nearest" });
	}, [navigationIdentity, scrollActiveIntoView]);

	return (
		<nav className={cn("items-stretch gap-1", className)} aria-label={ariaLabel}>
			{DOCUMENT_LINKS.map((item) => {
				const active = pathname === item.to;
				return (
					<Link
						key={item.to}
						ref={active ? activeLinkRef : undefined}
						data-navigation-identity={active ? navigationIdentity : undefined}
						to={item.to}
						aria-current={active ? "page" : undefined}
						className={cn(
							"flex shrink-0 items-center rounded-8 px-2.5 text-xs font-semibold transition-colors hover:bg-fill-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-stroke-focus",
							active ? "text-fg" : "text-fg-muted",
						)}
					>
						<DocumentLinkLabel label={item.label} translated={translated} />
					</Link>
				);
			})}
		</nav>
	);
}

function DocumentLinkLabel({
	label,
	translated,
}: {
	label: (typeof DOCUMENT_LINKS)[number]["label"];
	translated: boolean;
}) {
	if (!translated) return label;

	switch (label) {
		case "Docs":
			return <Trans>Docs</Trans>;
		case "Support":
			return <Trans>Support</Trans>;
		case "Terms":
			return <Trans>Terms</Trans>;
		case "Privacy Policy":
			return <Trans>Privacy Policy</Trans>;
		case "Risk Disclosure":
			return <Trans>Risk Disclosure</Trans>;
	}
}

function DocumentFooter({ translated }: { translated: boolean }) {
	const { t } = useLingui();
	const navigationLabel = translated ? t`Documentation and legal` : "Documentation and legal";

	return (
		<footer className="mt-auto shrink-0 border-t border-stroke-weak bg-surface pt-3 pr-[max(1rem,var(--sar))] pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pl-[max(1rem,var(--sal))] text-xs text-fg-muted min-[1001px]:px-4 min-[1001px]:pb-3">
			<div className="mx-auto flex w-full max-w-[1440px] items-center justify-between gap-4">
				<nav className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2" aria-label={navigationLabel}>
					<Link
						to="/cookies"
						className="rounded-6 hover:text-fg focus-visible:outline-2 focus-visible:outline-stroke-focus"
					>
						{translated ? <Trans>Cookie Policy</Trans> : "Cookie Policy"}
					</Link>
				</nav>
				<span className="shrink-0 tabular-nums text-fg">{APP_VERSION}</span>
			</div>
		</footer>
	);
}
