export function AppShellSkeleton() {
	return (
		<>
			<div className="md:hidden h-dvh w-full flex flex-col bg-background overflow-hidden">
				<div className="pt-[env(safe-area-inset-top)] border-b border-stroke-weak/60">
					<div className="h-12 px-3 flex items-center justify-between">
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
						{["chart", "trade", "book", "positions", "account"].map((tab) => (
							<div key={tab} className="flex-1 h-14 flex flex-col items-center justify-center gap-1 py-2">
								<div className="size-5 rounded bg-surface animate-pulse" />
								<div className="h-2 w-8 rounded bg-surface animate-pulse" />
							</div>
						))}
					</div>
				</div>
			</div>
			<div className="hidden md:flex h-screen w-full flex-col bg-background">
				<div className="h-11 border-b border-stroke-weak/60 px-3 flex items-center gap-3 shrink-0">
					<div className="h-4 w-32 rounded bg-surface animate-pulse" />
					<div className="h-4 w-24 rounded bg-surface animate-pulse ml-auto" />
				</div>
				<div className="flex-1 min-h-0 animate-pulse bg-surface/20" />
			</div>
		</>
	);
}
