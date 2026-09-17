import { StarIcon, XIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";

interface Props {
	items: readonly {
		name: string;
		label: string;
		changeText?: string;
		changeTone?: "up" | "down" | "flat";
		active: boolean;
	}[];
	emptyLabel: string;
	onSelect?: (name: string) => void;
	onRemove?: (name: string) => void;
	removeLabel?: (name: string) => string;
	selectLabel?: (name: string) => string;
}

export function FavoritesStripView({ items, emptyLabel, onSelect, onRemove, removeLabel, selectLabel }: Props) {
	return (
		<div
			data-favorites-strip=""
			className="flex h-full items-center overflow-hidden border-b border-stroke-weak bg-surface px-2"
		>
			{items.length === 0 ? (
				<div className="flex items-center gap-2 text-xs text-fg">
					<StarIcon className="size-3" />
					<span>{emptyLabel}</span>
				</div>
			) : (
				<div className="flex items-center gap-1.5 overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
					<StarIcon weight="fill" className="size-3 shrink-0 text-yellow" />
					{items.map((item) => (
						<div key={item.name} className="group/fav relative shrink-0">
							<button
								type="button"
								onClick={() => onSelect?.(item.name)}
								aria-pressed={item.active}
								aria-label={selectLabel?.(item.name)}
								className={cn(
									"flex items-center justify-center gap-1.5 shrink-0 px-2 py-1 text-xs font-semibold select-none cursor-pointer rounded-8 border no-underline underline-offset-4 transition-[color,background-color,border-color,opacity] duration-150 ease-out motion-reduce:transition-none motion-reduce:active:scale-100 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus data-disabled:cursor-not-allowed data-disabled:text-fg-disabled text-fg",
									item.active
										? "border-stroke-weak/90 bg-fill-weak"
										: "border-stroke-weak/35 bg-fill-weaker/50 hover:border-stroke-weak/55 hover:bg-fill-weak/80 opacity-90",
								)}
							>
								<span
									className={cn("font-semibold uppercase transition-colors", item.active ? "text-fg" : "text-fg-muted")}
								>
									{item.label}
								</span>
								<span
									className={cn(
										"tabular-nums font-medium transition-opacity",
										{
											"text-error": item.changeTone === "down",
											"text-success": item.changeTone === "up",
											"text-fg-muted": !item.changeTone || item.changeTone === "flat",
										},
										!item.active && "opacity-85",
										item.changeText === undefined && "invisible",
									)}
								>
									{item.changeText ?? "-0.00%"}
								</span>
							</button>
							<button
								type="button"
								onClick={(event) => {
									event.stopPropagation();
									onRemove?.(item.name);
								}}
								aria-label={removeLabel?.(item.name)}
								className="absolute -top-0.5 -right-0.5 hidden size-3 cursor-pointer items-center justify-center text-fg-muted hover:text-fg group-hover/fav:flex"
							>
								<XIcon className="size-2.5" weight="bold" />
							</button>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
