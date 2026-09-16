import * as mobileChrome from "@/components/trade/mobile/mobile-chrome-classes";
import { cn } from "@/lib/cn";

export type TradingCtaVariant = "buy" | "sell" | "cyan";

export function getTradingCtaIntent(variant: TradingCtaVariant): "brand" | "neutral" | "error" {
	if (variant === "cyan") return "brand";
	if (variant === "buy") return "neutral";
	return "error";
}

export function getTradingCtaClass(variant: TradingCtaVariant): string {
	if (variant === "cyan") {
		return cn(
			mobileChrome.ctaConnect,
			"data-disabled:bg-trading-panel-neutral-disabled-fill data-disabled:text-trading-panel-on-disabled",
			mobileChrome.ctaConnectDark,
		);
	}
	if (variant === "buy") {
		return cn(
			"bg-trading-panel-success-fill text-trading-panel-on-success hover:not-data-disabled:bg-trading-panel-success-fill/90",
			"data-disabled:bg-trading-panel-success-disabled-fill data-disabled:text-trading-panel-on-disabled",
		);
	}
	return cn(
		"bg-trading-panel-error-fill text-trading-panel-on-error hover:not-data-disabled:bg-trading-panel-error-fill/90",
		"data-disabled:bg-trading-panel-error-disabled-fill data-disabled:text-trading-panel-on-disabled",
	);
}
