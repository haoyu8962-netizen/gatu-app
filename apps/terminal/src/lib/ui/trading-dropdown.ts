import { cn } from "@/lib/cn";
import { menuPopupSelectionSkinClass } from "@/lib/ui/menu-popup-skin";

export const tradingPanelDropdownPopupClass = cn(
	menuPopupSelectionSkinClass,
	"min-w-[116px] [&_[role=menuitem]_svg]:hidden",
);
