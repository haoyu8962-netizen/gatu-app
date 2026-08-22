import { useLingui } from "@lingui/react/macro";
import { cn } from "@/lib/cn";

export type TwapSubview = "current" | "history" | "fills";

interface Props {
	idPrefix: string;
	mobile?: boolean;
	onValueChange: (value: TwapSubview) => void;
	value: TwapSubview;
}

export function TwapSubviewTabs({ idPrefix, mobile = false, onValueChange, value }: Props) {
	const { t } = useLingui();
	const tabs: ReadonlyArray<{ label: string; value: TwapSubview }> = [
		{ label: t`Current`, value: "current" },
		{ label: t`History`, value: "history" },
		{ label: t`Fill History`, value: "fills" },
	];

	return (
		<div
			role="tablist"
			aria-label={t`TWAP activity`}
			className={cn(
				"flex shrink-0 items-stretch overflow-x-auto border-b border-market-close-stroke-card [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
				mobile ? "h-11 px-2" : "h-10 px-3",
			)}
		>
			{tabs.map((tab, index) => {
				const selected = value === tab.value;
				return (
					<button
						key={tab.value}
						type="button"
						role="tab"
						id={`${idPrefix}-${tab.value}-tab`}
						aria-controls={`${idPrefix}-${tab.value}-panel`}
						aria-selected={selected}
						tabIndex={selected ? 0 : -1}
						onClick={() => onValueChange(tab.value)}
						onKeyDown={(event) => {
							let nextIndex: number | null = null;
							if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
							if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
							if (event.key === "Home") nextIndex = 0;
							if (event.key === "End") nextIndex = tabs.length - 1;
							if (nextIndex === null) return;

							event.preventDefault();
							const nextTab = tabs[nextIndex];
							if (!nextTab) return;
							onValueChange(nextTab.value);
							document.getElementById(`${idPrefix}-${nextTab.value}-tab`)?.focus();
						}}
						className={cn(
							"relative inline-flex min-h-10 shrink-0 items-center justify-center px-3 text-xs font-semibold outline-none transition-colors duration-[120ms] after:absolute after:inset-x-2 after:bottom-0 after:h-px after:bg-transparent after:content-[''] focus-visible:rounded-xs focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-market-close-control",
							mobile && "min-h-11 px-3.5",
							selected
								? "text-market-close-fg after:bg-market-close-control"
								: "text-market-close-muted active:text-market-close-fg",
						)}
					>
						{tab.label}
					</button>
				);
			})}
		</div>
	);
}
