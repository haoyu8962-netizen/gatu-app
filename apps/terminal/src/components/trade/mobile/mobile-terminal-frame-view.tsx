import type { ComponentPropsWithRef, ReactNode } from "react";
import { cn } from "@/lib/cn";

export const terminal = "mobile-terminal fixed inset-0 w-full flex flex-col bg-background text-fg font-sans";
export const workspace = "flex-1 min-h-0 flex flex-col overflow-hidden pl-[var(--sal)] pr-[var(--sar)]";
export const pageSurface = "h-full min-h-0 bg-background [overflow-anchor:none]";
export const pageScroll = "overflow-y-auto overscroll-y-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

interface Props extends Omit<ComponentPropsWithRef<"div">, "content"> {
	header: ReactNode;
	content: ReactNode;
	nav: ReactNode;
}
export function MobileTerminalFrameView({ header, content, nav, className, ...props }: Props) {
	return (
		<div {...props} className={cn(terminal, className)}>
			{header}
			{content}
			{nav}
		</div>
	);
}
export function MobileWorkspaceView({ children }: { children: ReactNode }) {
	return <main className={workspace}>{children}</main>;
}
export function MobilePageView({ children }: { children: ReactNode }) {
	return <div className={cn(pageSurface, pageScroll)}>{children}</div>;
}
