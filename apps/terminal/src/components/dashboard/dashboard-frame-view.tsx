import type { ReactNode } from "react";
import type { DashboardFramePreset } from "@/config/dashboard-frames";
import { APP_HEADER_OFFSET_CLASS, APP_HEADER_PLUS_BANNER_OFFSET_CLASS } from "@/config/layout";
import { cn } from "@/lib/cn";

interface Props extends DashboardFramePreset {
	header: ReactNode;
	main: ReactNode;
	footer?: ReactNode;
	isMobile?: boolean;
	headerOffset?: boolean;
	bannerOffset?: boolean;
	testnet?: boolean;
}

export function DashboardFrameView({
	canvasClassName,
	header,
	main,
	mainClassName,
	footer,
	isMobile,
	headerOffset = true,
	bannerOffset = false,
	testnet = false,
}: Props) {
	return (
		<div
			className={cn(
				canvasClassName,
				isMobile === undefined && "min-[1001px]:pb-8",
				isMobile === false && "pb-8",
				headerOffset &&
					isMobile === false &&
					(bannerOffset ? APP_HEADER_PLUS_BANNER_OFFSET_CLASS : APP_HEADER_OFFSET_CLASS),
				headerOffset && isMobile === undefined && (bannerOffset ? "min-[1001px]:pt-[5.5rem]" : "min-[1001px]:pt-14"),
				testnet && "testnet-bg",
			)}
		>
			{header}
			<main className={mainClassName}>{main}</main>
			{footer}
		</div>
	);
}
