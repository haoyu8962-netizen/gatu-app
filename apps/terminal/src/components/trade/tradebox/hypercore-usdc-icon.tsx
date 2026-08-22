import { HL_ICON_URL, USDC_ICON_URL } from "@/config/bridge";
import { cn } from "@/lib/cn";

export function HyperCoreUsdcIcon({ size = "md" }: { size?: "sm" | "md" }) {
	const iconSize = size === "sm" ? "size-5" : "size-8";
	const badgeSize = size === "sm" ? "size-2.5" : "size-3.5";

	return (
		<span className="relative shrink-0" aria-hidden="true">
			<img src={USDC_ICON_URL} alt="" className={cn(iconSize, "rounded-full")} />
			<img
				src={HL_ICON_URL}
				alt=""
				className={cn("absolute -right-0.5 -bottom-0.5 rounded-full border border-overlay", badgeSize)}
			/>
		</span>
	);
}
