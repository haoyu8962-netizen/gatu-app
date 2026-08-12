import { APP_HEADER_HEIGHT_CLASS } from "@/config/layout";
import { cn } from "@/lib/cn";

export function AppShellSkeleton() {
	return (
		<>
			<div className="fixed inset-0 flex w-full flex-col overflow-hidden overscroll-none bg-background min-[1001px]:hidden">
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
					<div className="h-48 w-full rounded bg-surface/50 animate-pulse" />
					<div className="flex gap-3">
						<div className="h-4 w-16 rounded bg-surface animate-pulse" />
						<div className="h-4 w-16 rounded bg-surface animate-pulse" />
						<div className="h-4 w-16 rounded bg-surface animate-pulse" />
					</div>
				</div>
				<div className="border-t border-stroke-weak/60 pb-[env(safe-area-inset-bottom)]">
					<div className="flex items-stretch">
						{["markets", "trade", "account"].map((tab) => (
							<div key={tab} className="flex-1 h-14 flex flex-col items-center justify-center gap-1 py-2">
								<div className="size-5 rounded bg-surface animate-pulse" />
								<div className="h-2 w-8 rounded bg-surface animate-pulse" />
							</div>
						))}
					</div>
				</div>
			</div>
			<div className="hidden h-screen w-full flex-col bg-background min-[1001px]:flex">
				<div
					className={cn(
						APP_HEADER_HEIGHT_CLASS,
						"flex shrink-0 items-center gap-2 border-b border-market-close-stroke-card px-5",
					)}
				>
					<div className="size-[26px] animate-pulse rounded-[7px] bg-market-close-control" />
					<div className="h-4 w-12 animate-pulse rounded bg-market-close-hover" />
					<div className="ml-auto h-[34px] w-28 animate-pulse rounded-[10px] bg-market-close-hover" />
				</div>
				<div className="flex-1 min-h-0 animate-pulse bg-surface/20" />
			</div>
		</>
	);
}
