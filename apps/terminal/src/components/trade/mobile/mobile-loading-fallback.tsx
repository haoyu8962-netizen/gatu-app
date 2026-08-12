import { MOBILE_BOTTOM_NAV_HEIGHT_PX } from "@/config/layout";

const MOBILE_NAV_ITEMS = ["markets", "trade", "account"] as const;

export function MobileLoadingFallback() {
	return (
		<div className="fixed inset-0 w-full flex flex-col bg-background text-fg font-sans overflow-hidden overscroll-none">
			<div className="pt-[env(safe-area-inset-top)] border-b border-stroke-weak/60">
				<div className="h-14 px-3 flex items-center justify-between">
					<div className="flex items-center gap-1.5">
						<div className="size-6 rounded bg-surface animate-pulse" />
						<div className="h-3 w-20 rounded bg-surface animate-pulse" />
					</div>
					<div className="flex items-center gap-2">
						<div className="size-8 rounded bg-surface animate-pulse" />
						<div className="size-8 rounded bg-surface animate-pulse" />
					</div>
				</div>
			</div>
			<div className="flex-1 min-h-0 p-4 space-y-3">
				<div className="h-5 w-32 rounded bg-surface animate-pulse" />
				<div className="flex-1 h-48 rounded bg-surface/50 animate-pulse" />
				<div className="flex gap-3">
					<div className="h-4 w-16 rounded bg-surface animate-pulse" />
					<div className="h-4 w-16 rounded bg-surface animate-pulse" />
					<div className="h-4 w-16 rounded bg-surface animate-pulse" />
				</div>
			</div>
			<div className="border-t border-stroke-weak/60 pb-[env(safe-area-inset-bottom)]">
				<div className="flex items-stretch">
					{MOBILE_NAV_ITEMS.map((item) => (
						<NavSkeleton key={item} />
					))}
				</div>
			</div>
		</div>
	);
}

function NavSkeleton() {
	return (
		<div
			className="flex-1 flex flex-col items-center justify-center gap-1 py-2"
			style={{ minHeight: MOBILE_BOTTOM_NAV_HEIGHT_PX }}
		>
			<div className="size-5 rounded bg-surface animate-pulse" />
			<div className="h-2 w-8 rounded bg-surface animate-pulse" />
		</div>
	);
}
