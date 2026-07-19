import { Link } from "@tanstack/react-router";
import { APP_HEADER_HEIGHT_CLASS } from "@/config/layout";
import { useTradeHomePath } from "@/hooks/trade/use-trade-home-path";
import { cn } from "@/lib/cn";
import { UserMenu } from "../header/user-menu";
import { MobileNavDrawer } from "./mobile-nav-drawer";

interface Props {
	className?: string;
}

export function MobileHeader({ className }: Props) {
	const tradeHomePath = useTradeHomePath();

	return (
		<header
			className={cn(
				"pt-[env(safe-area-inset-top)]",
				"sticky top-0 z-40 bg-surface/95 backdrop-blur-sm",
				"border-b border-stroke-weak/60",
				className,
			)}
		>
			<div className={cn(APP_HEADER_HEIGHT_CLASS, "px-2 flex items-center justify-between")}>
				<div className="flex items-center gap-1">
					<MobileNavDrawer />
					<Link
						to={tradeHomePath}
						search={{ scope: "all" }}
						aria-label="gatu"
						className="rounded-8 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus"
					>
						<img src="/icon.svg" alt="" aria-hidden className="size-6 rounded-8" />
					</Link>
				</div>

				<div className="flex min-w-0 items-center">
					<UserMenu />
				</div>
			</div>
		</header>
	);
}
