import { cn } from "@/lib/cn";

export const menuPopupSurfaceClass =
	"rounded-24 border-trading-panel-stroke-card bg-overlay p-1 font-market-close shadow-overlay";

export const menuPopupSkinClass = cn(
	menuPopupSurfaceClass,
	"[&>[role=separator]]:mx-1 [&>[role=separator]]:bg-trading-panel-stroke-row",
	"[&_[role=presentation]]:px-3 [&_[role=presentation]]:text-2xs [&_[role=presentation]]:font-bold [&_[role=presentation]]:tracking-[0.4px] [&_[role=presentation]]:text-trading-panel-subtle",
	"[&_[role^=menuitem]]:gap-2.5 [&_[role^=menuitem]]:rounded-16 [&_[role^=menuitem]]:px-3 [&_[role^=menuitem]]:py-2 [&_[role^=menuitem]]:text-2sm [&_[role^=menuitem]]:font-medium",
	"[&_[role^=menuitem][data-highlighted]]:bg-trading-panel-hover [&_[role^=menuitem][data-disabled]]:text-fg-disabled",
	"max-[1000px]:[&_[role^=menuitem]]:min-h-11 max-[1000px]:[&_[role^=menuitem]]:text-sm",
);

export const menuPopupSelectionSkinClass = cn(
	menuPopupSkinClass,
	"[&_[role^=menuitem]]:text-trading-panel-muted",
	"[&_[role^=menuitem][aria-current=true]]:bg-trading-panel-card [&_[role^=menuitem][aria-current=true]]:font-bold [&_[role^=menuitem][aria-current=true]]:text-trading-panel-fg",
	"[&_[role=menuitemradio][data-checked]]:bg-trading-panel-card [&_[role=menuitemradio][data-checked]]:font-bold [&_[role=menuitemradio][data-checked]]:text-trading-panel-fg",
);
