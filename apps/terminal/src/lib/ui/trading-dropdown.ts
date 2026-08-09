import { cn } from "@/lib/cn";

export const tradingPanelDropdownPopupClass = cn(
	"min-w-[116px] rounded-[10px] border-trading-panel-stroke-card bg-surface p-1",
	"[&_[role=menuitem]]:rounded-[7px] [&_[role=menuitem]]:px-3 [&_[role=menuitem]]:py-2 [&_[role=menuitem]]:text-2sm [&_[role=menuitem]]:font-medium [&_[role=menuitem]]:text-trading-panel-muted",
	"[&_[role=menuitem][aria-current=true]]:bg-trading-panel-card [&_[role=menuitem][aria-current=true]]:font-bold [&_[role=menuitem][aria-current=true]]:text-trading-panel-fg",
	"[&_[role=menuitem]_svg]:hidden",
);
