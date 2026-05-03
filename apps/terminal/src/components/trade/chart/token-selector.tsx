import { Drawer, DrawerTrigger } from "@hypeterminal/ui";
import { t } from "@lingui/core/macro";
import { Suspense, useId, useState } from "react";
import { Popover, PopoverTrigger } from "@/components/ui/popover";
import { useIsMobile } from "@/hooks/use-mobile";
import type { UnifiedMarketInfo } from "@/lib/hyperliquid";
import { createLazyComponent } from "@/lib/lazy";
import { TOKEN_SELECTOR_TRIGGER_CLASSNAME, TokenSelectorTriggerContent } from "./token-selector-trigger";

const TokenSelectorPopup = createLazyComponent(() => import("./token-selector-popup"), "TokenSelectorPopup");

export type TokenSelectorProps = {
	selectedMarket: UnifiedMarketInfo | undefined;
	onValueChange: (value: string) => void;
};

export function TokenSelector({ selectedMarket, onValueChange }: TokenSelectorProps) {
	const isMobile = useIsMobile();
	const headingId = useId();
	const [open, setOpen] = useState(false);
	const preloadPopup = () => TokenSelectorPopup.preload?.();
	const popup = open ? (
		<Suspense fallback={null}>
			<TokenSelectorPopup
				selectedMarket={selectedMarket}
				onValueChange={onValueChange}
				open={open}
				onOpenChange={setOpen}
				mobile={isMobile}
				headingId={headingId}
			/>
		</Suspense>
	) : null;

	if (isMobile) {
		return (
			<Drawer side="bottom" open={open} onOpenChange={setOpen}>
				<DrawerTrigger
					role="combobox"
					aria-expanded={open}
					aria-label={t`Select token`}
					className={TOKEN_SELECTOR_TRIGGER_CLASSNAME}
					onPointerEnter={preloadPopup}
					onFocus={preloadPopup}
				>
					<TokenSelectorTriggerContent selectedMarket={selectedMarket} />
				</DrawerTrigger>
				{popup}
			</Drawer>
		);
	}

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					role="combobox"
					aria-expanded={open}
					aria-label={t`Select token`}
					className={TOKEN_SELECTOR_TRIGGER_CLASSNAME}
					onPointerEnter={preloadPopup}
					onFocus={preloadPopup}
				>
					<TokenSelectorTriggerContent selectedMarket={selectedMarket} />
				</button>
			</PopoverTrigger>
			{popup}
		</Popover>
	);
}
