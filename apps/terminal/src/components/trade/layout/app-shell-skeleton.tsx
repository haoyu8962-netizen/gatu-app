import { APP_HEADER_HEIGHT_CLASS } from "@/config/layout";
import { cn } from "@/lib/cn";
import { DesktopGridLoadingSurface } from "./desktop-grid-loading-surface";

export function AppShellSkeleton() {
	return (
		<div aria-busy="true" data-testid="app-shell-fallback">
			<output className="sr-only">Loading gatu...</output>
			<div aria-hidden="true">
				<style>{`
					[data-shell-mobile]{display:flex}
					[data-shell-desktop]{display:none}
					@media (min-width:1001px){
						[data-shell-mobile]{display:none}
						[data-shell-desktop]{display:flex}
					}
				`}</style>
				<MobileShellSkeleton />
				<div data-shell-desktop className="hidden h-screen w-full flex-col bg-background min-[1001px]:flex">
					<div
						className={cn(
							APP_HEADER_HEIGHT_CLASS,
							"flex shrink-0 items-center gap-2 border-b border-market-close-stroke-card px-5",
						)}
					>
						<span className="grid size-[26px] place-items-center rounded-[7px] bg-market-close-control text-market-close-on-control">
							<svg viewBox="0 0 120 120" width={18} height={18} fill="none" className="size-[18px]">
								<title>Gatu</title>
								<path
									d="M66 60 H100 A40 40 0 1 0 76.9 96.25"
									stroke="currentColor"
									strokeWidth="16"
									strokeLinecap="round"
									strokeLinejoin="round"
								/>
							</svg>
						</span>
						<span className="text-base font-bold text-market-close-fg">gatu</span>
					</div>
					<div className="min-h-0 flex-1 overflow-hidden bg-grid-container">
						<DesktopGridLoadingSurface markShellPanels panelClassName="bg-surface" />
					</div>
				</div>
			</div>
		</div>
	);
}

export function MobileShellSkeleton() {
	return (
		<div
			aria-hidden="true"
			data-shell-mobile
			className="fixed inset-0 flex w-full flex-col overflow-hidden overscroll-none bg-background min-[1001px]:hidden"
		>
			<div className="pt-[env(safe-area-inset-top)] border-b border-stroke-weak/60">
				<div className="h-14 px-3 flex items-center justify-between">
					<div className="flex items-center gap-1.5">
						<span className="grid size-6 place-items-center rounded-[6px] bg-market-close-control text-market-close-on-control">
							<svg viewBox="0 0 120 120" width={16} height={16} fill="none" className="size-4">
								<title>Gatu</title>
								<path
									d="M66 60 H100 A40 40 0 1 0 76.9 96.25"
									stroke="currentColor"
									strokeWidth="16"
									strokeLinecap="round"
									strokeLinejoin="round"
								/>
							</svg>
						</span>
						<span className="text-sm font-bold text-market-close-fg">gatu</span>
					</div>
				</div>
			</div>
			<div className="flex min-h-0 flex-1 flex-col gap-[3px] bg-grid-container p-[3px]">
				<div className="h-12 shrink-0 bg-surface" />
				<div className="min-h-48 flex-[3] bg-surface" />
				<div className="grid min-h-40 flex-[2] grid-cols-2 gap-[3px]">
					<div className="bg-surface" />
					<div className="bg-surface" />
				</div>
				<div className="min-h-36 flex-[2] bg-surface" />
			</div>
			<div className="border-t border-stroke-weak/60 pb-[env(safe-area-inset-bottom)]">
				<div className="flex items-stretch">
					{["markets", "trade", "account"].map((tab) => (
						<div key={tab} className="flex-1 h-14" />
					))}
				</div>
			</div>
		</div>
	);
}
