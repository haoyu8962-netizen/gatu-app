import { infoPersistedKey } from "@gatu/hl-react";
import { Drawer, DrawerTrigger } from "@gatu/ui";
import { t } from "@lingui/core/macro";
import { useQueryClient } from "@tanstack/react-query";
import { Suspense, useCallback, useEffect, useId, useRef, useState } from "react";
import { Popover, PopoverTrigger } from "@/components/ui/popover";
import { useIsMobile } from "@/hooks/use-mobile";
import type { UnifiedMarketInfo } from "@/lib/hyperliquid";
import { createLazyComponent } from "@/lib/lazy";
import {
	MOBILE_TOKEN_SELECTOR_TRIGGER_CLASSNAME,
	TOKEN_SELECTOR_TRIGGER_CLASSNAME,
	TokenSelectorTriggerContent,
} from "./token-selector-trigger";

const TokenSelectorPopup = createLazyComponent(() => import("./token-selector-popup"), "TokenSelectorPopup");
const MARKET_METADATA_REFRESH_INTERVAL_MS = 5 * 60 * 1_000;

export type TokenSelectorProps = {
	selectedMarket: UnifiedMarketInfo | undefined;
	onValueChange: (value: string) => void;
};

export function TokenSelector({ selectedMarket, onValueChange }: TokenSelectorProps) {
	const isMobile = useIsMobile();
	const queryClient = useQueryClient();
	const headingId = useId();
	const [open, setOpen] = useState(false);
	const [hasOpened, setHasOpened] = useState(false);
	const lastMarketMetadataRefreshRef = useRef(0);
	const preloadPopup = useCallback(() => TokenSelectorPopup.preload?.(), []);
	const handleOpenChange = useCallback(
		(nextOpen: boolean) => {
			if (nextOpen) {
				setHasOpened(true);

				const now = Date.now();
				if (now - lastMarketMetadataRefreshRef.current >= MARKET_METADATA_REFRESH_INTERVAL_MS) {
					lastMarketMetadataRefreshRef.current = now;
					void queryClient.invalidateQueries({ queryKey: infoPersistedKey("spotMeta", undefined) });
					void queryClient.invalidateQueries({ queryKey: infoPersistedKey("perpDexs", undefined) });
					void queryClient.invalidateQueries({ queryKey: infoPersistedKey("allPerpMetas", undefined) });
				}
			}
			setOpen(nextOpen);
		},
		[queryClient],
	);

	useEffect(() => {
		if (hasOpened || typeof window === "undefined") return;

		if ("requestIdleCallback" in window) {
			const idleId = window.requestIdleCallback(() => preloadPopup(), { timeout: 2_000 });
			return () => window.cancelIdleCallback(idleId);
		}

		const timeoutId = window.setTimeout(preloadPopup, 1_000);
		return () => window.clearTimeout(timeoutId);
	}, [hasOpened, preloadPopup]);

	const popup =
		open || hasOpened ? (
			<Suspense fallback={null}>
				<TokenSelectorPopup
					selectedMarket={selectedMarket}
					onValueChange={onValueChange}
					open={open}
					onOpenChange={handleOpenChange}
					mobile={isMobile}
					headingId={headingId}
				/>
			</Suspense>
		) : null;

	if (isMobile) {
		return (
			<Drawer side="bottom" open={open} onOpenChange={handleOpenChange}>
				<DrawerTrigger
					role="combobox"
					aria-expanded={open}
					aria-label={t`Select token`}
					className={MOBILE_TOKEN_SELECTOR_TRIGGER_CLASSNAME}
					onPointerEnter={preloadPopup}
					onPointerDown={preloadPopup}
					onFocus={preloadPopup}
				>
					<TokenSelectorTriggerContent selectedMarket={selectedMarket} mobile />
				</DrawerTrigger>
				{popup}
			</Drawer>
		);
	}

	return (
		<Popover open={open} onOpenChange={handleOpenChange}>
			<PopoverTrigger asChild>
				<button
					type="button"
					role="combobox"
					aria-expanded={open}
					aria-label={t`Select token`}
					className={TOKEN_SELECTOR_TRIGGER_CLASSNAME}
					onPointerEnter={preloadPopup}
					onPointerDown={preloadPopup}
					onFocus={preloadPopup}
				>
					<TokenSelectorTriggerContent selectedMarket={selectedMarket} />
				</button>
			</PopoverTrigger>
			{popup}
		</Popover>
	);
}
