import { GatuLogo } from "@/components/brand/gatu-logo";
import { APP_HEADER_HEIGHT_CLASS } from "@/config/layout";
import { cn } from "@/lib/cn";

const DASHBOARD_CARD_KEYS = ["summary-1", "summary-2", "summary-3", "summary-4"] as const;

export function DashboardShellSkeleton() {
	return (
		<div data-testid="dashboard-shell-fallback" className="min-h-dvh bg-dashboard-canvas font-sans text-fg">
			<output className="sr-only">Loading GATU...</output>
			<div
				data-slot="dashboard-skeleton-header"
				aria-hidden="true"
				className="border-b border-stroke-weak bg-surface pt-[env(safe-area-inset-top)] min-[1001px]:pt-0"
			>
				<div
					className={cn(
						APP_HEADER_HEIGHT_CLASS,
						"flex items-center pl-[max(0.625rem,var(--sal))] pr-[max(0.625rem,var(--sar))] min-[1001px]:px-5",
					)}
				>
					<GatuLogo className="hidden h-[18px] w-auto min-[1001px]:block" />
					<GatuLogo variant="mark" micro className="size-[22px] min-[1001px]:hidden" />
				</div>
			</div>
			<main
				aria-busy="true"
				className="mx-auto w-full max-w-[1440px] space-y-4 px-4 py-5 min-[1001px]:px-10 min-[1001px]:py-6"
			>
				<div aria-hidden="true" className="space-y-4">
					<div className="h-8 w-48 rounded-8 bg-fill-weak" />
					<div className="grid grid-cols-2 gap-3 min-[1001px]:grid-cols-4">
						{DASHBOARD_CARD_KEYS.map((key) => (
							<div key={key} className="h-20 rounded-16 border border-stroke-weak bg-surface" />
						))}
					</div>
					<div className="h-[min(28rem,55dvh)] rounded-20 border border-stroke-weak bg-surface" />
				</div>
			</main>
		</div>
	);
}
