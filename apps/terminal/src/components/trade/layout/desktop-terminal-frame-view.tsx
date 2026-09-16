import type { ComponentPropsWithRef, ReactNode } from "react";
import { APP_HEADER_OFFSET_CLASS, APP_HEADER_PLUS_BANNER_OFFSET_CLASS } from "@/config/layout";
import { cn } from "@/lib/cn";

interface Props extends ComponentPropsWithRef<"div"> {
	bannerOffset?: boolean;
	banner?: ReactNode;
	header: ReactNode;
	notice?: ReactNode;
	workspace: ReactNode;
	footer: ReactNode;
}

export function DesktopTerminalFrameView({
	bannerOffset = false,
	banner,
	header,
	notice,
	workspace,
	footer,
	className,
	...rest
}: Props) {
	return (
		<div
			{...rest}
			className={cn(
				"bg-background text-fg min-h-dvh w-full flex flex-col overflow-x-hidden font-sans pb-8",
				bannerOffset ? APP_HEADER_PLUS_BANNER_OFFSET_CLASS : APP_HEADER_OFFSET_CLASS,
				bannerOffset && "testnet-bg",
				className,
			)}
		>
			{banner}
			{header}
			{notice}
			{workspace}
			{footer}
		</div>
	);
}
