import { Trans } from "@lingui/react/macro";
import { ArrowSquareOutIcon, CoinIcon, WalletIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { HL_ICON_URL, USDC_ICON_URL } from "@/config/bridge";
import { cn } from "@/lib/cn";
import type { BridgeToken } from "@/lib/lifi/use-balances";

export function LiFiLogo({ className }: { className?: string }) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 132 48"
			fill="none"
			className={className}
			role="img"
			aria-label="LI.FI"
		>
			<path
				fill="currentColor"
				d="m19.314 0 9.878 9.879a3 3 0 0 1 0 4.242L23.314 20l-4-4c-4.419-4.418-4.419-11.582 0-16Z"
			/>
			<path
				fill="currentColor"
				fillRule="evenodd"
				d="m19.314 48-16-16c-4.419-4.418-4.419-11.582 0-16l13.878 13.879a3 3 0 0 0 4.243 0L35.314 16c4.418 4.418 4.418 11.582 0 16l-16 16Z"
				clipRule="evenodd"
			/>
			<path
				fill="currentColor"
				d="M123.319 36s.034-21 0-22 .985-2 1.966-2h4.034v22c.035 1-.965 2-1.965 2h-4.035ZM99.32 14v22h6v-8h10c1 0 2-1 2-2v-4h-12v-4h12c1 0 2-1 2-2v-4h-18c-1 0-2 1-2 2Zm-9.998 18c0-1 1-2 2-2h2c1 0 2 1 2 2v2c0 1-1 2-2 2h-2c-1 0-2-1-2-2v-2Zm-10.001 4s.034-21 0-22 .985-2 1.966-2h4.034v22c.035 1-.965 2-1.965 2h-4.035ZM55.32 30V14c0-1 .87-2 2-2h4v18h14v4c0 1-1 2-2 2h-18v-6Z"
			/>
		</svg>
	);
}

export function PoweredByLiFi() {
	return (
		<a
			href="https://li.fi"
			target="_blank"
			rel="noopener noreferrer"
			className="flex items-center justify-center gap-1.5 text-fg-disabled opacity-70 hover:opacity-100 transition-opacity"
		>
			<span className="text-3xs">Powered by</span>
			<LiFiLogo className="h-2.5" />
		</a>
	);
}

export function HyperCoreUsdcIcon({ size = "md" }: { size?: "sm" | "md" }) {
	const iconSize = size === "sm" ? "size-5" : "size-8";
	const badgeSize = size === "sm" ? "size-2.5" : "size-3.5";
	return (
		<div className="relative shrink-0">
			<img src={USDC_ICON_URL} alt="USDC" className={cn(iconSize, "rounded-full")} />
			<img
				src={HL_ICON_URL}
				alt="Hyperliquid"
				className={cn("absolute -bottom-0.5 -right-0.5 rounded-full border border-overlay", badgeSize)}
			/>
		</div>
	);
}

export function BridgeWalletNotConnected() {
	return (
		<div className="flex flex-col items-center gap-4 py-8">
			<div className="flex size-12 items-center justify-center rounded-full bg-surface border border-stroke-weak/40">
				<WalletIcon className="size-6 text-fg" />
			</div>
			<div className="text-center space-y-1">
				<p className="text-sm font-medium">
					<Trans>Wallet not connected</Trans>
				</p>
				<p className="text-xs text-fg">
					<Trans>Connect your wallet to bridge funds</Trans>
				</p>
			</div>
		</div>
	);
}

export function TokenIcon({ token, size = "md" }: { token: BridgeToken; size?: "sm" | "md" }) {
	const iconSize = size === "sm" ? "size-5" : "size-8";
	const badgeSize = size === "sm" ? "size-2.5" : "size-3.5";
	const fallbackIconSize = size === "sm" ? "size-3" : "size-4";
	return (
		<div className="relative shrink-0">
			{token.logoURI ? (
				<img
					src={token.logoURI}
					alt={token.symbol}
					className={cn(iconSize, "rounded-full")}
					onError={(e) => {
						e.currentTarget.style.display = "none";
						e.currentTarget.nextElementSibling?.classList.remove("hidden");
					}}
				/>
			) : null}
			<div
				className={cn("rounded-full bg-surface flex items-center justify-center", iconSize, token.logoURI && "hidden")}
			>
				<CoinIcon className={cn(fallbackIconSize, "text-fg-muted")} />
			</div>
			{token.chainLogoURI ? (
				<img
					src={token.chainLogoURI}
					alt={token.chainName}
					className={cn("absolute -bottom-0.5 -right-0.5 rounded-full border border-overlay", badgeSize)}
				/>
			) : null}
		</div>
	);
}

export function ExplorerLink({ href, children }: { href: string; children: React.ReactNode }) {
	return (
		<a
			href={href}
			target="_blank"
			rel="noopener noreferrer"
			className="inline-flex items-center gap-1 text-brand hover:opacity-80"
		>
			{children}
			<ArrowSquareOutIcon className="size-3" aria-hidden="true" />
		</a>
	);
}

const QUOTE_COUNTDOWN_RADIUS = 10;
const QUOTE_COUNTDOWN_DURATION_S = 30;

export function QuoteCountdown({ dataUpdatedAt }: { dataUpdatedAt: number }) {
	const [remaining, setRemaining] = useState(QUOTE_COUNTDOWN_DURATION_S);

	useEffect(() => {
		function tick() {
			const elapsed = (Date.now() - dataUpdatedAt) / 1000;
			setRemaining(Math.max(0, Math.ceil(QUOTE_COUNTDOWN_DURATION_S - elapsed)));
		}
		tick();
		const id = setInterval(tick, 1000);
		return () => clearInterval(id);
	}, [dataUpdatedAt]);

	const circumference = 2 * Math.PI * QUOTE_COUNTDOWN_RADIUS;
	const offset = circumference * (1 - remaining / QUOTE_COUNTDOWN_DURATION_S);

	return (
		<div className="relative flex size-7 items-center justify-center shrink-0">
			<svg className="size-7 -rotate-90" viewBox="0 0 24 24" role="img" aria-label="Quote countdown">
				<circle
					cx="12"
					cy="12"
					r={QUOTE_COUNTDOWN_RADIUS}
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					className="text-stroke-weak"
				/>
				<circle
					cx="12"
					cy="12"
					r={QUOTE_COUNTDOWN_RADIUS}
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					className="text-brand transition-[stroke-dashoffset] duration-1000 ease-linear"
					strokeDasharray={circumference}
					strokeDashoffset={offset}
					strokeLinecap="round"
				/>
			</svg>
			<span className="absolute text-xs tabular-nums font-medium text-fg">{remaining}</span>
		</div>
	);
}
